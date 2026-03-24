const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const token = process.env.DISCORD_TOKEN;
const clientId = "1415387116564910161";

const commands = [];
const cmdsPath = path.join("/opt/slimy/app/commands");
const files = fs.readdirSync(cmdsPath).filter(f => f.endsWith(".js") && !f.includes(".bak"));

console.log("Loading commands from", files.length, "files...");

for (const file of files) {
  const filePath = path.join(cmdsPath, file);
  try {
    const command = require(filePath);
    if (command?.data && command?.execute) {
      commands.push(command.data.toJSON());
      console.log("  Loaded:", command.data.name, "(" + file + ")");
    } else {
      console.log("  SKIP (no data/execute):", file);
    }
  } catch (e) {
    console.log("  FAIL:", file, "->", e.message.substring(0, 100));
  }
}

console.log("");
console.log("Total:", commands.length, "commands loaded");
console.log("");
console.log("Registering globally for app:", clientId);

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    const result = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log("Registered", result.length, "commands globally");
    result.forEach(c => console.log("  /" + c.name + " - " + (c.description || "").substring(0, 60)));
  } catch (e) {
    console.log("ERROR:", e.message);
    if (e.rawError) console.log(JSON.stringify(e.rawError, null, 2).substring(0, 500));
  }
})();
