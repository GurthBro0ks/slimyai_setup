// commands/chat.js
const { SlashCommandBuilder } = require('discord.js');
const mem = require('../lib/memory');
const personaStore = require('../lib/persona');

// Short history per (channelId,userId)
const histories = new Map();
const keyOf = (interaction) => `${interaction.channelId}:${interaction.user.id}`;
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
const stamp = (body) => `${body}\n\nWhere we left off → Next step.`;

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

function buildSystemPrompt({ persona, focus, activeModes, effective }) {
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
  lines.push('Always end with: "Where we left off → Next step."');

  return lines.join(' ');
}

// Lazy OpenAI client (so requiring this file never throws)
let openai = null;
function getOpenAI() {
  if (!openai) {
    const OpenAI = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
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

    // acknowledge quickly so the token doesn’t expire
    await interaction.deferReply();

    // manage short history
    const key = keyOf(interaction);
    if (reset) histories.delete(key);
    const history = histories.get(key) || [];
    history.push({ role: 'user', content: userMsg });
    while (history.length > MAX_TURNS * 2) history.shift();
    histories.set(key, history);

    try {
      const mode = autoDetect(userMsg);
      const persona = personaStore.getPersona();
      const effective = await mem.getEffectiveModes({
        guildId: interaction.guildId || undefined,
        channelId: interaction.guildId ? interaction.channelId : undefined,
        parentId: interaction.guildId
          ? interaction.channel?.parentId || interaction.channel?.parent?.id
          : undefined,
      });
      const activeModes = Object.entries(effective)
        .filter(([, value]) => value)
        .map(([key]) => key);
      const system = buildSystemPrompt({
        persona,
        focus: mode,
        activeModes,
        effective,
      });

      const ai = getOpenAI();
      const response = await ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...history],
        temperature: 0.6,
      });

      let text = response.choices?.[0]?.message?.content?.trim() || '(no content)';
      text = stamp(text);

      // record assistant turn
      history.push({ role: 'assistant', content: text });
      histories.set(key, history);

      const out = text.length > 1900 ? text.slice(0, 1900) + '…' : text;
      await interaction.editReply({ content: out });
    } catch (err) {
      console.error('OpenAI error:', err);
      const msg = (err?.response?.data?.error?.message) || err.message || String(err);
      await interaction.editReply({ content: `❌ OpenAI error: ${msg}` });
    }
  },
};
