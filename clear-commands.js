require("dotenv").config();
const { REST, Routes } = require("discord.js");

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
const appId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

(async () => {
  try {
    console.log("🗑️  Clearing all guild commands...");
    await rest.put(Routes.applicationGuildCommands(appId, guildId), {
      body: [],
    });
    console.log("✅ Guild commands cleared");

    console.log("🗑️  Clearing all global commands...");
    await rest.put(Routes.applicationCommands(appId), { body: [] });
    console.log("✅ Global commands cleared\n");
  } catch (err) {
    console.error("❌ Failed:", err);
  }
})();
