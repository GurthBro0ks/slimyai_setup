// commands/export.js - Database version (v2.0)
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const db = require('../lib/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export your notes (latest 25)'),

  async execute(interaction) {
    if (!db.isConfigured()) {
      return interaction.reply({
        content: '❌ Database not configured. Contact bot administrator.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const memories = await db.getMemories(
        interaction.user.id,
        interaction.guildId,
        25
      );

      if (memories.length === 0) {
        return interaction.editReply({
          content: '📝 No memories found for this server.\n\nUse `/remember` to save notes!'
        });
      }

      // Format as JSON
      const payload = JSON.stringify(
        {
          user: interaction.user.id,
          username: interaction.user.username,
          guild: interaction.guildId || null,
          guildName: interaction.guild?.name || 'Unknown',
          exportedAt: new Date().toISOString(),
          count: memories.length,
          memories: memories.map(m => ({
            id: m.id,
            note: m.note,
            tags: m.tags,
            context: m.context,
            created_at: m.createdAt || m.created_at
          }))
        },
        null,
        2
      );

      // Try to send as file
      if (payload.length < 1900) {
        // Short enough to send as embed
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📦 Memory Export')
          .setDescription(`**Server:** ${interaction.guild?.name}\n**Memories:** ${memories.length}`)
          .setTimestamp();

        memories.slice(0, 5).forEach((mem, i) => {
          const createdAt = mem.createdAt || mem.created_at;
          const safeNote = mem.note || '';
          embed.addFields({
            name: `#${mem.id} - ${createdAt ? new Date(createdAt).toLocaleDateString() : 'unknown'}`,
            value: safeNote.slice(0, 100) + (safeNote.length > 100 ? '...' : ''),
            inline: false
          });
        });

        if (memories.length > 5) {
          embed.setFooter({ text: `Showing 5 of ${memories.length} memories. Download full export below.` });
        }

        const file = new AttachmentBuilder(Buffer.from(payload, 'utf8'), {
          name: `slimy-memories-${interaction.user.id}.json`
        });

        return interaction.editReply({
          embeds: [embed],
          files: [file]
        });
      } else {
        // Send as file only
        const file = new AttachmentBuilder(Buffer.from(payload, 'utf8'), {
          name: `slimy-memories-${interaction.user.id}.json`
        });

        return interaction.editReply({
          content: `📦 **${memories.length} memories exported**\n\nServer: ${interaction.guild?.name}`,
          files: [file]
        });
      }

    } catch (err) {
      console.error('[export] Error:', err);

      const errorMsg = '❌ Export failed. Please try again.';

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
