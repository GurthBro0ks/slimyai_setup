const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const database = TEST ? stubs.database : require("../lib/database");
const logger = require("../lib/logger");
const metrics = TEST ? stubs.metrics : require("../lib/metrics");
const clubStore = TEST ? stubs.clubStore : require("../lib/club-store");
const { getAggregates, getTopMovers, getLatestForGuild } = clubStore;

const DEFAULT_TOP = 10;
const MIN_TOP = 3;
const MAX_TOP = 25;

function ensureDatabase() {
  if (!database.isConfigured()) {
    throw new Error("Database not configured for club analytics.");
  }
}

function hasStatsPermission(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = process.env.CLUB_ROLE_ID;
  if (roleId && member.roles.cache.has(roleId)) return true;
  return false;
}

function toNumber(value) {
  if (value === null || typeof value === "undefined") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value) {
  const num = toNumber(value);
  if (num === null) return "—";
  return num.toLocaleString();
}

function formatPercent(value) {
  const num = toNumber(value);
  if (num === null) return "—";
  const arrow = num > 0 ? "▲" : num < 0 ? "▼" : "▶";
  return `${arrow} ${Math.abs(num).toFixed(2)}%`;
}

function formatDelta(current, previous) {
  const curr = toNumber(current);
  const prev = toNumber(previous);
  if (curr === null || prev === null) return "—";
  const delta = curr - prev;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()}`;
}

function buildBar(pctValue) {
  const pct = toNumber(pctValue);
  if (pct === null) return "   ";
  const capped = Math.max(Math.min(pct, 50), -50);
  const magnitude = Math.abs(capped);
  const levels = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
  const index = Math.min(7, Math.max(1, Math.round((magnitude / 50) * 7)));
  const block = levels[index];
  if (!block) return "   ";
  const prefix = pct >= 0 ? "+" : "−";
  return `${prefix}${block} `;
}

function pad(value, length, align = "left") {
  const str = String(value);
  if (str.length >= length) return str;
  const padding = " ".repeat(length - str.length);
  return align === "right" ? padding + str : str + padding;
}

function formatTableSide(rows, metricLabel, direction) {
  if (!rows.length)
    return `${direction === "up" ? "Top ↑" : "Top ↓"} (${metricLabel})\n(no data)`;

  const nameWidth =
    Math.max(10, ...rows.map((row) => row.name_display.length)) + 1;
  const lines = [];
  lines.push(`${direction === "up" ? "Top ↑" : "Top ↓"} (${metricLabel})`);
  lines.push(
    `${pad("", 3)} ${pad("Name", nameWidth)} ${pad("Δ%", 8)} ${pad("ΔAbs", 12, "right")} ${pad("Now", 12, "right")} Bar`,
  );

  rows.forEach((row, index) => {
    const pct = toNumber(row.pct_change);
    const pctStr =
      pct === null
        ? "—"
        : `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
    const delta = formatDelta(row.current_value, row.previous_value);
    const now = formatNumber(row.current_value);
    const bar = buildBar(pct);
    lines.push(
      `${pad(`${index + 1})`, 3)} ${pad(row.name_display, nameWidth)} ${pad(pctStr, 8)} ${pad(delta, 12, "right")} ${pad(now, 12, "right")} ${bar}`,
    );
  });

  return lines.join("\n");
}

function buildMoversSection(movers, metricLabel) {
  const parts = [];
  parts.push("```");
  parts.push(formatTableSide(movers.gainers, metricLabel, "up"));
  parts.push("");
  parts.push(formatTableSide(movers.losers, metricLabel, "down"));
  parts.push("```");
  return parts.join("\n");
}

function buildCsv(latest) {
  const header = "Name,SimPower,TotalPower,SimWoW%,TotalWoW%";
  const rows = latest.map((row) => {
    const simPct =
      row.sim_pct_change !== null && row.sim_pct_change !== undefined
        ? row.sim_pct_change
        : "";
    const totalPct =
      row.total_pct_change !== null && row.total_pct_change !== undefined
        ? row.total_pct_change
        : "";
    return [
      `"${row.name_display.replace(/"/g, '""')}"`,
      toNumber(row.sim_power) ?? "",
      toNumber(row.total_power) ?? "",
      simPct,
      totalPct,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("club-stats")
    .setDescription("Show weekly club stats with movers and aggregates.")
    .addStringOption((option) =>
      option
        .setName("metric")
        .setDescription("Which metric to display")
        .setRequired(false)
        .addChoices(
          { name: "Both", value: "both" },
          { name: "Total Power", value: "total" },
          { name: "Sim Power", value: "sim" },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName("top")
        .setDescription("Top N gainers/losers (3-25)")
        .setMinValue(MIN_TOP)
        .setMaxValue(MAX_TOP)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Embed (default) or CSV export")
        .setRequired(false)
        .addChoices(
          { name: "Embed", value: "embed" },
          { name: "CSV", value: "csv" },
        ),
    ),
  async execute(interaction) {
    try {
      ensureDatabase();

      if (!hasStatsPermission(interaction.member)) {
        return interaction.reply({
          content:
            "You need administrator permissions or the configured club role to run this command.",
          ephemeral: true,
        });
      }

      const metric = interaction.options.getString("metric") || "both";
      const top = interaction.options.getInteger("top") || DEFAULT_TOP;
      const safeTop = Math.max(MIN_TOP, Math.min(MAX_TOP, top));
      const format = interaction.options.getString("format") || "embed";

      await interaction.deferReply({ ephemeral: false });

      const [aggregates, latest, totalMovers, simMovers] = await Promise.all([
        getAggregates(interaction.guildId),
        getLatestForGuild(interaction.guildId),
        metric === "sim"
          ? null
          : getTopMovers(interaction.guildId, "total", safeTop),
        metric === "total"
          ? null
          : getTopMovers(interaction.guildId, "sim", safeTop),
      ]);

      if (format === "csv") {
        const csv = buildCsv(latest);
        await interaction.editReply({
          content: "Club stats CSV export",
          files: [
            {
              attachment: Buffer.from(csv, "utf8"),
              name: "club-stats.csv",
            },
          ],
        });
        metrics.trackCommand("club-stats", 0, true);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Club Weekly Stats")
        .setColor(0x6366f1)
        .setDescription(
          [
            `**Members:** ${aggregates.members}`,
            `**Total Power:** ${formatNumber(aggregates.totalPower)}`,
            `**Average Power:** ${formatNumber(aggregates.averagePower)}`,
          ].join(" • "),
        );

      if (metric !== "sim" && totalMovers) {
        embed.addFields({
          name: "Total Power (WoW)",
          value: buildMoversSection(totalMovers, "Total"),
        });
      }

      if (metric !== "total" && simMovers) {
        embed.addFields({
          name: "Sim Power (WoW)",
          value: buildMoversSection(simMovers, "Sim"),
        });
      }

      const sheetId =
        process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
        process.env.SHEETS_SPREADSHEET_ID;
      const components = [];
      if (sheetId) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Open Sheet")
            .setStyle(ButtonStyle.Link)
            .setURL(`https://docs.google.com/spreadsheets/d/${sheetId}`),
        );
        components.push(row);
        embed.setFooter({
          text: "Mon 00:00 UTC window • Open Sheet → button below",
        });
      } else {
        embed.setFooter({ text: "Mon 00:00 UTC window" });
      }

      await interaction.editReply({
        embeds: [embed],
        components,
      });

      metrics.trackCommand("club-stats", 0, true);
    } catch (err) {
      logger.error("[club-stats] Failed", { error: err.message });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ ${err.message}` });
      } else {
        await interaction.reply({
          content: `❌ ${err.message}`,
          ephemeral: true,
        });
      }
    }
  },
};
