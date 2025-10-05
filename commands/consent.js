// commands/consent.js - FIXED VERSION
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

      // Defer ONCE at the start - simple and safe
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      await mem.setConsent({
        userId: interaction.user.id,
        guildId: interaction.guildId || null,
        allowed: allow,
      });

      return await interaction.editReply({
        content: allow
          ? "✅ Memory ON for you here."
          : "🧽 Memory OFF (new notes won't be saved).",
      });
    } catch (err) {
      console.error("consent error:", err);
      const failure = "❌ consent crashed. Check logs.";

      // Safe fallback - only edit if we already deferred
      if (interaction.deferred) {
        return interaction.editReply({ content: failure }).catch(() => {});
      }

      // Otherwise try to reply
      return interaction.reply({ 
        content: failure, 
        flags: MessageFlags.Ephemeral 
      }).catch(() => {});
    }
  },
};
