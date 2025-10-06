// commands/diag.js - V2
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  GatewayIntentBits,
  Events,
} = require('discord.js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diag')
    .setDescription('Slimy health check v2 (intents, perms, uptime, git commit)'),

  async execute(interaction) {
    const c = interaction.client;

    // ---- V2 FEATURES: Git commit and uptime ----
    let gitCommit = 'unknown';
    try {
      gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
      // Fallback: try reading .git/HEAD directly
      try {
        const gitDir = path.join(process.cwd(), '.git');
        const headFile = path.join(gitDir, 'HEAD');
        if (fs.existsSync(headFile)) {
          const head = fs.readFileSync(headFile, 'utf8').trim();
          if (head.startsWith('ref:')) {
            const ref = head.substring(5).trim();
            const refFile = path.join(gitDir, ref);
            if (fs.existsSync(refFile)) {
              gitCommit = fs.readFileSync(refFile, 'utf8').trim().substring(0, 7);
            }
          } else {
            gitCommit = head.substring(0, 7);
          }
        }
      } catch (fallbackErr) {
        gitCommit = 'unavailable';
      }
    }

    // Calculate uptime
    const stats = global.botStats || { startTime: Date.now(), errors: { count: 0 } };
    const uptimeMs = Date.now() - stats.startTime;
    const uptimeSec = Math.floor(uptimeMs / 1000);
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    const uptimeStr = days > 0
      ? `${days}d ${hours}h ${minutes}m ${seconds}s`
      : hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

    const errorCount = stats.errors?.count || 0;
    const lastError = stats.errors?.lastError || 'none';
    const lastErrorTime = stats.errors?.lastErrorTime
      ? new Date(stats.errors.lastErrorTime).toISOString()
      : 'never';
    // ---- End V2 features ----

    const intents = c.options?.intents;
    const has = (bit) => intents && intents.has ? (intents.has(bit) ? '✅' : '❌') : '❓';

    const chanPerms = interaction.channel?.permissionsFor?.(c.user) || null;
    const need = (flag) => chanPerms?.has?.(flag) ? '✅' : '❌';

    const mentionListeners = c.listenerCount?.(Events.MessageCreate) ?? 0;
    const mentionStatus = (() => {
      if (mentionListeners <= 0) return '❌ not attached';
      return c.mentionHandlerReady ? '✅ ready' : '⚠ attached (pending ready)';
    })();

    const lines = [
      `**🤖 Slimy.ai Diagnostics v2**`,
      ``,
      `**📊 Runtime**`,
      `• Logged in as: ${c.user?.tag || '(not ready)'}`,
      `• Node: ${process.version} | PID: ${process.pid}`,
      `• Git commit: \`${gitCommit}\``,
      `• Uptime: ${uptimeStr}`,
      `• Errors: ${errorCount} total`,
      errorCount > 0 ? `  └─ Last: "${lastError}" at ${lastErrorTime}` : '',
      ``,
      `**🔑 Env keys**`,
      `• DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? '✅ set' : '❌ missing'}`,
      `• OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ set' : '⚠ optional/empty'}`,
      ``,
      `**📡 Intents (client)**`,
      `• Guilds: ${has(GatewayIntentBits.Guilds)}`,
      `• GuildMessages: ${has(GatewayIntentBits.GuildMessages)} (required for @mentions)`,
      `• MessageContent: ${has(GatewayIntentBits.MessageContent)} (must also be enabled in Dev Portal)`,
      ``,
      `**🔒 Channel permissions (@here)**`,
      `• ViewChannel: ${need(PermissionFlagsBits.ViewChannel)}`,
      `• SendMessages: ${need(PermissionFlagsBits.SendMessages)}`,
      `• ReadMessageHistory: ${need(PermissionFlagsBits.ReadMessageHistory)}`,
      ``,
      `**⚙️ Handlers**`,
      `• mention handler: ${mentionStatus} (listeners: ${mentionListeners})`,
      ``,
      `**🧪 How to test @mention**`,
      `1) In this channel, type:  @${c.user?.username} pingtest`,
      `2) Expect a fast "🏓 pong!" reply. If no reply:`,
      `   - Dev Portal → Bot → Message Content Intent = ON`,
      `   - This channel's perms (see above)`,
      `   - Intents here show ✅`,
    ].filter(line => line !== ''); // Remove empty strings from conditional lines

    return interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
};
