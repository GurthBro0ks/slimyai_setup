// index.js - PRODUCTION READY
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  MessageFlags
} = require('discord.js');

// ---- Singleton guard ----
const LOCK_FILE = path.join(__dirname, '.slimy-singleton.lock');

function ensureSingleInstance() {
  const cleanup = () => {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        console.warn('[WARN] Failed to remove singleton lock:', err.message);
      }
    }
  };

  const writeLock = () => {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
  };

  try {
    writeLock();
  } catch (err) {
    if (err?.code === 'EEXIST') {
      try {
        const existingPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
        if (existingPid && existingPid !== process.pid) {
          try {
            process.kill(existingPid, 0);
            console.error(`❌ Another slimy-bot instance is already running (pid ${existingPid}). Exiting.`);
            process.exit(1);
          } catch (killErr) {
            if (killErr?.code === 'ESRCH') {
              fs.unlinkSync(LOCK_FILE);
              return ensureSingleInstance();
            }
            console.error('[ERROR] Could not verify existing PID:', killErr.message);
            process.exit(1);
          }
        } else {
          fs.unlinkSync(LOCK_FILE);
          return ensureSingleInstance();
        }
      } catch (readErr) {
        console.warn('[WARN] Corrupt singleton lock detected, resetting:', readErr.message);
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch (unlinkErr) {
          console.error('[ERROR] Failed to reset singleton lock:', unlinkErr.message);
          process.exit(1);
        }
        return ensureSingleInstance();
      }
    } else {
      console.error('[ERROR] Unable to create singleton lock:', err.message);
      process.exit(1);
    }
  }

  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      cleanup();
      process.exit(0);
    });
  }
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    if (global.botStats) recordError(err);
    cleanup();
    process.exit(1);
  });
}

ensureSingleInstance();

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

global.client = client;

// ---- Bot statistics (for /diag v2) ----
global.botStats = {
  startTime: Date.now(),
  errors: {
    count: 0,
    lastError: null,
    lastErrorTime: null,
  },
};

/**
 * Record an error in bot stats
 */
function recordError(err) {
  global.botStats.errors.count++;
  global.botStats.errors.lastError = err.message || String(err);
  global.botStats.errors.lastErrorTime = Date.now();
}

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

// ---- Ready (only fires ONCE) ----
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📡 Connected to ${c.guilds.cache.size} server(s)`);
});

// ---- Slash command dispatcher ----
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({ 
        content: '❌ Unknown command.', 
        flags: MessageFlags.Ephemeral 
      }).catch(() => {});
    }
    
    await command.execute(interaction);
  } catch (err) {
    console.error('Command error:', err);
    recordError(err); // Track error in stats

    // Safe error handling
    try {
      if (interaction.deferred) {
        await interaction.editReply('❌ Command failed.');
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ Command failed.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: '❌ Command failed.',
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (innerErr) {
      console.error('Could not send error message:', innerErr.message);
      recordError(innerErr);
    }
  }
});

// ---- Mention handler (graceful loading) ----
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

// ---- Snail auto-detect handler (graceful loading) ----
try {
  const snailHandlerPath = path.join(__dirname, 'handlers', 'snail-auto-detect.js');
  if (fs.existsSync(snailHandlerPath)) {
    const { attachSnailAutoDetect } = require('./handlers/snail-auto-detect');
    if (typeof attachSnailAutoDetect === 'function') {
      attachSnailAutoDetect(client);
      console.log('✅ Snail auto-detect handler attached');
    }
  }
} catch (err) {
  console.warn('[WARN] Snail auto-detect handler not loaded:', err.message);
}

// ---- Login (ONLY ONCE) ----
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not set in environment.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
