const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const logger = require("./logger");

const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;

const clubStore = TEST ? stubs.clubStore : require("./club-store");
const guildSettings = TEST
  ? stubs.guildSettings
  : require("./guild-settings");
const weekAnchor = require("./week-anchor");

const DEFAULT_TOP = 10;
const MIN_TOP = 3;
const MAX_TOP = 25;

function toNumber(value) {
  if (value === null || typeof value === "undefined") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value, options = {}) {
  const num = toNumber(value);
  if (num === null) return "—";
  const {
    maximumFractionDigits = 0,
    minimumFractionDigits = 0,
    notation,
    compactDisplay,
  } = options;
  const localeOptions = {
    maximumFractionDigits,
    minimumFractionDigits,
  };
  if (notation) {
    localeOptions.notation = notation;
  }
  if (compactDisplay) {
    localeOptions.compactDisplay = compactDisplay;
  }
  return num.toLocaleString("en-US", localeOptions);
}

function formatDelta(current, previous) {
  const curr = toNumber(current);
  const prev = toNumber(previous);
  if (curr === null || prev === null) return "—";
  const delta = curr - prev;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString("en-US")}`;
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
  const gainers = Array.isArray(movers?.gainers) ? movers.gainers : [];
  const losers = Array.isArray(movers?.losers) ? movers.losers : [];
  if (!gainers.length && !losers.length) {
    return "No prior week yet.";
  }

  const parts = [];
  parts.push("```");
  parts.push(formatTableSide(gainers, metricLabel, "up"));
  parts.push("");
  parts.push(formatTableSide(losers, metricLabel, "down"));
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

async function computeCohorts(latest) {
  const newMembers = [];
  const veterans = [];
  const mostVolatile = [];

  for (const member of latest) {
    if (!member.total_prev && !member.sim_prev) {
      newMembers.push(member);
    } else {
      veterans.push(member);
    }

    const volatility = Math.abs(toNumber(member.total_pct_change) || 0);
    if (volatility > 0) {
      mostVolatile.push({ ...member, volatility });
    }
  }

  mostVolatile.sort((a, b) => b.volatility - a.volatility);

  return {
    newMembers,
    veterans,
    mostVolatile: mostVolatile.slice(0, 5),
    newCount: newMembers.length,
    veteranCount: veterans.length,
  };
}

function normalizeTop(top) {
  const num = Number(top);
  if (!Number.isFinite(num)) return DEFAULT_TOP;
  return Math.max(MIN_TOP, Math.min(MAX_TOP, Math.floor(num)));
}

async function fetchClubStats(guildId, options = {}) {
  const metric = options.metric || "both";
  const top = normalizeTop(options.top);

  const [aggregates, latest, sheetConfig] = await Promise.all([
    clubStore.getAggregates(guildId),
    clubStore.getLatestForGuild(guildId),
    guildSettings.getSheetConfig(guildId),
  ]);

  if (!latest.length) {
    return {
      aggregates,
      latest,
      sheetConfig,
      totalMovers: null,
      simMovers: null,
      cohorts: {
        newMembers: [],
        veterans: [],
        mostVolatile: [],
        newCount: 0,
        veteranCount: 0,
      },
    };
  }

  const [totalMovers, simMovers, cohorts] = await Promise.all([
    metric === "sim"
      ? Promise.resolve(null)
      : clubStore.getTopMovers(guildId, "total", top),
    metric === "total"
      ? Promise.resolve(null)
      : clubStore.getTopMovers(guildId, "sim", top),
    computeCohorts(latest),
  ]);

  logger.debug("[club-stats-service] Computed stats", {
    guildId,
    metric,
    top,
    members: aggregates.members,
  });

  return {
    aggregates,
    latest,
    sheetConfig,
    totalMovers,
    simMovers,
    cohorts,
  };
}

function buildClubStatsEmbed(
  guildId,
  data,
  options = {},
) {
  const { aggregates, latest, sheetConfig, totalMovers, simMovers, cohorts } =
    data;

  // Use new week anchor utilities
  const anchorDisplay = weekAnchor.formatAnchorDisplay(guildId);

  const totalPowerDisplay =
    aggregates.totalPower === null
      ? "—"
      : formatNumber(aggregates.totalPower, {
          notation: "compact",
          maximumFractionDigits: 2,
        });
  const averagePowerDisplay =
    aggregates.averagePower === null
      ? "—"
      : Number(aggregates.averagePower).toLocaleString("en-US", {
          maximumFractionDigits: 0,
        });

  const embed = new EmbedBuilder()
    .setTitle("Club Weekly Stats")
    .setColor(0x6366f1)
    .setDescription(
      [
        `**Members:** ${aggregates.members} (${cohorts.newCount} new, ${cohorts.veteranCount} returning)`,
        `**Total Power:** ${totalPowerDisplay}`,
        `**Average Power:** ${averagePowerDisplay}`,
      ].join("\n"),
    );

  if (options.metric !== "sim" && totalMovers) {
    embed.addFields({
      name: "Total Power (WoW)",
      value: buildMoversSection(totalMovers, "Total"),
    });
  }

  if (options.metric !== "total" && simMovers) {
    embed.addFields({
      name: "Sim Power (WoW)",
      value: buildMoversSection(simMovers, "Sim"),
    });
  }

  if (cohorts.mostVolatile.length > 0) {
    const volatileLines = cohorts.mostVolatile.map((member, index) => {
      const pct =
        member.total_pct_change !== null &&
        member.total_pct_change !== undefined
          ? member.total_pct_change
          : 0;
      const sign = pct >= 0 ? "▲" : "▼";
      return `${index + 1}. **${member.name_display}** ${sign} ${Math.abs(pct).toFixed(1)}%`;
    });
    embed.addFields({
      name: "🔥 Most Volatile (Total Power)",
      value: volatileLines.join("\n"),
      inline: false,
    });
  }

  const components = [];
  if (sheetConfig?.url) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open Sheet")
        .setStyle(ButtonStyle.Link)
        .setURL(sheetConfig.url),
    );
    components.push(row);
    embed.setFooter({
      text: `Weekly window: ${anchorDisplay} • Open Sheet → button below`,
    });
  } else {
    embed.setFooter({
      text: `Weekly window: ${anchorDisplay} • Sheet link not configured`,
    });
  }

  return {
    embed,
    components,
  };
}

module.exports = {
  fetchClubStats,
  buildClubStatsEmbed,
  buildMoversSection,
  buildCsv,
  formatNumber,
  formatDelta,
  buildBar,
  DEFAULT_TOP,
  MIN_TOP,
  MAX_TOP,
};
