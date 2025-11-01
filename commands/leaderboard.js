// commands/leaderboard.js
// Display Super Snail leaderboard from MCP analytics
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mcpClient = require('../services/mcp-client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View Super Snail leaderboard for this server')
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Number of users to show (default: 10)')
        .setMinValue(5)
        .setMaxValue(50)
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      // Must be in a guild
      if (!interaction.guildId) {
        return interaction.reply({
          content: '❌ This command can only be used in a server.',
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const limit = interaction.options.getInteger('limit') || 10;

      // Fetch leaderboard from MCP
      const result = await mcpClient.getSnailLeaderboard(
        interaction.guildId,
        limit
      );

      if (!result.leaderboard || result.leaderboard.length === 0) {
        return interaction.editReply({
          content: '📊 No leaderboard data available yet. Start analyzing screenshots with `/snail analyze`!',
        });
      }

      // Build leaderboard text
      const leaderboardText = await Promise.all(
        result.leaderboard.map(async (entry, index) => {
          // Get medal emoji for top 3
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';

          // Try to fetch user from Discord
          let username = `User ${entry.userId}`;
          try {
            const user = await interaction.client.users.fetch(entry.userId);
            username = user.username;
          } catch {
            // User not found or left server
          }

          const count = entry.analysis_count || 0;
          const lastAnalysis = entry.last_analysis
            ? `<t:${Math.floor(new Date(entry.last_analysis).getTime() / 1000)}:R>`
            : 'Never';

          return `${medal} **${index + 1}.** ${username} - ${count} ${count === 1 ? 'analysis' : 'analyses'} (Last: ${lastAnalysis})`;
        })
      );

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Super Snail Leaderboard')
        .setDescription(leaderboardText.join('\n'))
        .setFooter({
          text: `Top ${limit} players in ${interaction.guild.name}`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[leaderboard] Error:', error);

      // User-friendly error message
      let errorMessage = '❌ Failed to fetch leaderboard. ';

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
