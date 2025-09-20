// commands/chat.js
const { SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tiny in-memory history per (channelId,userId)
const histories = new Map();
const keyOf = (interaction) => `${interaction.channelId}:${interaction.user.id}`;
const MAX_TURNS = 8; // keep it lightweight

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with slimy.ai')
    .addStringOption(o =>
      o.setName('message')
       .setDescription('What do you want to say?')
       .setRequired(true)
    )
    .addBooleanOption(o =>
      o.setName('reset')
       .setDescription('Forget previous context in this channel')
    ),

  async execute(interaction) {
    const userMsg = interaction.options.getString('message', true);
    const reset = interaction.options.getBoolean('reset') || false;

    if (!process.env.OPENAI_API_KEY) {
      return interaction.reply({ content: '❌ OPENAI_API_KEY not set.', ephemeral: true });
    }

    await interaction.deferReply(); // give us time

    // manage history
    const key = keyOf(interaction);
    if (reset) histories.delete(key);

    const history = histories.get(key) || [];
    history.push({ role: 'user', content: userMsg });
    // clamp history
    while (history.length > MAX_TURNS * 2) history.shift();
    histories.set(key, history);

    try {
      const response = await client.chat.completions.create({
        // small+cheap but good; change if you like
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are slimy.ai, a helpful, concise Discord assistant.' },
          ...history
        ],
        temperature: 0.7,
      });

      const text = response.choices?.[0]?.message?.content?.trim() || '(no content)';
      history.push({ role: 'assistant', content: text });
      histories.set(key, history);

      // Discord max message length guard
      const out = text.length > 1900 ? text.slice(0, 1900) + '…' : text;
      await interaction.editReply(out);
    } catch (err) {
      console.error('OpenAI error:', err);
      const msg = (err?.response?.data?.error?.message) || err.message || String(err);
      await interaction.editReply(`❌ OpenAI error: ${msg}`);
    }
  }
};

