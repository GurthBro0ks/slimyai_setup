// commands/remember.js - Database version (v2.0)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const db = TEST ? stubs.database : require("../lib/database");
const memoryStore = TEST ? stubs.memory : require("../lib/memory");
const rateLimiter = TEST ? stubs.rateLimiter : require("../lib/rate-limiter");
const metrics = TEST ? stubs.metrics : require("../lib/metrics");
const logger = require("../lib/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remember")
    .setDescription("Save a memory (server-wide memory with /consent)")
    .addStringOption((o) =>
      o
        .setName("note")
        .setDescription("What should I remember?")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("tags")
        .setDescription("Optional tags (comma-separated)")
        .setRequired(false),
    ),

  async execute(interaction) {
    const startTime = Date.now();

    try {
      // Rate limiting - 3 second cooldown
      const check = rateLimiter.checkCooldown(
        interaction.user.id,
        "remember",
        3,
      );
      if (check.limited) {
        metrics.trackCommand("remember", Date.now() - startTime, false);
        return interaction.reply({
          content: `⏳ Slow down! Please wait ${check.remaining}s before saving another memory.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const note = interaction.options.getString("note", true);
      const tagsInput = interaction.options.getString("tags");
      const tags = tagsInput ? tagsInput.split(",").map((t) => t.trim()) : [];
      const userId = interaction.user.id;
      const guildId = interaction.guildId || null;
      const databaseConfigured = db.isConfigured();

      // Check consent (server-wide)
      const hasConsent = databaseConfigured
        ? typeof db.getUserConsent === "function"
          ? db.getUserConsent.length >= 2
            ? await db.getUserConsent(userId, guildId)
            : await db.getUserConsent(userId)
          : false
        : await memoryStore.getConsent({ userId, guildId });

      if (!hasConsent) {
        return interaction.reply({
          content:
            "❌ Memory consent required.\n\nEnable it with `/consent set allow:true`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const context = {
        channelId: interaction.channelId,
        channelName: interaction.channel?.name || "unknown",
        timestamp: Date.now(),
      };

      let memoryRecord;
      if (databaseConfigured) {
        memoryRecord = await db.saveMemory(
          userId,
          guildId,
          note,
          tags,
          context,
        );
      } else {
        memoryRecord = await memoryStore.addMemo({
          userId,
          guildId,
          content: note,
          tags,
          context,
        });
      }

      const memoryId = memoryRecord?.id || memoryRecord?._id || "unknown";

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("📝 Memory Saved")
        .setDescription(`**Note:** ${note}`)
        .addFields(
          { name: "Memory ID", value: `\`${memoryId}\``, inline: true },
          {
            name: "Server",
            value: interaction.guild?.name || "Unknown",
            inline: true,
          },
        )
        .setTimestamp();

      if (tags.length > 0) {
        embed.addFields({
          name: "Tags",
          value: tags.map((t) => `\`${t}\``).join(" "),
          inline: false,
        });
      }

      embed.setFooter({
        text: "Use /export to view all memories or /forget to delete",
      });

      metrics.trackCommand("remember", Date.now() - startTime, true);
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      metrics.trackCommand("remember", Date.now() - startTime, false);
      metrics.trackError("remember_command", err.message);
      logger.error("Remember command failed", {
        userId: interaction.user.id,
        error: err.message,
      });
      console.error("[remember] Error:", err);

      const errorMsg = "❌ Failed to save memory. Please try again.";

      if (interaction.deferred) {
        return interaction.editReply({ content: errorMsg });
      } else {
        return interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
