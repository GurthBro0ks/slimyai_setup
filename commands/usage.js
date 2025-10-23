// commands/usage.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const {
  parseWindow,
  fetchOpenAIUsage,
  fetchLocalImageStats,
  aggregateUsage,
  PRICING,
} = require("../lib/usage-openai");
const logger = require("../lib/logger");
const metrics = require("../lib/metrics");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("usage")
    .setDescription("View OpenAI API usage and costs (admin only)")
    .addStringOption((option) =>
      option
        .setName("window")
        .setDescription("Time window for usage stats")
        .setRequired(false)
        .addChoices(
          { name: "Today", value: "today" },
          { name: "Last 7 days", value: "7d" },
          { name: "Last 30 days", value: "30d" },
          { name: "This month", value: "this_month" },
          { name: "Custom range", value: "custom" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("start")
        .setDescription("Start date (YYYY-MM-DD) for custom window")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("end")
        .setDescription("End date (YYYY-MM-DD) for custom window")
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      // Check permissions - admin or ManageGuild
      const hasPermission =
        interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

      if (!hasPermission) {
        return interaction.reply({
          content: "❌ This command is restricted to administrators only.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const windowOption = interaction.options.getString("window") || "7d";
      const startOption = interaction.options.getString("start");
      const endOption = interaction.options.getString("end");

      // Parse window
      let startDate, endDate;
      try {
        ({ startDate, endDate } = parseWindow(
          windowOption,
          startOption,
          endOption,
        ));
      } catch (err) {
        return interaction.editReply({
          content: `❌ Invalid date range: ${err.message}`,
        });
      }

      // Fetch usage data
      logger.info("[usage] Fetching usage data", {
        window: windowOption,
        startDate,
        endDate,
      });

      const [apiData, localImageStats] = await Promise.allSettled([
        fetchOpenAIUsage(startDate, endDate),
        fetchLocalImageStats(interaction.guildId, startDate, endDate),
      ]);

      const apiResult = apiData.status === "fulfilled" ? apiData.value : null;
      const imageResult =
        localImageStats.status === "fulfilled" ? localImageStats.value : null;

      // Aggregate usage
      const { byModel, totalCost, totalRequests } = aggregateUsage(
        apiResult,
        imageResult,
      );

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle("OpenAI API Usage & Costs")
        .setColor(0x10a37f)
        .setDescription(
          `**Period:** ${startDate} to ${endDate}\n**Total Requests:** ${totalRequests.toLocaleString()}\n**Total Cost:** $${totalCost.toFixed(4)}`,
        )
        .setTimestamp();

      // Add model breakdown
      if (byModel.length > 0) {
        const sortedModels = byModel.sort((a, b) => b.cost - a.cost);
        const topModel = sortedModels[0];

        for (const model of sortedModels.slice(0, 10)) {
          const parts = [];

          if (model.inputTokens !== undefined) {
            parts.push(`**Tokens:** ${model.inputTokens.toLocaleString()} in`);
            parts.push(`${model.outputTokens.toLocaleString()} out`);
          }

          if (model.images !== undefined) {
            parts.push(
              `**Images:** ${model.images} ${model.estimated ? "(est.)" : ""}`,
            );
          }

          parts.push(`**Requests:** ${model.requests.toLocaleString()}`);
          parts.push(`**Cost:** $${model.cost.toFixed(4)}`);

          embed.addFields({
            name: model.model,
            value: parts.join(" • "),
            inline: false,
          });
        }

        if (sortedModels.length > 10) {
          embed.setFooter({
            text: `Showing top 10 of ${sortedModels.length} models • Top spender: ${topModel.model}`,
          });
        } else if (topModel) {
          embed.setFooter({ text: `Top spender: ${topModel.model}` });
        }
      } else {
        embed.addFields({
          name: "No Usage Data",
          value:
            "No usage data found for this period. Either no API calls were made, or the OpenAI usage API is not accessible.",
        });
      }

      // Add pricing info
      const pricingLines = [
        `**gpt-4o-mini:** $${PRICING["gpt-4o-mini"].input_per_million}/M input, $${PRICING["gpt-4o-mini"].output_per_million}/M output`,
        `**dall-e-3:** $${PRICING["dall-e-3"].standard} standard, $${PRICING["dall-e-3"].hd} HD (per image)`,
      ];
      embed.addFields({
        name: "Pricing Used",
        value: pricingLines.join("\n"),
        inline: false,
      });

      await interaction.editReply({ embeds: [embed] });
      metrics.trackCommand("usage", 0, true);
    } catch (err) {
      logger.error("[usage] Command failed", { error: err.message });
      const reply = {
        content: `❌ Failed to fetch usage data: ${err.message}`,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ ...reply, ephemeral: true });
      }
    }
  },
};
