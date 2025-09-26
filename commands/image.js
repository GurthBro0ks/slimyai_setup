// commands/image.js
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const openai = require('../lib/openai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('image')
    .setDescription('Generate an image from a prompt')
    .addStringOption(o =>
      o.setName('prompt')
       .setDescription('Describe the image')
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('size')
       .setDescription('Image size')
       .addChoices(
         { name: '512x512', value: '512x512' },
         { name: '1024x1024', value: '1024x1024' }
       )
    ),
  async execute(interaction) {
    if (!process.env.OPENAI_API_KEY) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'OPENAI_API_KEY is not set.' });
    }

    const prompt = interaction.options.getString('prompt', true);
    const size = interaction.options.getString('size') || '1024x1024';

    await interaction.deferReply();

    // Optional moderation for the text prompt
    try {
      if (process.env.OPENAI_MODERATE === '1') {
        const mod = await openai.moderations.create({
          model: 'omni-moderation-latest',
          input: prompt,
        });
        if (mod.results?.[0]?.flagged) {
          return interaction.editReply('⚠️ That image prompt was flagged by safety filters.');
        }
      }
    } catch (e) {
      console.warn('Moderation error:', e?.message || e);
    }

    const result = await openai.images.generate({
      model: process.env.IMAGE_MODEL || 'gpt-image-1',
      prompt,
      size,            // '512x512' | '1024x1024'
      // You can also pass: background: 'transparent', or 'png' via response_format
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return interaction.editReply('No image returned.');
    const buffer = Buffer.from(b64, 'base64');
    const file = new AttachmentBuilder(buffer, { name: 'image.png' });

    return interaction.editReply({ content: `Prompt: ${prompt}`, files: [file] });
  },
};

