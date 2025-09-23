// index.js — slimy.ai entrypoint (CommonJS)
// - Loads .env
// - Wires @mention handler (handlers/mention.js)
// - Loads slash commands from ./commands (expects { data, execute })
// - Uses flags (MessageFlags.Ephemeral) instead of deprecated `ephemeral: true`

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  MessageFlags,
} = require('discord.js');

// ----- Env sanity (non-fatal warnings if missing) -----
['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'OPENAI_API_KEY'].forEach((k) => {
  if (!process.env[k]) console.warn(`[env] ${k} not set`);
});

// ----- Client -----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,     // required for @mentions
    GatewayIntentBits.MessageContent,    // must also be enabled in Dev Portal
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

// ----- Load slash commands from ./commands -----
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      const mod = require(path.join(commandsPath, file));
      const name = mod?.data?.name || mod?.name;
      if (name && typeof mod.execute === 'function') {
        client.commands.set(name, mod);
        console.log(`↳ loaded /${name}`);
      } else {
        console.warn(`⚠️ skipped ${file} (missing data.name or execute)`);
      }
    } catch (e) {
      console.warn(`⚠️ failed loading ${file}: ${e.message}`);
    }
  }
} else {
  console.warn('⚠️ ./commands not found');
}

// ----- Wire handlers (mention) -----
try {
  require('./handlers/mention')(client);
  console.log('✅ mention handler attached');
} catch (e) {
  console.warn(`⚠️ mention handler not attached: ${e.message}`);
}

// ----- Ready -----
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📡 Connected to ${c.guilds.cache.size} server(s)`);
});

// ----- Slash command router -----
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) {
    return interaction
      .reply({ content: 'Command not found.', flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }

  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`❌ /${interaction.commandName} error:`, err);
    const payload = {
      content: 'Something went sideways executing that command.',
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// ----- Boot -----
client.login(process.env.DISCORD_TOKEN);

console.log('🚀 Starting Discord bot...');
client.login(process.env.DISCORD_TOKEN);
