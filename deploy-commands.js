// deploy-commands.js (CommonJS)
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
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!appId || !guildId) {
      throw new Error("Missing DISCORD_CLIENT_ID or DISCORD_GUILD_ID in .env");
    }
    console.log(`Deploying ${commands.length} command(s) to guild ${guildId}...`);
    await rest.put(
      Routes.applicationGuildCommands(appId, guildId),
      { body: commands }
    );
    console.log("✅ Slash commands registered to guild.");
  } catch (e) {
    console.error("Deploy failed:", e);
    process.exit(1);
  }
})();

