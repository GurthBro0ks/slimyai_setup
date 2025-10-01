// commands/diag.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  GatewayIntentBits,
  Events,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diag')
    .setDescription('Slimy health check (intents, perms, @mention readiness)'),

  async execute(interaction) {
    const c = interaction.client;

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
      `**Runtime**`,
      `• Logged in as: ${c.user?.tag || '(not ready)'}`,
      `• Node: ${process.version} | PID: ${process.pid}`,
      ``,
      `**Env keys**`,
      `• DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? '✅ set' : '❌ missing'}`,
      `• OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ set' : '⚠ optional/empty'}`,
      ``,
      `**Intents (client)**`,
      `• Guilds: ${has(GatewayIntentBits.Guilds)}`,
      `• GuildMessages: ${has(GatewayIntentBits.GuildMessages)} (required for @mentions)`,
      `• MessageContent: ${has(GatewayIntentBits.MessageContent)} (must also be enabled in Dev Portal)`,
      ``,
      `**Channel permissions (@here)**`,
      `• ViewChannel: ${need(PermissionFlagsBits.ViewChannel)}`,
      `• SendMessages: ${need(PermissionFlagsBits.SendMessages)}`,
      `• ReadMessageHistory: ${need(PermissionFlagsBits.ReadMessageHistory)}`,
      ``,
      `**Handlers**`,
      `• mention handler: ${mentionStatus} (listeners: ${mentionListeners})`,
      ``,
      `**How to test @mention**`,
      `1) In this channel, type:  @${c.user?.username} pingtest`,
      `2) Expect a fast “🏓 pong!” reply. If no reply:`,
      `   - Dev Portal → Bot → Message Content Intent = ON`,
      `   - This channel’s perms (see above)`,
      `   - Intents here show ✅`,
    ];

    return interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
};
