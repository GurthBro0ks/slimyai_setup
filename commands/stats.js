// commands/stats.js
// Display user statistics from MCP analytics
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mcpClient = require('../services/mcp-client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your Slimy.ai usage statistics')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to view stats for (admin/club only)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Time period for stats')
        .addChoices(
          { name: '7 days', value: '7d' },
          { name: '30 days', value: '30d' },
          { name: '90 days', value: '90d' },
          { name: '1 year', value: '1y' }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Determine target user
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const period = interaction.options.getString('period') || '30d';

      // Check permissions if viewing another user's stats
      if (targetUser.id !== interaction.user.id) {
        const member = interaction.member;
        const isAdmin = member.permissions.has('Administrator');
        const hasModRole = member.roles.cache.some(role =>
          role.name.toLowerCase().includes('mod') ||
          role.name.toLowerCase().includes('club')
        );

        if (!isAdmin && !hasModRole) {
          return interaction.editReply({
            content: '❌ You can only view your own statistics unless you have admin/club permissions.',
          });
        }
      }

      // Fetch stats from MCP
      const stats = await mcpClient.getUserStats(
        targetUser.id,
        interaction.guildId,
        period
      );

      // Build embed
      const periodLabels = {
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
        '90d': 'Last 90 days',
        '1y': 'Last year'
      };

      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`📊 Stats for ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`Statistics for ${periodLabels[period]}`)
        .addFields(
          {
            name: '💬 Messages',
            value: stats.stats.messageCount?.toString() || '0',
            inline: true,
          },
          {
            name: '🎨 Images Generated',
            value: stats.stats.imageGenerationCount?.toString() || '0',
            inline: true,
          },
          {
            name: '⏰ Last Active',
            value: stats.stats.lastActive
              ? `<t:${Math.floor(new Date(stats.stats.lastActive).getTime() / 1000)}:R>`
              : 'Never',
            inline: true,
          }
        )
        .setFooter({ text: `User ID: ${targetUser.id}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[stats] Error:', error);

      // User-friendly error message
      let errorMessage = '❌ Failed to fetch statistics. ';

      if (error.message?.includes('ECONNREFUSED')) {
        errorMessage += 'Analytics service is currently unavailable.';
      } else if (error.message?.includes('Authentication')) {
        errorMessage += 'Authentication error with analytics service.';
      } else {
        errorMessage += 'Please try again later.';
      }

      await interaction.editReply({
        content: errorMessage,
      });
    }
  },
};
