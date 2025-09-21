// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events
} = require('discord.js');
const { attachMentionHandler } = require('./handlers/mention');

// ---- Client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,   // REQUIRED for @mentions
    GatewayIntentBits.MessageContent,  // MUST be enabled in Dev Portal too
    GatewayIntentBits.DirectMessages   // optional
  ],
  partials: [Partials.Channel],        // allow DMs
});

// ---- Command loader (from ./commands/*.js) ----
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const fp = path.join(commandsPath, file);
    const cmd = require(fp);
    if (cmd?.data && cmd?.execute) {
      client.commands.set(cmd.data.name, cmd);
    } else {
      console.warn(`[WARN] Skipping ${file}: missing data/execute`);
    }
  }
} else {
  console.warn('[WARN] ./commands directory not found');
}

// ---- Ready ----
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

// ---- Slash command dispatcher ----
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    }
    await command.execute(interaction);
  } catch (err) {
    console.error('Command error:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Command failed.');
    } else {
      await interaction.reply({ content: '❌ Command failed.', ephemeral: true });
    }
  }
});

// ---- Mention handler ----
attachMentionHandler(client);

// ---- Login ----
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not set in environment.');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);

