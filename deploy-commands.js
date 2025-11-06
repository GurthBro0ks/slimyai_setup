// deploy-commands.js - ROBUST VERSION WITH ERROR LOGGING
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

const commands = [];
const cmdsPath = path.join(__dirname, "commands");
const files = fs
  .readdirSync(cmdsPath)
  .filter((f) => f.endsWith(".js") && !f.includes(".bak"));

console.log("🔍 Finding command files...");

for (const file of files) {
  const filePath = path.join(cmdsPath, file);
  try {
    const command = require(filePath);
    if (command?.data && command?.execute) {
      commands.push(command.data.toJSON());
      console.log(`✅ Loaded: ${file}`);
    } else {
      console.warn(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      );
    }
  } catch (error) {
    console.error(`❌ Failed to load command at ${filePath}:`, error);
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  if (commands.length === 0) {
    console.error("No commands were loaded. Aborting deployment.");
    return;
  }

  try {
    const appId = process.env.DISCORD_CLIENT_ID;
    if (!appId) {
      throw new Error("Missing DISCORD_CLIENT_ID in .env");
    }

    const guildId = process.env.DISCORD_GUILD_ID;

    if (guildId) {
      // Guild-specific deployment
      console.log(
        `\n🚀 Deploying ${commands.length} command(s) to guild ${guildId}...`,
      );
      const response = await rest.put(
        Routes.applicationGuildCommands(appId, guildId),
        {
          body: commands,
        },
      );
      console.log("Guild deploy response status: 200");
      console.log(JSON.stringify(response, null, 2));
      console.log("✅ Slash commands registered to guild successfully.");
    } else {
      // Global deployment
      console.log(`\n🚀 Deploying ${commands.length} command(s) globally...`);
      await rest.put(Routes.applicationCommands(appId), { body: commands });
      console.log("✅ Slash commands registered globally.");
      console.log(
        "⏱️  Note: Global commands can take up to an hour to appear on all servers.",
      );
    }
  } catch (e) {
    console.error("❌ Deployment failed:", e);
    process.exit(1);
  }
})();
