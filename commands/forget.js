// commands/forget.js - Database version (v2.0)
const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const db = require('../lib/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forget')
    .setDescription('Delete memories')
    .addStringOption(o =>
      o.setName('id')
        .setDescription('Memory ID to delete (use /export to see IDs), or "ALL" to delete everything')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!db.isConfigured()) {
      return interaction.reply({
        content: '❌ Database not configured. Contact bot administrator.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      const id = interaction.options.getString('id', true);
      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (id.toUpperCase() === 'ALL') {
        // Delete all memories for this user in this server
        const deleted = await db.deleteAllMemories(userId, guildId);

        const embed = new EmbedBuilder()
          .setColor(0xFF6B6B)
          .setTitle('🧽 All Memories Deleted')
          .setDescription(`Deleted **${deleted} ${deleted === 1 ? 'memory' : 'memories'}** from **${interaction.guild?.name}**`)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } else {
        // Delete specific memory
        const deleted = await db.deleteMemory(userId, guildId, id.trim());

        if (deleted) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Memory Deleted')
            .setDescription(`Memory #${id} has been removed`)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } else {
          return interaction.editReply({
            content: `❌ Memory #${id} not found or you don't have permission to delete it.`
          });
        }
      }

    } catch (err) {
      console.error('[forget] Error:', err);

      const errorMsg = '❌ Failed to delete memory. Please try again.';

      if (interaction.deferred) {
        return interaction.editReply({ content: errorMsg });
      } else {
        return interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
