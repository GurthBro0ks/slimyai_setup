const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const database = TEST ? stubs.database : require("../lib/database");
const logger = require("../lib/logger");
const metrics = TEST ? stubs.metrics : require("../lib/metrics");
const guildSettings = TEST
  ? stubs.guildSettings
  : require("../lib/guild-settings");
const clubStore = TEST ? stubs.clubStore : require("../lib/club-store");
const {
  getLatestForGuild,
  recomputeLatestForGuild,
} = clubStore;
const clubCorrections = require("../lib/club-corrections");
const clubSheets = require("../lib/club-sheets");
const { parseManageMembersImage } = require("../lib/club-vision");
const { canonicalize } = require("../lib/club-store");
const { getWeekId } = require("../lib/week-anchor");

function ensureDatabase() {
  if (!database.isConfigured()) {
    throw new Error("Database not configured for club admin.");
  }
}

function checkPermissions(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = process.env.CLUB_ROLE_ID;
  if (roleId && member.roles.cache.has(roleId)) return true;
  return false;
}

async function handleAliases(interaction) {
  ensureDatabase();

  const action = interaction.options.getString("action") || "view";

  if (action === "view") {
    const aliases = await database.query(
      `SELECT ca.alias_canonical,
              cm.name_display,
              cm.name_canonical,
              cl.total_power,
              cl.sim_power
       FROM club_aliases ca
       JOIN club_members cm ON cm.id = ca.member_id
       LEFT JOIN club_latest cl ON cl.member_id = ca.member_id AND cl.guild_id = ca.guild_id
       WHERE ca.guild_id = ?
       ORDER BY cm.name_display, ca.alias_canonical`,
      [interaction.guildId],
    );

    if (!aliases.length) {
      return interaction.reply({
        content: "No aliases configured for this guild.",
        ephemeral: true,
      });
    }

    const formatAlias = (alias) =>
      alias
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

    const embed = new EmbedBuilder()
      .setTitle("Club Member Aliases")
      .setColor(0x6366f1)
      .setDescription(`Found ${aliases.length} alias${aliases.length === 1 ? "" : "es"}`);

    // Group by canonical name
    const grouped = new Map();
    for (const alias of aliases) {
      const key = alias.name_canonical;
      if (!grouped.has(key)) {
        grouped.set(key, {
          display: alias.name_display,
          aliases: [],
          totalPower: alias.total_power,
          simPower: alias.sim_power,
        });
      }
      grouped.get(key).aliases.push(alias.alias_canonical);
    }

    const entries = Array.from(grouped.entries()).sort((a, b) =>
      a[1].display.localeCompare(b[1].display),
    );

    const formatMetricLine = (entry) => {
      const parts = [];
      if (entry.totalPower !== null && entry.totalPower !== undefined) {
        parts.push(`Total ${Number(entry.totalPower).toLocaleString()}`);
      }
      if (entry.simPower !== null && entry.simPower !== undefined) {
        parts.push(`Sim ${Number(entry.simPower).toLocaleString()}`);
      }
      return parts.join(" • ");
    };

    const fields = entries.slice(0, 10).map(([canonical, data]) => {
      const metrics = formatMetricLine(data);
      const aliasLines = data.aliases
        .slice(0, 10)
        .map((alias) => `• ${formatAlias(alias)} (\`${alias}\`)`);
      if (data.aliases.length > aliasLines.length) {
        aliasLines.push(`… +${data.aliases.length - aliasLines.length} more`);
      }
      const headerParts = [`${data.display} (${canonical})`];
      if (metrics) headerParts.push(metrics);
      return {
        name: headerParts.join(" — "),
        value: aliasLines.join("\n") || "`(no aliases recorded)`",
      };
    });

    for (const field of fields) {
      embed.addFields(field);
    }

    if (entries.length > fields.length) {
      embed.setFooter({
        text: `Showing ${fields.length} of ${entries.length} members with aliases`,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return interaction.reply({
    content: "Only 'view' action is currently implemented.",
    ephemeral: true,
  });
}

async function handleSnapshots(interaction) {
  ensureDatabase();

  const limitInput = interaction.options.getInteger("limit");
  const safeLimit = Math.min(Math.max(limitInput || 10, 1), 50);

  const snapshots = await database.query(
    `SELECT s.id, s.snapshot_at, s.created_by, s.notes,
            COUNT(m.id) AS metric_count
     FROM club_snapshots s
     LEFT JOIN club_metrics m ON m.snapshot_id = s.id
     WHERE s.guild_id = ?
     GROUP BY s.id, s.snapshot_at, s.created_by, s.notes
     ORDER BY s.snapshot_at DESC
     LIMIT ${safeLimit}`,
    [interaction.guildId],
  );

  if (!snapshots.length) {
    return interaction.reply({
      content: "No snapshots found for this guild.",
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Recent Club Snapshots (${snapshots.length})`)
    .setColor(0x3b82f6);

  const lines = [];
  for (const snap of snapshots) {
    const date = new Date(snap.snapshot_at).toISOString().split("T")[0];
    const time = new Date(snap.snapshot_at)
      .toISOString()
      .split("T")[1]
      .slice(0, 5);
    const base = `**#${snap.id}** • ${date} ${time} • <@${snap.created_by}> • ${snap.metric_count} metrics`;
    if (snap.notes) {
      lines.push(`${base} — ${snap.notes}`);
    } else {
      lines.push(base);
    }
  }

  embed.setDescription(lines.join("\n"));

  return interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction) {
  ensureDatabase();

  const urlOption = interaction.options.getString("url");
  const clearOption = interaction.options.getBoolean("clear") || false;
  const hasManagePermission = checkPermissions(interaction.member);

  if ((urlOption || clearOption) && !hasManagePermission) {
    return interaction.reply({
      content:
        "Only administrators or the configured club role can update settings.",
      ephemeral: true,
    });
  }

  if (clearOption) {
    await guildSettings.clearSheetConfig(interaction.guildId);
    return interaction.reply({
      content: "🧹 Cleared stored settings.",
      ephemeral: true,
    });
  }

  if (urlOption) {
    const normalized = guildSettings.normalizeSheetInput(urlOption);
    await database.ensureGuildRecord(
      interaction.guildId,
      interaction.guild?.name,
    );
    await guildSettings.setSheetConfig(interaction.guildId, normalized);
    return interaction.reply({
      content: "✅ Settings updated for this server.",
      ephemeral: true,
    });
  }

  // Pull club data from MySQL
  const latest = await getLatestForGuild(interaction.guildId);

  if (!latest.length) {
    const embed = new EmbedBuilder()
      .setTitle("📊 Club Stats")
      .setColor(0x6366f1)
      .setDescription(
        "No club data available yet.\n\n" +
          "Run `/club analyze` with Manage Members screenshots to generate your first snapshot.",
      )
      .setFooter({ text: "Run /club analyze to get started" });

    return interaction.editReply({ embeds: [embed] });
  }

  // Build summary from club_latest
  const totalMembers = latest.length;

  // Top 5 by Total Power
  const byTotal = [...latest]
    .filter((r) => r.total_power != null)
    .sort((a, b) => Number(b.total_power) - Number(a.total_power))
    .slice(0, 5);

  // Top 5 by SIM Power
  const bySim = [...latest]
    .filter((r) => r.sim_power != null)
    .sort((a, b) => Number(b.sim_power) - Number(a.sim_power))
    .slice(0, 5);

  // Most recent snapshot timestamp
  const latestAt = latest
    .map((r) => r.latest_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const lastUpdated = latestAt
    ? new Date(latestAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  const fmt = (n) =>
    n == null ? "—" : Number(n).toLocaleString("en-US");

  const embed = new EmbedBuilder()
    .setTitle("📊 Club Stats — Cormys Bar")
    .setColor(0x3b82f6)
    .addFields(
      {
        name: "Total Members",
        value: String(totalMembers),
        inline: true,
      },
      {
        name: "Last Updated",
        value: lastUpdated,
        inline: true,
      },
    )
    .addFields({
      name: "Top 5 by Total Power",
      value:
        byTotal.length
          ? byTotal
              .map(
                (r, i) =>
                  `${i + 1}. **${r.name_display}** — ${fmt(r.total_power)}`,
              )
              .join("\n")
          : "—",
      inline: false,
    })
    .addFields({
      name: "Top 5 by SIM Power",
      value:
        bySim.length
          ? bySim
              .map(
                (r, i) =>
                  `${i + 1}. **${r.name_display}** — ${fmt(r.sim_power)}`,
              )
              .join("\n")
          : "—",
      inline: false,
    })
    .setFooter({
      text: "Run /club analyze to update | /club export coming soon",
    });

  return interaction.editReply({ embeds: [embed] });
}

async function handleRollback(interaction) {
  ensureDatabase();

  await interaction.deferReply({ ephemeral: true });

  // Get the last snapshot
  const [lastSnapshot] = await database.query(
    `SELECT s.id, s.snapshot_at
     FROM club_snapshots s
     WHERE s.guild_id = ?
     ORDER BY s.snapshot_at DESC
     LIMIT 1`,
    [interaction.guildId],
  );

  if (!lastSnapshot) {
    return interaction.editReply({
      content: "❌ No snapshots found to rollback.",
    });
  }

  // Get the snapshot before that
  const [prevSnapshot] = await database.query(
    `SELECT s.id, s.snapshot_at
     FROM club_snapshots s
     WHERE s.guild_id = ? AND s.snapshot_at < ?
     ORDER BY s.snapshot_at DESC
     LIMIT 1`,
    [interaction.guildId, lastSnapshot.snapshot_at],
  );

  if (!prevSnapshot) {
    return interaction.editReply({
      content: "❌ Cannot rollback: only one snapshot exists.",
    });
  }

  // Delete the last snapshot (CASCADE will delete metrics)
  await database.query(`DELETE FROM club_snapshots WHERE id = ?`, [
    lastSnapshot.id,
  ]);

  // Recompute latest based on the previous snapshot
  await recomputeLatestForGuild(interaction.guildId, prevSnapshot.snapshot_at);

  logger.info("[club-admin] Rollback successful", {
    guildId: interaction.guildId,
    deletedSnapshotId: lastSnapshot.id,
    restoredSnapshotId: prevSnapshot.id,
  });

  const embed = new EmbedBuilder()
    .setTitle("✅ Rollback Successful")
    .setColor(0x22c55e)
    .setDescription(
      `Deleted snapshot #${lastSnapshot.id}\nRestored state from snapshot #${prevSnapshot.id}`,
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleExport(interaction) {
  ensureDatabase();

  await interaction.deferReply({ ephemeral: true });

  const latest = await getLatestForGuild(interaction.guildId);

  if (!latest.length) {
    return interaction.editReply({
      content: "❌ No data to export.",
    });
  }

  // Build CSV
  const header =
    "Name,Canonical,SimPower,TotalPower,SimPrev,TotalPrev,SimChange%,TotalChange%";
  const rows = latest.map((row) => {
    return [
      `"${row.name_display.replace(/"/g, '""')}"`,
      `"${row.name_canonical.replace(/"/g, '""')}"`,
      row.sim_power ?? "",
      row.total_power ?? "",
      row.sim_prev ?? "",
      row.total_prev ?? "",
      row.sim_pct_change ?? "",
      row.total_pct_change ?? "",
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const attachment = new AttachmentBuilder(Buffer.from(csv, "utf8"), {
    name: `club-data-${interaction.guildId}-${Date.now()}.csv`,
  });

  return interaction.editReply({
    content: `Exported ${latest.length} member(s) to CSV.`,
    files: [attachment],
  });
}

async function handleCorrect(interaction) {
  ensureDatabase();

  const memberInput = interaction.options.getString("member", true);
  const metric = interaction.options.getString("metric", true);
  const valueInput = interaction.options.getString("value", true);
  const weekInput = interaction.options.getString("week") || "auto";
  const reason = interaction.options.getString("reason");

  await interaction.deferReply({ ephemeral: true });

  // Resolve week ID
  const weekId = weekInput === "auto" ? getWeekId() : weekInput;

  // Resolve member key - try to find in database first
  let memberKey = null;
  let displayName = memberInput;

  // If it's a mention, extract the ID and look up the user
  const mentionMatch = memberInput.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    try {
      const user = await interaction.client.users.fetch(mentionMatch[1]);
      displayName = user.username;
      memberKey = canonicalize(displayName);
    } catch (err) {
      // Couldn't fetch user, use input as-is
      memberKey = canonicalize(memberInput);
    }
  } else {
    // Regular name input
    memberKey = canonicalize(memberInput);
    displayName = memberInput;
  }

  if (!memberKey) {
    return interaction.editReply({
      content: `❌ Could not normalize member name: ${memberInput}`,
    });
  }

  // Add the correction
  try {
    const result = await clubCorrections.addCorrection({
      guildId: interaction.guildId,
      weekId,
      memberKey,
      displayName,
      metric,
      value: valueInput,
      reason,
      source: 'command',
      createdBy: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Correction Added")
      .setColor(0x22c55e)
      .addFields(
        { name: "Member", value: displayName, inline: true },
        { name: "Metric", value: metric, inline: true },
        { name: "Week", value: weekId, inline: true },
        { name: "Value", value: result.replaced ? `${valueInput} (updated)` : valueInput },
      );

    if (reason) {
      embed.addFields({ name: "Reason", value: reason });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`recompute_${interaction.guildId}`)
        .setLabel("Recompute & Push Sheet")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄"),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    await interaction.editReply({
      content: `❌ Failed to add correction: ${err.message}`,
    });
  }
}

async function handleCorrectionsList(interaction) {
  ensureDatabase();

  const weekInput = interaction.options.getString("week") || "auto";
  const weekId = weekInput === "auto" ? getWeekId() : weekInput;

  await interaction.deferReply({ ephemeral: true });

  const corrections = await clubCorrections.listCorrections(
    interaction.guildId,
    weekId,
  );

  if (!corrections.length) {
    return interaction.editReply({
      content: `No corrections found for week ${weekId}`,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Corrections for Week ${weekId}`)
    .setColor(0x6366f1)
    .setDescription(`Found ${corrections.length} correction${corrections.length === 1 ? "" : "s"}`);

  // Group by metric
  const byMetric = { total: [], sim: [] };
  for (const corr of corrections) {
    byMetric[corr.metric].push(corr);
  }

  for (const metric of ['total', 'sim']) {
    if (byMetric[metric].length > 0) {
      const lines = byMetric[metric]
        .map((c) => {
          const parts = [
            `**${c.display_name}**: ${Number(c.value).toLocaleString()}`,
          ];
          if (c.reason) {
            parts.push(`_(${c.reason})_`);
          }
          parts.push(`[${c.source}]`);
          return parts.join(" ");
        })
        .join("\n");

      embed.addFields({
        name: `${metric.charAt(0).toUpperCase() + metric.slice(1)} Power`,
        value: lines.length > 1024 ? lines.substring(0, 1021) + "..." : lines,
      });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleCorrectionsRemove(interaction) {
  ensureDatabase();

  const memberInput = interaction.options.getString("member", true);
  const metric = interaction.options.getString("metric", true);
  const weekInput = interaction.options.getString("week") || "auto";

  await interaction.deferReply({ ephemeral: true });

  const weekId = weekInput === "auto" ? getWeekId() : weekInput;

  // Resolve member key
  let memberKey = null;
  const mentionMatch = memberInput.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    try {
      const user = await interaction.client.users.fetch(mentionMatch[1]);
      memberKey = canonicalize(user.username);
    } catch (err) {
      memberKey = canonicalize(memberInput);
    }
  } else {
    memberKey = canonicalize(memberInput);
  }

  if (!memberKey) {
    return interaction.editReply({
      content: `❌ Could not normalize member name: ${memberInput}`,
    });
  }

  const deleted = await clubCorrections.removeCorrection(
    interaction.guildId,
    weekId,
    memberKey,
    metric,
  );

  if (deleted) {
    await interaction.editReply({
      content: `✅ Removed correction for **${memberInput}** (${metric}) in week ${weekId}`,
    });
  } else {
    await interaction.editReply({
      content: `❌ No correction found for **${memberInput}** (${metric}) in week ${weekId}`,
    });
  }
}

async function handleCorrectionsSync(interaction) {
  ensureDatabase();

  await interaction.deferReply({ ephemeral: true });

  try {
    // Ensure Corrections tab exists
    const { spreadsheetId, sheetName } = await clubSheets.ensureCorrectionsTab(
      interaction.guildId,
    );

    // Sync corrections from sheet
    const result = await clubSheets.syncCorrectionsFromSheet(interaction.guildId);

    const lines = [
      `✅ Synced corrections from **${sheetName}** tab`,
      `• Added: ${result.added}`,
      `• Updated: ${result.updated}`,
      `• Skipped: ${result.skipped}`,
    ];

    if (result.errors.length > 0) {
      lines.push(`\n⚠️ Errors (${result.errors.length}):`);
      for (const error of result.errors.slice(0, 10)) {
        lines.push(`• ${error}`);
      }
      if (result.errors.length > 10) {
        lines.push(`• ... and ${result.errors.length - 10} more errors`);
      }
    }

    await interaction.editReply({ content: lines.join("\n") });
  } catch (err) {
    logger.error("[club-admin] Failed to sync corrections", {
      guildId: interaction.guildId,
      error: err.message,
    });
    await interaction.editReply({
      content: `❌ Failed to sync corrections: ${err.message}`,
    });
  }
}

async function handleRescanUser(interaction) {
  ensureDatabase();

  const memberInput = interaction.options.getString("member", true);
  const attachment = interaction.options.getAttachment("image", true);
  const metricInput = interaction.options.getString("metric") || "auto";
  const weekInput = interaction.options.getString("week") || "auto";
  const reason = `rescan from ${attachment.name}`;

  await interaction.deferReply({ ephemeral: true });

  const weekId = weekInput === "auto" ? getWeekId() : weekInput;

  // Validate attachment
  if (!attachment.contentType || !attachment.contentType.startsWith("image/")) {
    return interaction.editReply({
      content: "❌ Please provide a valid image file",
    });
  }

  // Resolve member key
  let memberKey = null;
  let displayName = memberInput;

  const mentionMatch = memberInput.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    try {
      const user = await interaction.client.users.fetch(mentionMatch[1]);
      displayName = user.username;
      memberKey = canonicalize(displayName);
    } catch (err) {
      memberKey = canonicalize(memberInput);
    }
  } else {
    memberKey = canonicalize(memberInput);
    displayName = memberInput;
  }

  if (!memberKey) {
    return interaction.editReply({
      content: `❌ Could not normalize member name: ${memberInput}`,
    });
  }

  try {
    // Run OCR on the image
    const forcedMetric = metricInput === "auto" ? null : metricInput;
    const ocrResult = await parseManageMembersImage(attachment.url, forcedMetric);

    // Find the member in the OCR results
    const memberRow = ocrResult.rows.find((row) => row.canonical === memberKey);

    if (!memberRow) {
      // Show what was found to help debugging
      const foundMembers = ocrResult.rows
        .map((r) => r.canonical)
        .slice(0, 10)
        .join(", ");

      return interaction.editReply({
        content:
          `❌ Could not find member **${displayName}** (key: ${memberKey}) in the screenshot.\n\n` +
          `Found members: ${foundMembers}${ocrResult.rows.length > 10 ? "..." : ""}`,
      });
    }

    // Add correction with the scanned value
    const result = await clubCorrections.addCorrection({
      guildId: interaction.guildId,
      weekId,
      memberKey,
      displayName: memberRow.display || displayName,
      metric: ocrResult.metric,
      value: memberRow.value,
      reason,
      source: 'rescan',
      createdBy: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Member Rescanned")
      .setColor(0x22c55e)
      .addFields(
        { name: "Member", value: memberRow.display || displayName, inline: true },
        { name: "Metric", value: ocrResult.metric, inline: true },
        { name: "Week", value: weekId, inline: true },
        {
          name: "Scanned Value",
          value: Number(memberRow.value).toLocaleString(),
        },
        { name: "Confidence", value: `${Math.round(memberRow.confidence * 100)}%` },
      );

    if (memberRow.corrected) {
      embed.addFields({
        name: "⚠️ Auto-corrected",
        value: `Parser applied correction: ${memberRow.parseReason || "unknown"}`,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`recompute_${interaction.guildId}`)
        .setLabel("Recompute & Push Sheet")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄"),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    logger.error("[club-admin rescan-user] Failed", { error: err.message });
    await interaction.editReply({
      content: `❌ Failed to rescan: ${err.message}`,
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("club-admin")
    .setDescription("Admin tools for club analytics")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("aliases")
        .setDescription("Manage member aliases")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(false)
            .addChoices({ name: "View", value: "view" }),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("snapshots")
        .setDescription("View recent snapshots")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of snapshots to show (1-50)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rollback")
        .setDescription("Rollback the last commit (dangerous!)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("export")
        .setDescription("Export full club data to CSV"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("Share or update the Google Sheets analytics link")
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Set or replace the spreadsheet URL or ID")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("clear")
            .setDescription("Remove the stored spreadsheet link")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("correct")
        .setDescription("Add or update a manual correction for a member")
        .addStringOption((option) =>
          option
            .setName("member")
            .setDescription("Member name or @mention")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("metric")
            .setDescription("Metric type")
            .setRequired(true)
            .addChoices(
              { name: "Total Power", value: "total" },
              { name: "SIM Power", value: "sim" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("value")
            .setDescription("Power value (accepts K/M/B notation)")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("week")
            .setDescription("Week ID (e.g., 2025-W43) or 'auto' for current week")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for correction")
            .setRequired(false),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("corrections")
        .setDescription("Manage corrections")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List active corrections for the current week")
            .addStringOption((option) =>
              option
                .setName("week")
                .setDescription("Week ID or 'auto' for current week")
                .setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a correction")
            .addStringOption((option) =>
              option
                .setName("member")
                .setDescription("Member name or @mention")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("metric")
                .setDescription("Metric type")
                .setRequired(true)
                .addChoices(
                  { name: "Total Power", value: "total" },
                  { name: "SIM Power", value: "sim" },
                ),
            )
            .addStringOption((option) =>
              option
                .setName("week")
                .setDescription("Week ID or 'auto' for current week")
                .setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("sync")
            .setDescription(
              "Sync corrections from the Corrections sheet tab to the database",
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rescan-user")
        .setDescription("Re-scan a single member from an uploaded image")
        .addStringOption((option) =>
          option
            .setName("member")
            .setDescription("Member name or @mention")
            .setRequired(true),
        )
        .addAttachmentOption((option) =>
          option
            .setName("image")
            .setDescription("Screenshot to analyze")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("metric")
            .setDescription("Metric type (auto-detect if not specified)")
            .setRequired(false)
            .addChoices(
              { name: "Auto-detect", value: "auto" },
              { name: "Total Power", value: "total" },
              { name: "SIM Power", value: "sim" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("week")
            .setDescription("Week ID or 'auto' for current week")
            .setRequired(false),
        ),
    ),
  async execute(interaction) {
    try {
      ensureDatabase();

      const subcommand = interaction.options.getSubcommand();
      const subcommandGroup = interaction.options.getSubcommandGroup(false);
      const urlOption = interaction.options.getString("url");
      const clearOption = interaction.options.getBoolean("clear") || false;

      const adminOnly = new Set([
        "aliases",
        "rollback",
        "export",
        "correct",
        "rescan-user",
      ]);
      let requiresElevated = adminOnly.has(subcommand) || subcommandGroup === "corrections";
      if (subcommand === "stats" && (urlOption || clearOption)) {
        requiresElevated = true;
      }

      if (requiresElevated && !checkPermissions(interaction.member)) {
        return interaction.reply({
          content:
            "You need administrator permissions or the configured club role to run that action.",
          ephemeral: true,
        });
      }

      if (subcommand === "aliases") {
        await handleAliases(interaction);
      } else if (subcommand === "snapshots") {
        await handleSnapshots(interaction);
      } else if (subcommand === "rollback") {
        await handleRollback(interaction);
      } else if (subcommand === "export") {
        await handleExport(interaction);
      } else if (subcommand === "stats") {
        await interaction.deferReply({ ephemeral: true });
        await handleStats(interaction);
      } else if (subcommand === "correct") {
        await handleCorrect(interaction);
      } else if (subcommandGroup === "corrections" && subcommand === "list") {
        await handleCorrectionsList(interaction);
      } else if (subcommandGroup === "corrections" && subcommand === "remove") {
        await handleCorrectionsRemove(interaction);
      } else if (subcommandGroup === "corrections" && subcommand === "sync") {
        await handleCorrectionsSync(interaction);
      } else if (subcommand === "rescan-user") {
        await handleRescanUser(interaction);
      } else {
        await interaction.reply({
          content: `Unknown subcommand: ${subcommand}`,
          ephemeral: true,
        });
      }

      metrics.trackCommand("club-admin", 0, true);
    } catch (err) {
      logger.error("[club-admin] Command failed", { error: err.message });
      const reply = {
        content: `❌ ${err.message}`,
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
