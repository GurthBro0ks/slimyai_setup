// commands/chat.js
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const personaStore = require('../lib/persona');
const { maybeReplyWithImage } = require('../lib/auto-image');
const modeHelper = require('../lib/modes');
const { formatChatDisplay } = require('../lib/text-format');

const THREAD_TYPES = new Set([
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

function buildEmptyModeState() {
  const state = {};
  for (const key of modeHelper.MODE_KEYS) state[key] = false;
  return state;
}

function resolveModeContext(channel) {
  if (!channel) return null;
  const parents = [];
  let targetType = 'channel';
  const channelType = channel.type;

  if (channelType === ChannelType.GuildCategory) {
    targetType = 'category';
  } else if (THREAD_TYPES.has(channelType)) {
    targetType = 'thread';
    if (channel.parentId) {
      parents.push({ targetId: channel.parentId, targetType: 'channel' });
      const parentChannel = channel.guild?.channels?.cache?.get(channel.parentId) || channel.parent;
      if (parentChannel?.parentId) {
        parents.push({ targetId: parentChannel.parentId, targetType: 'category' });
      }
    }
  } else {
    targetType = 'channel';
    if (channel.parentId) {
      parents.push({ targetId: channel.parentId, targetType: 'category' });
    }
  }

  return { targetId: channel.id, targetType, parents };
}

function getEffectiveModesForChannel(guild, channel) {
  if (!guild || !channel) return buildEmptyModeState();
  const context = resolveModeContext(channel);
  if (!context) return buildEmptyModeState();
  const view = modeHelper.viewModes({
    guildId: guild.id,
    targetId: context.targetId,
    targetType: context.targetType,
    parents: context.parents,
  });
  return view.effective.modes;
}

// Short history per (channelId,userId)
const histories = new Map();
const MAX_TURNS = 8;

// Lightweight auto-mode detect
const MODES = ['mentor', 'partner', 'mirror', 'operator'];
function autoDetect(text = '') {
  const t = text.toLowerCase();
  const s = { mentor: 0, partner: 0, mirror: 0, operator: 0 };
  if (/\b(help|guide|teach|explain|stuck)\b/i.test(t)) s.mentor += 2;
  if (/\b(calm|slow|reset|pause|breathe)\b/i.test(t)) s.mentor += 3;
  if (/\b(brainstorm|idea|creative|wild|fun)\b/i.test(t)) s.partner += 2;
  if (/\b(evaluate|compare|option|choose|decide)\b/i.test(t)) s.mirror += 2;
  if (/\b(plan|organize|schedule|task|checklist)\b/i.test(t)) s.operator += 2;
  const top = MODES.reduce((a, m) => (s[m] > s[a] ? m : a), 'mentor');
  return s[top] > 0 ? top : 'mentor';
}

async function runConversation({
  userId,
  channelId,
  guildId,
  parentId,
  userMsg,
  reset = false,
  context = 'slash',
  effectiveOverride = null,
}) {
  const key = `${channelId}:${userId}`;
  if (reset) histories.delete(key);

  let history = histories.get(key) || [];
  history.push({ role: 'user', content: userMsg });
  if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);
  histories.set(key, history);

  const detectedMode = autoDetect(userMsg);
  let persona = personaStore.getPersona(detectedMode);

  let effectiveModes = effectiveOverride;
  if (!effectiveModes) {
    const channel = global.client?.channels?.cache?.get(channelId);
    const guild = guildId ? global.client?.guilds?.cache?.get(guildId) : null;
    effectiveModes = getEffectiveModesForChannel(guild, channel);
  }

  if (effectiveModes.personality) {
    persona = personaStore.getPersona('personality');
  } else if (effectiveModes.no_personality) {
    persona = personaStore.getPersona('no_personality');
  }

  const systemPrompt = persona.prompt || 'You are a helpful assistant.';
  const messages = [{ role: 'system', content: systemPrompt }, ...history];

  const openai = require('../lib/openai');
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages,
    temperature: 0.8,
    max_tokens: 1000,
  });

  const response = completion.choices[0]?.message?.content || 'No response.';
  history.push({ role: 'assistant', content: response });
  histories.set(key, history);

  return { response, persona: persona.name };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with slimy.ai')
    .addStringOption((o) =>
      o.setName('message').setDescription('Your message').setRequired(true),
    )
    .addBooleanOption((o) =>
      o.setName('reset').setDescription('Start a fresh conversation'),
    ),

  async execute(interaction) {
    const userMsg = interaction.options.getString('message', true);
    const reset = interaction.options.getBoolean('reset') || false;

    if (!process.env.OPENAI_API_KEY) {
      return interaction.reply({
        content: '❌ OPENAI_API_KEY is not set.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const parentId = interaction.channel?.parentId || interaction.channel?.parent?.id;
      const effectiveModes = getEffectiveModesForChannel(interaction.guild, interaction.channel);
      
      // FIX: Use the new mode keys
      const rating = effectiveModes.rating_unrated
        ? 'unrated'
        : effectiveModes.rating_pg13
        ? 'pg13'
        : 'default';

      const handledImage = await maybeReplyWithImage({
        interaction,
        prompt: userMsg,
        rating,
      });
      if (handledImage) {
        return;
      }

      const result = await runConversation({
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId || undefined,
        parentId,
        userMsg,
        reset,
        context: 'slash',
        effectiveOverride: effectiveModes,
      });

      const userLabel = interaction.member?.displayName || interaction.user.username;
      const content = formatChatDisplay({
        userLabel,
        userMsg,
        persona: result.persona,
        response: result.response,
      });
      await interaction.editReply({ content });
    } catch (err) {
      console.error('OpenAI error:', err);
      const msg = err?.response?.data?.error?.message || err.message || String(err);
      await interaction.editReply({ content: `❌ OpenAI error: ${msg}` });
    }
  },

  runConversation,
  formatChatDisplay,
  getEffectiveModesForChannel,
};
