// index.js - FIXED ERROR HANDLING
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

// ---- Client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel],
});

// ---- Command loader ----
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const fp = path.join(commandsPath, file);
    try {
      const cmd = require(fp);
      if (cmd?.data && cmd?.execute) {
        client.commands.set(cmd.data.name, cmd);
        console.log(`✅ Loaded command: ${cmd.data.name}`);
      } else {
        console.warn(`[WARN] Skipping ${file}: missing data/execute`);
      }
    } catch (err) {
      console.error(`[ERROR] Failed to load ${file}:`, err.message);
    }
  }
} else {
  console.warn('[WARN] ./commands directory not found');
}

// ---- Ready ----
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📡 Connected to ${c.guilds.cache.size} server(s)`);
});

// ---- Slash command dispatcher with SAFE error handling ----
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({ 
        content: '❌ Unknown command.', 
        ephemeral: true 
      }).catch(() => {});
    }
    
    await command.execute(interaction);
  } catch (err) {
    console.error('Command error:', err);
    
    // SAFE ERROR RESPONSE - try multiple fallbacks
    try {
      if (interaction.deferred) {
        // If deferred, edit the reply
        await interaction.editReply('❌ Command failed.');
      } else if (interaction.replied) {
        // If already replied, follow up
        await interaction.followUp({ 
          content: '❌ Command failed.', 
          ephemeral: true 
        });
      } else {
        // If not yet responded, reply now
        await interaction.reply({ 
          content: '❌ Command failed.', 
          ephemeral: true 
        });
      }
    } catch (innerErr) {
      // If all else fails, just log it
      console.error('Could not send error message to user:', innerErr.message);
    }
  }
});

// ---- Mention handler (optional) ----
try {
  const mentionHandlerPath = path.join(__dirname, 'handlers', 'mention.js');
  if (fs.existsSync(mentionHandlerPath)) {
    const { attachMentionHandler } = require('./handlers/mention');
    if (typeof attachMentionHandler === 'function') {
      attachMentionHandler(client);
      console.log('✅ Mention handler attached');
    }
  }
} catch (err) {
  console.warn('[WARN] Mention handler not loaded:', err.message);
}

// ---- Login ----
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not set in environment.');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
