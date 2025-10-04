// commands/chat.js
const { SlashCommandBuilder } = require('discord.js');

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
      const system = [
        `You are slimy.ai, a Discord-native AI.`,
        `Mode: ${mode} (mentor=calm reset, partner=playful ideas, mirror=verify/reflect, operator=steps/ship).`,
        `ADHD-aware: give quick wins and branching next steps.`,
        `Keep answers concise and practical for Discord.`,
        `Always end with: "Where we left off → Next step."`,
      ].join(' ');

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
