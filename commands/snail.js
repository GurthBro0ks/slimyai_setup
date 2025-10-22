// commands/snail.js
// CommonJS – discord.js v14
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const costs = require("../supersnail-costs.js");
const database = require("../lib/database");
const metrics = require("../lib/metrics");
const logger = require("../lib/logger");
const { handleCodes } = require("../lib/snail-codes");
const fetch = require("node-fetch");
const sharp = require("sharp");
const { detectTypeAndRegions } = require("../lib/screen-detector");
const { extractRadar, bottleneckFrom } = require("../lib/radar-extractor");
const {
  detectActiveLoadout,
  extractGearIcons,
} = require("../lib/loadout-extractor");
const { extractRelicIcons } = require("../lib/compass-extractor");
const {
  findActiveSnapshot,
  getOrCreateSnapshot,
  upsertSnapshotPart,
  getSnapshotParts,
  finalizeSnapshot,
} = require("../lib/snapshots");
const { upsertUserLoadout } = require("../lib/loadouts");
const layout = require("../lib/layouts/supersnail.json");
const { analyzeImage } = require("../lib/vision");
const { setVisionFallback } = require("../lib/icon-match");
const { recordMetrics } = require("../lib/analyze-metrics");
const { runSnailStats } = require("./helpers/snail-stats");
const REQUIRED_TYPES = ["STATS_MAIN", "LOADOUT_GEAR", "COMPASS_RELICS"];
const TYPE_LABELS = {
  STATS_MAIN: "Pentagon Stats",
  LOADOUT_GEAR: "Loadout & Gear",
  COMPASS_RELICS: "Compass Relics",
};

const pendingApprovals = new Map();
const PENDING_TTL_MS = 15 * 60 * 1000;

setVisionFallback(async () => null);

function rememberPending(entry) {
  const id = uuidv4();
  const expiresAt = Date.now() + PENDING_TTL_MS;
  pendingApprovals.set(id, { ...entry, expiresAt });

  const timeout = setTimeout(() => {
    const current = pendingApprovals.get(id);
    if (current && current.expiresAt <= Date.now()) {
      pendingApprovals.delete(id);
    }
  }, PENDING_TTL_MS);
  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  return id;
}

function pullPending(id) {
  const pending = pendingApprovals.get(id);
  if (!pending) return null;
  if (pending.expiresAt <= Date.now()) {
    pendingApprovals.delete(id);
    return null;
  }
  pendingApprovals.delete(id);
  return pending;
}

function peekPending(id) {
  const pending = pendingApprovals.get(id);
  if (!pending) return null;
  if (pending.expiresAt <= Date.now()) {
    pendingApprovals.delete(id);
    return null;
  }
  return pending;
}

const enableSheetsSync = process.env.FEATURE_SHEETS === "true";

// Small helper to pick the right tier function
function pickCalc(tier) {
  if (tier === 5) return costs.formT5Calc;
  if (tier === 6) return costs.formT6Calc;
  if (tier === 7) return costs.formT7Calc;
  if (tier === 8) return costs.formT8Calc;
  throw new Error("Tier must be 5, 6, 7, or 8");
}

// Parse comma list: "l1,r1,l2,compass,r2,l3,r3,ritual"
function parseLevels(csv) {
  const parts = csv.split(",").map((s) => Number(String(s).trim()));
  if (parts.length !== 8 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(
      "Levels must be 8 comma-separated numbers: l1,r1,l2,compass,r2,l3,r3,ritual",
    );
  }
  const [l1, r1, l2, compass, r2, l3, r3, ritual] = parts;
  return { l1, r1, l2, compass, r2, l3, r3, ritual };
}

function formatValue(value) {
  return value === null || value === undefined
    ? "???"
    : Number(value).toLocaleString();
}

function formatStatsBlock(stats = {}) {
  const primary = [
    `HP: ${formatValue(stats.hp)}`,
    `ATK: ${formatValue(stats.atk)}`,
    `DEF: ${formatValue(stats.def)}`,
    `RUSH: ${formatValue(stats.rush)}`,
  ];

  const pentagon = [
    `FAME: ${formatValue(stats.fame)}`,
    `TECH: ${formatValue(stats.tech)}`,
    `ART: ${formatValue(stats.art)}`,
    `CIV: ${formatValue(stats.civ)}`,
    `FTH: ${formatValue(stats.fth)}`,
  ];

  return `**Primary**\n${primary.join(" \u2022 ")}\n\n**Pentagon**\n${pentagon.join(" \u2022 ")}`;
}

function formatStatsLine(stats = {}) {
  const fields = [
    "hp",
    "atk",
    "def",
    "rush",
    "fame",
    "tech",
    "art",
    "civ",
    "fth",
  ];
  return fields
    .map((key) => `${key.toUpperCase()}: ${formatValue(stats[key])}`)
    .join(" \u2022 ");
}

const WHY_NEEDED = {
  STATS_MAIN:
    "Needed for real Bottleneck & readiness (AFFCT numbers from the pentagon).",
  LOADOUT_GEAR:
    "Needed to analyze what you’re actually wearing (active loadout & gear).",
  COMPASS_RELICS:
    "Needed for compass bonuses and element checks (FAME/ART/CIV/TECH/FTH relics).",
};

const MISSING_TIPS = {
  STATS_MAIN:
    "Open the main character screen showing the pentagon. Ensure **FAME/TECH/ART/CIV/FTH** labels and numbers are visible.",
  LOADOUT_GEAR:
    "Open loadouts so the **three circle buttons** are visible at the bottom. The **red** one is the active loadout.",
  COMPASS_RELICS:
    "Open **Compass** and show all five relic slots (**FAME/ART/CIV/TECH/FTH**) clearly.",
};

const FOOTER = [
  "— — —",
  "_Work in progress: results may evolve as detection improves._",
].join("\n");

function stripJsonFence(text) {
  let cleaned = String(text || "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

function parseRadarJson(
  text,
  fallback = { FAME: 0, TECH: 0, ART: 0, CIV: 0, FTH: 0 },
) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(stripJsonFence(text));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

function formatNumber(value) {
  if (value === null || typeof value === "undefined") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString();
}

function formatRadarPreview(radar) {
  if (!radar) return "Radar: not detected";
  if (radar.readable === false) {
    return "Radar: detected but unreadable — retake with labels visible.";
  }
  const parts = ["FAME", "TECH", "ART", "CIV", "FTH"].map(
    (stat) => `${stat} ${formatNumber(radar[stat])}`,
  );
  const confidence = radar.confidence ? ` (${radar.confidence}% conf)` : "";
  return `Radar: ${parts.join(" • ")}${confidence}`;
}

function formatGearPreview(loadoutSlot, items = []) {
  if (!items.length) return "Gear: not detected";
  const avg = Math.round(
    items.reduce((sum, item) => sum + (item.confidence || 0), 0) / items.length,
  );
  const header = loadoutSlot
    ? `Active Loadout: ${loadoutSlot} (${avg}% avg confidence)`
    : "Active Loadout: not detected";

  const lines = items.map(
    (item) =>
      `• ${item.item_slot.toUpperCase()}: ${item.canonical_name} (${item.confidence || 0}%)`,
  );
  return [header, ...lines].join("\n");
}

function formatRelicPreview(items = []) {
  if (!items.length) return "Relics: not detected";
  return items
    .map(
      (item) =>
        `• ${item.item_slot}: ${item.canonical_name} (${item.confidence || 0}%)`,
    )
    .join("\n");
}

function buildFullAnalysis({
  loadoutSlot,
  loadoutItems = [],
  relicItems = [],
  radar = null,
}) {
  const lines = ["**Full Analysis (3/3)**"];

  if (loadoutItems.length) {
    const avgGearConfidence = Math.round(
      loadoutItems.reduce((sum, item) => sum + (item.confidence || 0), 0) /
        loadoutItems.length,
    );
    lines.push(
      loadoutSlot
        ? `Active Loadout: ${loadoutSlot} (${avgGearConfidence}% avg confidence)`
        : "Active Loadout: detected gear, but active slot unknown.",
    );
    lines.push(
      ...loadoutItems.map(
        (item) =>
          `- ${item.item_slot.toUpperCase()}: ${item.canonical_name} (${item.confidence || 0}%)`,
      ),
    );
  } else {
    lines.push("Active Loadout: not detected");
  }

  if (relicItems.length) {
    lines.push(
      "",
      "Relics:",
      ...relicItems.map(
        (item) =>
          `- ${item.item_slot}: ${item.canonical_name} (${item.confidence || 0}%)`,
      ),
    );
  } else {
    lines.push("", "Relics: not detected");
  }

  if (radar) {
    lines.push(
      "",
      `Radar: FAME ${formatNumber(radar.FAME)} • TECH ${formatNumber(radar.TECH)} • ART ${formatNumber(radar.ART)} • CIV ${formatNumber(radar.CIV)} • FTH ${formatNumber(radar.FTH)}${radar.confidence ? ` (${radar.confidence}% conf)` : ""}`,
    );
    const bottleneckInfo = bottleneckFrom(radar);
    if (bottleneckInfo) {
      lines.push(
        `Bottleneck: ${bottleneckInfo.stat} (${bottleneckInfo.behindPct}% behind)`,
      );
    } else {
      lines.push("Bottleneck: Unknown");
    }
  } else {
    lines.push("", "Radar: not captured");
  }

  lines.push("", "All required screenshots captured. ✅");
  return lines;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snail")
    .setDescription("Supersnail costs calculator (T5–T8)")
    .addSubcommand((sc) =>
      sc
        .setName("test")
        .setDescription(
          "Run a quick test example to verify the command is wired",
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("calc")
        .setDescription("Calculate costs from your levels")
        .addIntegerOption((o) =>
          o
            .setName("tier")
            .setDescription("Tier 5–8")
            .setRequired(true)
            .addChoices(
              { name: "T5", value: 5 },
              { name: "T6", value: 6 },
              { name: "T7", value: 7 },
              { name: "T8", value: 8 },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("levels")
            .setDescription(
              'l1,r1,l2,compass,r2,l3,r3,ritual (e.g. "3,3,2,0,0,0,0,1")',
            )
            .setRequired(true),
        )
        .addNumberOption((o) =>
          o
            .setName("timemoda")
            .setDescription("Time mod A (default 1)")
            .setRequired(false),
        )
        .addNumberOption((o) =>
          o
            .setName("timemodb")
            .setDescription("Time mod B (seconds; default 0)")
            .setRequired(false),
        )
        .addNumberOption((o) =>
          o
            .setName("flattime")
            .setDescription("Flat time (minutes; default 0)")
            .setRequired(false),
        )
        .addNumberOption((o) =>
          o
            .setName("btadmod")
            .setDescription("BTAD multiplier (default 1)")
            .setRequired(false),
        )
        .addNumberOption((o) =>
          o
            .setName("cellmod")
            .setDescription("Cell multiplier (default 1)")
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName("dragon")
            .setDescription("If true, show per-species cells + BTADs + hours")
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("analyze")
        .setDescription("Analyze a single Super Snail screenshot")
        .addAttachmentOption((o) =>
          o
            .setName("screenshot")
            .setDescription("Upload exactly one Super Snail screenshot per run")
            .setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("analyze_help")
        .setDescription("Show examples & tips for screenshots needed"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("stats")
        .setDescription(
          "Show the combined Super Snail analysis from saved screenshots",
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("codes")
        .setDescription("View or copy active Super Snail codes")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Choose which codes to show")
            .addChoices(
              { name: "View Active Codes", value: "active" },
              { name: "Recent (7 Days)", value: "recent" },
              { name: "All (Archive)", value: "all" },
              { name: "Copy All (Game Format)", value: "copy" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("sheet")
        .setDescription("View saved Super Snail stats from Google Sheets")
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription(
              "User to view stats for (leave empty for your own stats)",
            )
            .setRequired(false),
        )
        .addIntegerOption((o) =>
          o
            .setName("limit")
            .setDescription("Number of entries to show (default: 5, max: 10)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("sheet-setup")
        .setDescription(
          "Show instructions for setting up Google Sheets integration",
        ),
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      console.log("[snail] received subcommand:", subcommand);

      if (subcommand === "test") {
        // A simple, known-good T6 example:
        // l1=3, r1=3, l2=2, compass=0, r2=0, l3=0, r3=0, ritual=1
        const result = costs.formT6Calc(
          3,
          3,
          2,
          0,
          0,
          0,
          0,
          1,
          1,
          0,
          0,
          1,
          1,
          false,
        );
        // result (non-dragon) is [formCells, btads, hours]
        const [formCells, btads, hours] = result;
        return interaction.reply({
          content:
            `✅ **/snail test**\n` +
            `**Tier:** 6\n` +
            `**Form Cells:** ${formCells.toLocaleString()}\n` +
            `**BTADs:** ${btads.toLocaleString()}\n` +
            `**Hours:** ${hours.toLocaleString()}`,
          ephemeral: true,
        });
      }

      if (subcommand === "codes") {
        return handleCodes(interaction);
      }

      if (subcommand === "analyze_help") {
        const requiredLines = REQUIRED_TYPES.map(
          (type) =>
            `• **${type}** — ${WHY_NEEDED[type]} \n  _${MISSING_TIPS[type]}_`,
        );
        const lines = [
          "**What we need for a full `/snail analyze`**",
          ...requiredLines,
          "",
          "**Workflow**",
          "• Run `/snail analyze` with one screenshot at a time.",
          "• Review the preview and click **Save Screenshot Data** if it looks correct.",
          "• Repeat for each required screen, then run `/snail stats` for the full breakdown.",
          "",
          "Tips:",
          "• Avoid tooltips covering numbers or icons.",
          "• Include the full UI area for each screenshot (no heavy cropping).",
          "",
          FOOTER,
        ];

        return interaction.reply({
          content: lines.join("\n"),
          ephemeral: true,
        });
      }

      if (subcommand === "analyze") {
        const startTime = Date.now();
        const attachment = interaction.options.getAttachment("screenshot");

        if (!attachment) {
          metrics.trackCommand("snail-analyze", Date.now() - startTime, false);
          return interaction.reply({
            content: "⚠️ Please attach exactly one Super Snail screenshot.",
            ephemeral: true,
          });
        }

        if (
          !attachment.contentType ||
          !attachment.contentType.startsWith("image/")
        ) {
          metrics.trackCommand("snail-analyze", Date.now() - startTime, false);
          return interaction.reply({
            content:
              "⚠️ The attachment must be an image file (PNG, JPG, WEBP).",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const guildId = interaction.guildId || null;
        const username = interaction.user.username;
        const guildName = interaction.guild?.name || "Unknown";
        const warnings = [];

        try {
          const response = await fetch(attachment.url);
          if (!response.ok) {
            throw new Error(`download failed (${response.status})`);
          }

          const buffer = await response.buffer();
          const detection = await detectTypeAndRegions(buffer);
          if (!detection?.type || !TYPE_LABELS[detection.type]) {
            metrics.trackCommand(
              "snail-analyze",
              Date.now() - startTime,
              false,
            );
            return interaction.editReply({
              content:
                "❌ Unable to recognize this screenshot. Please retake and ensure the full UI is visible.",
              components: [],
            });
          }

          const meta = await sharp(buffer).metadata();
          const width = meta.width || 0;
          const height = meta.height || 0;

          let resolvedType = detection.type;
          let fields = {};
          let summaryLines = [];
          const processedTypes = new Set();
          const KEYS = ["FAME", "TECH", "ART", "CIV", "FTH"];

          const attemptType = async (type) => {
            if (!type || processedTypes.has(type)) return false;
            processedTypes.add(type);

            try {
              if (type === "STATS_MAIN") {
                const radar = await extractRadar(
                  buffer,
                  detection.rois,
                  width,
                  height,
                  async (cropBuffer) => {
                    try {
                      const dataUrl = `data:image/png;base64,${cropBuffer.toString("base64")}`;
                      const text = await analyzeImage({
                        imageUrl: dataUrl,
                        prompt:
                          'Read the Super Snail AFFCT radar. Return JSON like {"FAME":123,"TECH":123,"ART":123,"CIV":123,"FTH":123}.',
                        systemPrompt:
                          "You are a precise OCR utility. Only respond with strict JSON.",
                      });
                      return parseRadarJson(text, {
                        FAME: 0,
                        TECH: 0,
                        ART: 0,
                        CIV: 0,
                        FTH: 0,
                      });
                    } catch (err) {
                      warnings.push(`Radar OCR failed: ${err.message}`);
                      return {
                        FAME: 0,
                        TECH: 0,
                        ART: 0,
                        CIV: 0,
                        FTH: 0,
                        readable: false,
                      };
                    }
                  },
                );
                const hasValues = KEYS.some(
                  (key) => Number(radar?.[key] ?? 0) > 0,
                );
                if (hasValues) {
                  fields = { ...fields, radar };
                  summaryLines = [formatRadarPreview(radar)];
                  const bottleneckInfo = bottleneckFrom(radar);
                  if (bottleneckInfo) {
                    summaryLines.push(
                      `Bottleneck insight: ${bottleneckInfo.stat} is ${bottleneckInfo.behindPct}% behind.`,
                    );
                  }
                  resolvedType = "STATS_MAIN";
                  return true;
                }
              } else if (type === "LOADOUT_GEAR") {
                const loadout = await detectActiveLoadout(
                  buffer,
                  layout,
                  width,
                  height,
                );
                const items = await extractGearIcons(
                  buffer,
                  layout.gear_slots,
                  width,
                  height,
                );
                const hasKnownGear = Array.isArray(items)
                  ? items.some(
                      (item) =>
                        item &&
                        item.canonical_name &&
                        item.canonical_name !== "Unknown" &&
                        (item.confidence ?? 0) >= 50,
                    )
                  : false;
                if (hasKnownGear || loadout) {
                  fields = { ...fields, loadout, items };
                  summaryLines = [formatGearPreview(loadout, items)];
                  resolvedType = "LOADOUT_GEAR";
                  return true;
                }
              } else if (type === "COMPASS_RELICS") {
                const items = await extractRelicIcons(
                  buffer,
                  layout.relic_slots,
                  width,
                  height,
                );
                const hasKnownRelic = Array.isArray(items)
                  ? items.some(
                      (item) =>
                        item &&
                        item.canonical_name &&
                        item.canonical_name !== "Unknown" &&
                        (item.confidence ?? 0) >= 45,
                    )
                  : false;
                if (hasKnownRelic) {
                  fields = { ...fields, items };
                  summaryLines = [formatRelicPreview(items)];
                  resolvedType = "COMPASS_RELICS";
                  return true;
                }
              }
            } catch (err) {
              warnings.push(`${type} extractor failed: ${err.message}`);
            }
            return false;
          };

          await attemptType(detection.type);
          if (summaryLines.length === 0) {
            const fallbackOrder = Array.from(
              new Set([
                ...(Array.isArray(detection.candidates)
                  ? detection.candidates
                  : []),
                "STATS_MAIN",
                "LOADOUT_GEAR",
                "COMPASS_RELICS",
              ]),
            );
            for (const fallback of fallbackOrder) {
              if (summaryLines.length > 0) break;
              await attemptType(fallback);
            }
          }

          if (summaryLines.length === 0) {
            summaryLines.push(
              "No actionable data detected yet. Try a clearer screenshot with the full UI visible.",
            );
          }

          const pendingId = rememberPending({
            userId,
            guildId,
            username,
            guildName,
            attachmentUrl: attachment.url,
            type: resolvedType,
            fields,
            quality: detection.quality || 0,
            warnings,
          });

          const detectedLabel =
            TYPE_LABELS[resolvedType] || "Snail Analyze Preview";
          const detectedSource = TYPE_LABELS[detection.type] || detection.type;

          const lines = [
            resolvedType !== detection.type
              ? `**${detectedLabel}** _(initially detected as ${detectedSource})_`
              : `**${detectedLabel}**`,
            ...summaryLines,
            "",
            "_Click **Save Screenshot Data** if everything looks correct. Upload the next required screen afterwards._",
            "_When all screenshots are saved, run `/snail stats` to see the full breakdown._",
            "",
            FOOTER,
          ];

          if (warnings.length) {
            lines.splice(
              lines.length - 2,
              0,
              "Warnings:",
              ...warnings.map((w) => `• ${w}`),
              "",
            );
          }

          const previewEmbed = new EmbedBuilder()
            .setTitle(`${detectedLabel}`)
            .setColor(0x00ae86)
            .setDescription(summaryLines.join("\n").slice(0, 4000));
          if (attachment.url) {
            previewEmbed.setImage(attachment.url);
          }
          if (warnings.length) {
            previewEmbed.setFooter({ text: `Warnings: ${warnings.length}` });
          }

          const components = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`snail:approve:${pendingId}`)
                .setLabel("Save Screenshot Data")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`snail:cancel:${pendingId}`)
                .setLabel("Discard")
                .setStyle(ButtonStyle.Secondary),
            ),
          ];

          metrics.trackCommand("snail-analyze", Date.now() - startTime, true);
          return interaction.editReply({
            content: lines.join("\n"),
            embeds: [previewEmbed],
            components,
          });
        } catch (err) {
          metrics.trackCommand("snail-analyze", Date.now() - startTime, false);
          metrics.trackError("snail_analyze", err.message);
          logger.error("Snail analyze failed", {
            userId: interaction.user.id,
            error: err.message,
          });
          console.error("[snail] analyze error:", err);
          return interaction.editReply({
            content: `❌ Analysis failed: ${err.message}`,
            components: [],
          });
        }
      }

      if (subcommand === "stats") {
        return runSnailStats({
          interaction,
          metrics,
          database,
          findActiveSnapshot,
          getSnapshotParts,
          finalizeSnapshot,
          REQUIRED_TYPES,
          TYPE_LABELS,
          WHY_NEEDED,
          buildFullAnalysis,
          formatStatsBlock,
          formatStatsLine,
          FOOTER,
        });
      }

      if (subcommand === "sheet") {
        await interaction.deferReply({ ephemeral: true });

        try {
          const targetUser =
            interaction.options.getUser("user") || interaction.user;
          const limit = Math.min(
            interaction.options.getInteger("limit") || 5,
            10,
          );
          const entries = await database.getRecentSnailStats(
            targetUser.id,
            interaction.guildId,
            limit,
          );

          if (entries.length === 0) {
            return interaction.editReply({
              content: `📊 No saved stats found for **${targetUser.username}** yet.\n\nUse \`/snail analyze\` to record new data.`,
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0x00ae86)
            .setTitle(`🐌 Super Snail Stats - ${targetUser.username}`)
            .setDescription(
              `Showing ${entries.length} most recent ${entries.length === 1 ? "entry" : "entries"}`,
            )
            .setTimestamp();

          entries.forEach((entry) => {
            const date = entry.createdAt
              ? new Date(entry.createdAt)
              : new Date();
            const dateStr =
              date.toLocaleDateString() +
              " " +
              date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
            embed.addFields({
              name: `📅 ${dateStr}`,
              value: formatStatsLine(entry.stats),
              inline: false,
            });
          });

          if (enableSheetsSync) {
            const sheetsInfo = await database.getSheetsConsent(
              targetUser.id,
              interaction.guildId,
            );
            if (sheetsInfo.sheets_consent && sheetsInfo.sheet_id) {
              embed.setFooter({ text: "Google Sheets connected" });
              return interaction.editReply({
                embeds: [embed],
                content: `📊 Stored in database. Google Sheet: https://docs.google.com/spreadsheets/d/${sheetsInfo.sheet_id}`,
              });
            }
          }

          return interaction.editReply({
            embeds: [embed],
            content: "🗄️ Historical entries are stored in the database.",
          });
        } catch (err) {
          console.error("[snail] Error fetching stats:", err);
          return interaction.editReply({
            content: `❌ Failed to load stats: ${err.message}`,
          });
        }
      }

      if (subcommand === "sheet-setup") {
        if (!enableSheetsSync) {
          return interaction.reply({
            content:
              "📊 Sheets synchronization is currently disabled. All stats are stored directly in the database.",
            ephemeral: true,
          });
        }

        return interaction.reply({
          content:
            '📊 **Sheet Setup**\n\nTo enable automatic Google Sheets tracking:\n\n1. Use `/snail analyze` with a screenshot\n2. Click the "📊 Enable Google Sheets Tracking" button in the response\n3. A personal sheet will be created automatically\n\nAll future `/snail analyze` commands will auto-save to your sheet. Make sure the bot administrator has configured Google credentials first.',
          ephemeral: true,
        });
      }

      if (subcommand !== "calc") {
        return interaction.reply({
          content: `❌ Unknown subcommand: ${subcommand}`,
          ephemeral: true,
        });
      }

      // calc subcommand
      const tier = interaction.options.getInteger("tier", true);
      const csv = interaction.options.getString("levels", true);
      const dragon = interaction.options.getBoolean("dragon") ?? false;

      const timeModA = interaction.options.getNumber("timemoda") ?? 1;
      const timeModB = interaction.options.getNumber("timemodb") ?? 0; // seconds
      const flatTime = interaction.options.getNumber("flattime") ?? 0; // minutes
      const btadMod = interaction.options.getNumber("btadmod") ?? 1;
      const cellMod = interaction.options.getNumber("cellmod") ?? 1;

      const { l1, r1, l2, compass, r2, l3, r3, ritual } = parseLevels(csv);

      // Basic range checks
      const bad = [];
      const in01 = (n, max) => n >= 0 && n <= max;
      if (!in01(l1, 10)) bad.push("l1");
      if (!in01(r1, 10)) bad.push("r1");
      if (!in01(l2, 10)) bad.push("l2");
      // Compass top differs by tier: T5/6 max 3, T7/8 max 5
      const compassMax = tier <= 6 ? 3 : 5;
      if (!in01(compass, compassMax)) bad.push(`compass(0-${compassMax})`);
      if (!in01(r2, 10)) bad.push("r2");
      if (!in01(l3, 10)) bad.push("l3");
      if (!in01(r3, 10)) bad.push("r3");
      if (!in01(ritual, 1)) bad.push("ritual(0-1)");
      if (bad.length) {
        return interaction.reply({
          content: `❌ Invalid values: ${bad.join(", ")}`,
          ephemeral: true,
        });
      }

      const calc = pickCalc(tier);
      const res = calc(
        l1,
        r1,
        l2,
        compass,
        r2,
        l3,
        r3,
        ritual,
        timeModA,
        timeModB,
        flatTime,
        btadMod,
        cellMod,
        dragon,
      );

      // Format output
      let reply;
      if (dragon) {
        // [zombie, demon, angel, mutant, mecha, btads, hours]
        const [z, d, a, m, me, bt, hrs] = res;
        reply =
          `🧮 **Supersnail T${tier} (dragon mode)**\n` +
          `• **Zombie Cells:** ${z.toLocaleString()}\n` +
          `• **Demon Cells:** ${d.toLocaleString()}\n` +
          `• **Angel Cells:** ${a.toLocaleString()}\n` +
          `• **Mutant Cells:** ${m.toLocaleString()}\n` +
          `• **Mecha Cells:** ${me.toLocaleString()}\n` +
          `• **BTADs:** ${bt.toLocaleString()}\n` +
          `• **Hours:** ${hrs.toLocaleString()}`;
      } else {
        // [formCells, btads, hours]
        const [formCells, btads, hours] = res;
        reply =
          `🧮 **Supersnail T${tier}**\n` +
          `• **Form Cells:** ${formCells.toLocaleString()}\n` +
          `• **BTADs:** ${btads.toLocaleString()}\n` +
          `• **Hours:** ${hours.toLocaleString()}`;
      }

      return interaction.reply({ content: reply, ephemeral: true });
    } catch (err) {
      console.error("[snail] error:", err);
      return interaction.reply({
        content: `❌ Error: ${err.message || err}`,
        ephemeral: true,
      });
    }
  },
  async handleButton(interaction) {
    return handleSnailButton(interaction);
  },
};

async function handleSnailButton(interaction) {
  const [namespace, action, pendingId] = interaction.customId.split(":");
  if (namespace !== "snail" || !pendingId) {
    return false;
  }

  if (action === "approve") {
    const preview = peekPending(pendingId);
    if (!preview) {
      await interaction.update({
        content:
          "⌛ This preview has expired. Please run `/snail analyze` again with a fresh screenshot.",
        components: [],
      });
      return true;
    }

    if (interaction.user.id !== preview.userId) {
      await interaction.reply({
        content: `Only <@${preview.userId}> can save this screenshot.`,
        ephemeral: true,
      });
      return true;
    }

    const pending = pullPending(pendingId);

    try {
      const snapshotId = await getOrCreateSnapshot(
        pending.userId,
        pending.guildId,
      );
      await upsertSnapshotPart(
        snapshotId,
        pending.type,
        pending.attachmentUrl,
        pending.fields,
        pending.quality || 0,
      );

      if (pending.type === "LOADOUT_GEAR") {
        const loadoutSlot = pending.fields.loadout || null;
        const loadoutItems = Array.isArray(pending.fields.items)
          ? pending.fields.items
          : [];
        if (loadoutSlot && loadoutItems.length) {
          try {
            await upsertUserLoadout(pending.userId, loadoutSlot, loadoutItems);
          } catch (err) {
            logger.warn("[snail] Failed to persist loadout", {
              userId: pending.userId,
              error: err.message,
            });
          }
        }
      }

      const parts = await getSnapshotParts(snapshotId);
      const capturedTypes = new Set(parts.map((p) => p.part_type));
      const missingTypes = REQUIRED_TYPES.filter((t) => !capturedTypes.has(t));

      let radar = null;
      let loadoutItems = [];
      let relicItems = [];
      for (const part of parts) {
        if (part.part_type === "STATS_MAIN") {
          radar = part.fields?.radar || null;
        } else if (part.part_type === "LOADOUT_GEAR") {
          loadoutItems = Array.isArray(part.fields?.items)
            ? part.fields.items
            : [];
        } else if (part.part_type === "COMPASS_RELICS") {
          relicItems = Array.isArray(part.fields?.items)
            ? part.fields.items
            : [];
        }
      }

      const gearMap = Object.fromEntries(
        loadoutItems.map((item) => [item.item_slot, item]),
      );
      const relicMap = Object.fromEntries(
        relicItems.map((item) => [item.item_slot, item]),
      );

      await recordMetrics({
        userId: pending.userId,
        coverage: capturedTypes.size,
        confidences: {
          weapon: gearMap.weapon?.confidence,
          armor: gearMap.armor?.confidence,
          acc1: gearMap.acc1?.confidence,
          acc2: gearMap.acc2?.confidence,
          FAME: relicMap.FAME?.confidence,
          ART: relicMap.ART?.confidence,
          CIV: relicMap.CIV?.confidence,
          TECH: relicMap.TECH?.confidence,
          FTH: relicMap.FTH?.confidence,
        },
        radarConf: radar?.confidence ?? 0,
        firstRun: false,
      });

      const lines = [
        `✅ Saved **${TYPE_LABELS[pending.type]}** screenshot.`,
        `Captured ${capturedTypes.size}/${REQUIRED_TYPES.length} required screenshots.`,
      ];

      if (missingTypes.length) {
        lines.push(
          `Still need: ${missingTypes.map((type) => TYPE_LABELS[type]).join(", ")}.`,
        );
        lines.push(
          "Use `/snail analyze` again with the next required screenshot.",
        );
      } else {
        lines.push(
          "All required screenshots captured! Run `/snail stats` to view the full breakdown and recommendations.",
        );
      }

      if (pending.warnings?.length) {
        lines.push(
          "",
          "Warnings noted:",
          ...pending.warnings.map((w) => `• ${w}`),
        );
      }

      await interaction.update({
        content: lines.join("\n"),
        components: [],
      });
      return true;
    } catch (err) {
      logger.error("Snail save failed", {
        userId: pending.userId,
        error: err.message,
      });
      await interaction.update({
        content: `❌ Failed to save screenshot: ${err.message}`,
        components: [],
      });
      return true;
    }
  }

  if (action === "cancel") {
    const preview = peekPending(pendingId);
    if (!preview) {
      await interaction.update({
        content: "This preview was already handled or expired.",
        components: [],
      });
      return true;
    }

    if (interaction.user.id !== preview.userId) {
      await interaction.reply({
        content: `Only <@${preview.userId}> can discard this screenshot.`,
        ephemeral: true,
      });
      return true;
    }

    pullPending(pendingId);

    await interaction.update({
      content: "🗑️ Preview discarded. No data was saved.",
      components: [],
    });
    return true;
  }

  return false;
}
