const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const personalityEngine = TEST
  ? stubs.personalityEngine
  : require("../lib/personality-engine");
const personalityStore = TEST
  ? stubs.personalityStore
  : require("../lib/personality-store");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("personality-config")
    .setDescription("Configure bot personality (Admin only)")
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View current personality configuration"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Test personality with sample scenarios"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("analytics")
        .setDescription("View personality usage analytics"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("adjust")
        .setDescription("Adjust personality parameters")
        .addStringOption((o) =>
          o
            .setName("parameter")
            .setDescription("What to adjust")
            .addChoices(
              { name: "Catchphrase Frequency", value: "catchphrase_freq" },
              { name: "Enthusiasm Level", value: "enthusiasm" },
              { name: "Technical Depth", value: "technical_depth" },
              { name: "Formality Level", value: "formality" },
            )
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("value")
            .setDescription("New value (1-10 scale)")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const member = interaction.member;
    if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ This command requires Administrator permissions.",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const config = personalityEngine.loadPersonalityConfig();
      const embed = new EmbedBuilder()
        .setTitle("🎭 Current Personality Configuration")
        .setDescription("Active personality traits and adaptation rules")
        .setColor(0x7b68ee)
        .addFields(
          {
            name: "Traits Tracked",
            value: Object.keys(config.traits || {}).length.toString(),
            inline: true,
          },
          {
            name: "Catchphrases",
            value: (config.catchphrases || []).length.toString(),
            inline: true,
          },
          {
            name: "Tone Guidelines",
            value: (config.toneGuidelines || []).length.toString(),
            inline: true,
          },
          {
            name: "Context Behaviors",
            value: (config.contextBehaviors || []).length.toString(),
            inline: true,
          },
          {
            name: "Adaptation Rules",
            value: (config.adaptationRules || []).length.toString(),
            inline: true,
          },
          { name: "Cache Status", value: "Loaded", inline: true },
        );

      const traitList =
        Object.entries(config.traits || {})
          .map(([key, value]) => `• **${key.replace(/_/g, " ")}:** ${value}`)
          .join("\n") || "No traits defined";

      embed.addFields({ name: "Traits", value: traitList.slice(0, 1024) });

      const adjustments = Object.entries(config.adjustments || {});
      if (adjustments.length) {
        const adjustmentLines = adjustments.slice(0, 6).map(([key, meta]) => {
          const value =
            typeof meta?.value === "number"
              ? `${meta.value}/10`
              : String(meta?.value ?? "—");
          const actor = meta?.updatedByTag ? ` (by ${meta.updatedByTag})` : "";
          return `• **${key}** → ${value}${actor}`;
        });
        let fieldValue = adjustmentLines.join("\n");
        if (!fieldValue) fieldValue = "Overrides present but failed to render.";
        if (adjustments.length > adjustmentLines.length) {
          fieldValue += `\n… and ${adjustments.length - adjustmentLines.length} more overrides.`;
        }
        embed.addFields({
          name: "Active Adjustments",
          value: fieldValue.slice(0, 1024),
        });
      } else {
        embed.addFields({
          name: "Active Adjustments",
          value: "No overrides applied via `/personality-config adjust`.",
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "test") {
      await interaction.deferReply({ ephemeral: true });
      await personalityEngine.evaluatePersonalityQuality();
      return interaction.editReply({
        content:
          "✅ Personality test complete! Check server logs for the generated prompts.",
      });
    }

    if (subcommand === "analytics") {
      const analytics = personalityEngine.getAnalytics();
      const catchphrases =
        Object.entries(analytics.catchphraseFrequency || {})
          .map(([phrase, count]) => `• ${phrase}: ${count}x`)
          .join("\n") || "No data yet";

      const embed = new EmbedBuilder()
        .setTitle("📊 Personality Analytics")
        .setDescription("Usage patterns and tone consistency")
        .setColor(0x7b68ee)
        .addFields(
          { name: "Catchphrase Usage", value: catchphrases },
          {
            name: "Tone Consistency",
            value: `${(analytics.toneConsistency * 100).toFixed(1)}%`,
            inline: true,
          },
          {
            name: "User Satisfaction",
            value: `${(analytics.userSatisfaction * 100).toFixed(1)}%`,
            inline: true,
          },
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "adjust") {
      const parameter = interaction.options.getString("parameter", true);
      const value = interaction.options.getInteger("value", true);

      personalityStore.setAdjustment(parameter, value, {
        updatedBy: interaction.user.id,
        updatedByTag: interaction.user.tag,
      });
      personalityEngine.reloadConfig();

      return interaction.reply({
        content: `✅ Adjusted **${parameter}** to **${value}/10**. View overrides with \`/personality-config view\`.`,
        ephemeral: true,
      });
    }
  },
};
