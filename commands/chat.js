// commands/chat.js
const { SlashCommandBuilder } = require('discord.js');
const openai = require('../lib/openai');

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
      const effectiveModes = modeHelper.getEffectiveModesForChannel(interaction.guild, interaction.channel);
      
      // FIX: Use the new mode keys
      const rating = effectiveModes.rating_unrated
        ? 'unrated'
        : effectiveModes.rating_pg13
        ? 'pg13'
        : 'default';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...history],
        temperature: 0.6,
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
};
