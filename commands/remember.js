// commands/remember.js - Database version (v2.0)
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../lib/database');
const memoryStore = require('../lib/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remember')
    .setDescription('Save a note (server-wide memory with /consent)')
    .addStringOption(o =>
      o.setName('note')
        .setDescription('What should I remember?')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('tags')
        .setDescription('Optional tags (comma-separated)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const note = interaction.options.getString('note', true);
      const tagsInput = interaction.options.getString('tags');
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];
      const userId = interaction.user.id;
      const guildId = interaction.guildId || null;
      const databaseConfigured = db.isConfigured();

      // Check consent (server-wide)
      const hasConsent = databaseConfigured
        ? typeof db.getUserConsent === 'function'
          ? (db.getUserConsent.length >= 2
            ? await db.getUserConsent(userId, guildId)
            : await db.getUserConsent(userId))
          : false
        : await memoryStore.getConsent({ userId, guildId });

      if (!hasConsent) {
        return interaction.reply({
          content: '❌ Memory consent required.\n\nEnable it with: `/consent memory enable:true`',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const context = {
        channelId: interaction.channelId,
        channelName: interaction.channel?.name || 'unknown',
        timestamp: Date.now()
      };

      let memoryRecord;
      if (databaseConfigured) {
        memoryRecord = await db.saveMemory(
          userId,
          guildId,
          note,
          tags,
          context
        );
      } else {
        memoryRecord = await memoryStore.addMemo({
          userId,
          guildId,
          content: note,
          tags,
          context
        });
      }

      const memoryId = memoryRecord?.id || memoryRecord?._id || 'unknown';

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('📝 Memory Saved')
        .setDescription(`**Note:** ${note}`)
        .addFields(
          { name: 'Memory ID', value: `\`${memoryId}\``, inline: true },
          { name: 'Server', value: interaction.guild?.name || 'Unknown', inline: true }
        )
        .setTimestamp();

      if (tags.length > 0) {
        embed.addFields({ name: 'Tags', value: tags.map(t => `\`${t}\``).join(' '), inline: false });
      }

      embed.setFooter({ text: 'Use /export to view all memories or /forget to delete' });

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[remember] Error:', err);

      const errorMsg = '❌ Failed to save memory. Please try again.';

      if (interaction.deferred) {
        return interaction.editReply({ content: errorMsg });
      } else {
        return interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
      }
    }
  }
};
