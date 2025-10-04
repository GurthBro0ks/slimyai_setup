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
  if (/\b(help|stuck|overwhelm|reset)\b/.test(t)) s.mentor += 2;
  if (/\bidea|brainstorm|wild|meme|crazy\b/.test(t)) s.partner += 2;
  if (/\bcheck|verify|compare|risk|why\b/.test(t)) s.mirror += 2;
  if (/\bplan|steps|todo|ship|deploy|task|finish|close\b/.test(t)) s.operator += 2;
  for (const k of MODES) s[k] += Math.random() * 0.4; // tiny jitter
  return Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
}
const stamp = (body) => body;

// Lazy OpenAI client (so requiring this file never throws)
let openai = null;
function getOpenAI() {
  if (!openai) {
    const OpenAI = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

function summarizeCapabilities(persona) {
  if (!persona?.core_capabilities) return '';
  const parts = [];
  for (const [domain, skills] of Object.entries(persona.core_capabilities)) {
    if (!Array.isArray(skills) || !skills.length) continue;
    parts.push(`${domain}: ${skills.slice(0, 4).join(', ')}`);
  }
  return parts.length ? `Core capabilities → ${parts.join(' | ')}.` : '';
}

const FOCUS_MAP = {
  mentor: 'Mentor focus — calm reset and reduce overwhelm.',
  partner: 'Partner focus — playful idea generation.',
  mirror: 'Mirror focus — verify assumptions and reflect back risks.',
  operator: 'Operator focus — ship the next concrete step.',
};

function pickCatchphrase(persona, playful) {
  const phrases =
    (persona?.tone_and_voice?.catchphrases || persona?.catchphrases || []).filter(Boolean);
  if (!playful || !phrases.length) return '';
  return `Optional catchphrases when it fits: ${phrases.join(' / ')}.`;
}

function buildSystemPrompt({ persona, focus, activeModes, effective, context }) {
  const lines = [];
  if (persona?.tagline) lines.push(persona.tagline);
  if (persona?.about) lines.push(persona.about);

  const capabilities = summarizeCapabilities(persona);
  if (capabilities) lines.push(capabilities);

  if (activeModes.length) {
    lines.push(`Active channel modes → ${activeModes.join(', ')}.`);
    for (const mode of activeModes) {
      const detail = persona?.modes?.[mode];
      if (detail?.description) {
        lines.push(`${mode}: ${detail.description}`);
      }
      if (detail?.effects?.length) {
        lines.push(`Effects: ${detail.effects.join(', ')}.`);
      }
    }
  } else {
    lines.push('No explicit channel modes active — use baseline persona.');
  }

  const focusLine = FOCUS_MAP[focus] || 'Keep pace with the user and surface quick wins.';
  lines.push(focusLine);

  const playful = effective.personality && !effective.no_personality;
  const ratingUnrated = !!effective.rating_unrated;
  const ratingPG13 = !!effective.rating_pg13;
  if (effective.no_personality) {
    lines.push(
      `Tone → ${
        persona?.tone_and_voice?.no_personality || 'Stay neutral, concise, and low-flair.'
      }`,
    );
  } else if (playful) {
    lines.push(
      `Tone → ${
        persona?.tone_and_voice?.default || 'Playful banter with practical grounding.'
      }`,
    );
    const catchphraseLine = pickCatchphrase(persona, true);
    if (catchphraseLine) lines.push(catchphraseLine);
  } else {
    lines.push(
      `Tone → ${
        persona?.tone_and_voice?.technical || 'Direct, concise, lightly sassy when helpful.'
      }`,
    );
  }

  if (ratingUnrated) {
    lines.push(
      'Content rating: Unrated — respond with maximum creative freedom allowed by platform policies. Swear lightly if it matches the user’s energy, and keep imagery vivid unless explicitly unsafe.',
    );
  } else if (ratingPG13) {
    lines.push(
      'Content rating: Rated PG-13 — keep language, humor, and imagery within PG-13 guidelines; no explicit adult content.',
    );
  } else {
    lines.push('Content rating: default — keep replies suitable for a general audience.');
  }

  if (effective.admin) {
    lines.push('When admin topics surface, surface sharp configuration guidance.');
  }

  if (effective.super_snail && persona?.message_handling?.snail_pipeline) {
    const steps = persona.message_handling.snail_pipeline.steps?.join(' → ');
    if (steps) {
      lines.push(`Super Snail pipeline: ${steps}.`);
    }
  }

  lines.push('Keep replies Discord-sized, ADHD-aware, with quick wins and branching next steps.');
  if (context === 'mention') {
    lines.push('Answer inline directly. Never mention, suggest, or reference any slash commands like /chat, /mode, or any other commands. Provide complete answers without referring to other bot features.');
  } else {
    lines.push('Close with the clearest next actions—no specific catchphrase required.');
  }

  return lines.join(' ');
}

function historyKey({ guildId, channelId, userId }) {
  return `${guildId || 'dm'}:${channelId}:${userId}`;
}

async function runConversation({
  userId,
  channelId,
  guildId,
  parentId,
  userMsg,
  reset = false,
  context = 'slash',
  effectiveOverride,
}) {
  const key = historyKey({ guildId, channelId, userId });
  if (reset) histories.delete(key);
  let history = histories.get(key) || [];
  if (context === 'mention' && history.length) {
    const cleaned = history.filter(
      (entry) => !(entry.role === 'assistant' && /\/[a-z]+/i.test(entry.content || '')),
    );
    if (cleaned.length !== history.length) {
      history = cleaned;
    }
  }
  history.push({ role: 'user', content: userMsg });
  while (history.length > MAX_TURNS * 2) history.shift();
  histories.set(key, history);

  const persona = personaStore.getPersona();
  const effective = effectiveOverride || buildEmptyModeState();
  const activeModes = Object.entries(effective)
    .filter(([, value]) => value)
    .map(([key]) => key);

  const focus = autoDetect(userMsg);
  const system = buildSystemPrompt({ persona, focus, activeModes, effective, context });

  const ai = getOpenAI();
  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, ...history],
    temperature: 0.6,
  });

  let text = response.choices?.[0]?.message?.content?.trim() || '(no content)';
  text = stamp(text);

  history.push({ role: 'assistant', content: text });
  histories.set(key, history);

  const truncated = text.length > 1900 ? text.slice(0, 1900) + '…' : text;
  return {
    response: truncated,
    persona,
    effective,
    focus,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with slimy.ai')
    .addStringOption((o) =>
      o.setName('message')
        .setDescription('What do you want to say?')
        .setRequired(true)
    )
    .addBooleanOption((o) =>
      o.setName('reset')
        .setDescription('Forget previous context in this channel')
    ),

  async execute(interaction) {
    const userMsg = interaction.options.getString('message', true);
    const reset = interaction.options.getBoolean('reset') || false;

    if (!process.env.OPENAI_API_KEY) {
      return interaction.reply({ content: '❌ OPENAI_API_KEY not set.' });
    }

    await interaction.deferReply();

    try {
      const parentId = interaction.channel?.parentId || interaction.channel?.parent?.id;
      const effectiveModes = getEffectiveModesForChannel(interaction.guild, interaction.channel);
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
