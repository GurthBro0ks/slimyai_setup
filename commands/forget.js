// commands/forget.js - FIXED VERSION
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const mem = require('../lib/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forget')
    .setDescription('Delete a note by ID (see /export for IDs)')
    .addStringOption(o =>
      o.setName('id')
       .setDescription('Note ID (_id from export)')
       .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const id = interaction.options.getString('id', true);
      await mem.deleteMemo({ id, userId: interaction.user.id });

      return interaction.reply({
        content: `🧽 Deleted note #${id}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error("forget error:", err);
      return interaction.reply({
        content: "❌ forget crashed. Check logs.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
};
