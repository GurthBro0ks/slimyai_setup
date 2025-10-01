// commands/consent.js
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
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
      await mem.setConsent({
        userId: interaction.user.id,
        guildId: interaction.guildId || null,
        allowed: allow,
      });
      return interaction.reply({
        content: allow
          ? "✅ Memory ON for you here."
          : "🧽 Memory OFF (new notes won’t be saved).",
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error("consent error:", err);
      return interaction
        .reply({
          content: "❌ consent crashed. Check logs.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
  },
};
