// deploy-commands.js - MULTI-SERVER VERSION
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const commands = [];
const cmdsPath = path.join(__dirname, "commands");
const files = fs.readdirSync(cmdsPath).filter(f => f.endsWith(".js"));

for (const file of files) {
  const cmd = require(path.join(cmdsPath, file));
  if (cmd?.data && cmd?.execute) {
    commands.push(cmd.data.toJSON());
  } else {
    console.warn(`[WARN] ${file} is missing "data" or "execute"`);
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const appId = process.env.DISCORD_CLIENT_ID;
    if (!appId) {
      throw new Error("Missing DISCORD_CLIENT_ID in .env");
    }
    
    // Check if we want guild-specific (for testing) or global deployment
    const guildId = process.env.DISCORD_GUILD_ID;
    
    if (guildId) {
      // GUILD DEPLOYMENT (instant updates, good for testing)
      console.log(`Deploying ${commands.length} command(s) to guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(appId, guildId),
        { body: commands }
      );
      console.log("✅ Slash commands registered to guild (instant).");
    } else {
      // GLOBAL DEPLOYMENT (works on all servers, takes ~1 hour)
      console.log(`Deploying ${commands.length} command(s) globally...`);
      await rest.put(
        Routes.applicationCommands(appId),
        { body: commands }
      );
      console.log("✅ Slash commands registered globally.");
      console.log("⏱️  Note: Global commands take ~1 hour to propagate.");
    }
  } catch (e) {
    console.error("Deploy failed:", e);
    process.exit(1);
  }
})();
