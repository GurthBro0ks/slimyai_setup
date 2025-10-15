// commands/export.js - Database version (v2.0)
const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../lib/database');
const memoryStore = require('../lib/memory');

function parseMaybeJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(fallback) && Array.isArray(value)) return value;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export your notes (latest 25)'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const userId = interaction.user.id;
      const guildId = interaction.guildId || null;
      const databaseConfigured = db.isConfigured();

      const recordsRaw = databaseConfigured
        ? await db.getMemories(userId, guildId, 25)
        : await memoryStore.listMemos({ userId, guildId, limit: 25 });

      const memories = (recordsRaw || []).map((record) => {
        if (databaseConfigured) {
          return {
            id: record.id,
            note: record.note,
            tags: parseMaybeJson(record.tags, []),
            context: parseMaybeJson(record.context, {}),
            createdAt: record.createdAt || record.created_at || null,
          };
        }

        return {
          id: record._id || record.id,
          note: record.content,
          tags: Array.isArray(record.tags) ? record.tags : [],
          context: record.context || {},
          createdAt: record.createdAt || null,
        };
      });

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
