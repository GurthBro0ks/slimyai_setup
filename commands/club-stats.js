const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const database = TEST ? stubs.database : require("../lib/database");
const logger = require("../lib/logger");
const metrics = TEST ? stubs.metrics : require("../lib/metrics");
const statsService = require("../lib/club-stats-service");

const DEFAULT_TOP = statsService.DEFAULT_TOP;
const MIN_TOP = statsService.MIN_TOP;
const MAX_TOP = statsService.MAX_TOP;

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

      const statsData = await statsService.fetchClubStats(
        interaction.guildId,
        {
          metric,
          top: safeTop,
        },
      );

      if (!statsData.latest.length) {
        await interaction.editReply({
          content:
            "No club stats available yet. Run /club analyze to generate data.",
        });
        metrics.trackCommand("club-stats", 0, true);
        return;
      }

      if (format === "csv") {
        const csv = statsService.buildCsv(statsData.latest);
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

      const { embed, components } = statsService.buildClubStatsEmbed(
        interaction.guildId,
        statsData,
        { metric },
      );

      logger.debug("[club-stats] Aggregates resolved", {
        guildId: interaction.guildId,
        totalPower: statsData.aggregates.totalPower,
        members: statsData.aggregates.members,
        membersWithTotals: statsData.aggregates.membersWithTotals,
        averagePower: statsData.aggregates.averagePower,
      });

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
