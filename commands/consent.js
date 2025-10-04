// commands/consent.js
const { SlashCommandBuilder } = require("discord.js");
const mem = require("../lib/memory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("consent")
    .setDescription("Allow or revoke remembering your notes")
    .addBooleanOption((o) =>
      o
        .setName("allow")
        .setDescription("true = allow memory")
        .setRequired(true),
    ),
  async execute(interaction) {
    try {
      const allow = interaction.options.getBoolean("allow", true);

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      await mem.setConsent({
        userId: interaction.user.id,
        guildId: interaction.guildId || null,
        allowed: allow,
      });

      return await interaction.editReply({
        content: allow
          ? "✅ Memory ON for you here."
          : "🧽 Memory OFF (new notes won’t be saved).",
      });
    } catch (err) {
      console.error("consent error:", err);
      const failure = "❌ consent crashed. Check logs.";

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: failure }).catch(() => {});
      }

      return interaction.reply({ content: failure, ephemeral: true }).catch(
        () => {},
      );
    }
  },
};
