// commands/diag.js - V3 with Enhanced Metrics
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("diag")
    .setDescription("Comprehensive health check and diagnostics"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("🔧 Slimy.AI Diagnostics v2.1")
      .setColor(0x00ff00)
      .setTimestamp();

    // System uptime
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    embed.addFields({
      name: "⏱️ Bot Uptime",
      value: `${days}d ${hours}h ${minutes}m`,
      inline: true,
    });

    // Memory usage
    const mem = process.memoryUsage();
    embed.addFields({
      name: "💾 Memory Usage",
      value: `Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB\nRSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
      inline: true,
    });

    // Database connection
    try {
      const database = TEST ? stubs.database : require("../lib/database");
      if (database.isConfigured()) {
        await database.testConnection();
        const pool = database.getPool();

        // Get database stats
        try {
          const [memoryCount] = await pool.query(
            "SELECT COUNT(*) as count FROM memories",
          );
          const [imageCount] = await pool.query(
            "SELECT COUNT(*) as count FROM image_generation_log",
          );
          const [snailCount] = await pool.query(
            "SELECT COUNT(*) as count FROM snail_stats",
          );

          embed.addFields({
            name: "🗄️ Database",
            value: `✅ Connected\nMemories: ${memoryCount[0].count}\nImages: ${imageCount[0].count}\nSnails: ${snailCount[0].count}`,
            inline: false,
          });
        } catch (statErr) {
          embed.addFields({
            name: "🗄️ Database",
            value: `✅ Connected (stats unavailable)`,
            inline: false,
          });
        }
      } else {
        embed.addFields({
          name: "🗄️ Database",
          value: "⚠️ Not configured",
          inline: false,
        });
      }
    } catch (err) {
      embed.addFields({
        name: "🗄️ Database",
        value: `❌ Error: ${err.message}`,
        inline: false,
      });
    }

    // Command metrics
    try {
      const metrics = TEST ? stubs.metrics : require("../lib/metrics");
      const stats = metrics.getStats();

      embed.addFields({
        name: "📊 Command Statistics",
        value: `Total: ${stats.summary.totalCommands}\nSuccess Rate: ${stats.summary.successRate}\nErrors: ${stats.summary.totalErrors}`,
        inline: false,
      });

      // Top 3 most used commands
      const topCommands =
        Object.entries(stats.commands)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3)
          .map(([cmd, data]) => `\`/${cmd}\`: ${data.count} (${data.avgTime})`)
          .join("\n") || "No commands executed yet";

      embed.addFields({
        name: "🔥 Top Commands",
        value: topCommands,
        inline: false,
      });
    } catch (err) {
      // Metrics not available - not critical
      embed.addFields({
        name: "📊 Metrics",
        value: "⚠️ Metrics system unavailable",
        inline: false,
      });
    }

    // Git commit
    try {
      const { stdout } = await execPromise("git rev-parse --short HEAD");
      const commit = stdout.trim();
      embed.addFields({
        name: "📝 Git Commit",
        value: `\`${commit}\``,
        inline: true,
      });
    } catch (err) {
      // Git not available
    }

    // Discord.js info
    embed.addFields({
      name: "🤖 Bot Info",
      value: `Ping: ${interaction.client.ws.ping}ms\nGuilds: ${interaction.client.guilds.cache.size}\nUsers: ${interaction.client.users.cache.size}`,
      inline: true,
    });

    // Health check endpoint
    embed.addFields({
      name: "🏥 Health Endpoints",
      value: `http://localhost:${process.env.HEALTH_PORT || 3000}/health\nhttp://localhost:${process.env.HEALTH_PORT || 3000}/metrics`,
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
