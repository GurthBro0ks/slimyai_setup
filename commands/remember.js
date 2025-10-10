// commands/remember.js - Database version (v2.0)
const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const db = require('../lib/database');

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
    if (!db.isConfigured()) {
      return interaction.reply({
        content: '❌ Database not configured. Contact bot administrator.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      const note = interaction.options.getString('note', true);
      const tagsInput = interaction.options.getString('tags');
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];

      // Check consent (server-wide)
      const hasConsent = await db.getUserConsent(interaction.user.id);

      if (!hasConsent) {
        return interaction.reply({
          content: '❌ Memory consent required.\n\nEnable it with: `/consent memory enable:true`',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Save memory with context
      const memory = await db.saveMemory(
        interaction.user.id,
        interaction.guildId,
        note,
        tags,
        {
          channelId: interaction.channelId,
          channelName: interaction.channel?.name || 'unknown',
          timestamp: Date.now()
        }
      );

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('📝 Memory Saved')
        .setDescription(`**Note:** ${note}`)
        .addFields(
          { name: 'Memory ID', value: `\`${memory.id}\``, inline: true },
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
        return interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
