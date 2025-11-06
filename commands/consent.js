// commands/consent.js - Database version (v2.0)
const { SlashCommandBuilder } = require("discord.js");
const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const db = TEST ? stubs.database : require("../lib/database");
const memoryStore = TEST ? stubs.memory : require("../lib/memory");

/** Get consent - prefer database, fallback to file **/
async function getConsent({ guildId, userId }) {
  const databaseConfigured = db.isConfigured();

  if (databaseConfigured) {
    try {
      // Database uses global consent (not per-guild)
      return await db.getUserConsent(userId);
    } catch (err) {
      console.error("[consent] Database error:", err.message);
    }
  }

  // Fallback to file-based storage
  return await memoryStore.getConsent({ guildId, userId });
}

/** Set consent - prefer database, fallback to file **/
async function setConsent({ guildId, userId, allow }) {
  const databaseConfigured = db.isConfigured();

  if (databaseConfigured) {
    try {
      // Database uses global consent (not per-guild)
      await db.setUserConsent(userId, allow);
      return true;
    } catch (err) {
      console.error("[consent] Database error:", err.message);
    }
  }

  // Fallback to file-based storage
  return await memoryStore.setConsent({ guildId, userId, allowed: allow });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("consent")
    .setDescription("Manage memory consent")
    .addSubcommand((sc) =>
      sc
        .setName("set")
        .setDescription("Enable or disable memory here")
        .addBooleanOption((o) =>
          o
            .setName("allow")
            .setDescription("true to enable, false to disable")
            .setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("status").setDescription("Show current memory consent here"),
    ),
  async execute(interaction) {
    const guildId = interaction.guild?.id || interaction.channelId;
    const userId = interaction.user.id;

    // Prefer subcommands if present
    const sub = interaction.options.getSubcommand(false);

    if (sub === "status") {
      const on = await getConsent({ guildId, userId });
      return interaction.reply({
        content: on ? "✅ Memory ON here." : "❌ Memory OFF here.",
        ephemeral: true,
      });
    }

    if (sub === "set") {
      const allow = interaction.options.getBoolean("allow", true);
      await setConsent({ guildId, userId, allow });
      return interaction.reply({
        content: allow
          ? "✅ Memory ON for this server."
          : "🛑 Memory OFF for this server.",
        ephemeral: true,
      });
    }

    // Legacy fallback: /consent allow:true|false (no subcommand)
    const legacy = interaction.options.getBoolean("allow"); // not required
    if (legacy !== null) {
      await setConsent({ guildId, userId, allow: legacy });
      return interaction.reply({
        content: legacy
          ? "✅ Memory ON for this server."
          : "🛑 Memory OFF for this server.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: "Usage: /consent set allow:true|false  •  /consent status",
      ephemeral: true,
    });
  },
};
