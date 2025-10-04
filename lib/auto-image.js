const { AttachmentBuilder } = require('discord.js');
const { detectImageIntent } = require('./image-intent');
const { generateImage } = require('./images');

async function maybeReplyWithImage({ interaction, message, prompt }) {
  const isInteraction = Boolean(interaction);
  if (!prompt || !detectImageIntent(prompt)) return false;
  if (!process.env.OPENAI_API_KEY) return false;

  const size = process.env.AUTO_IMAGE_SIZE || '1024x1024';

  let buffer;
  try {
    buffer = await generateImage({ prompt, size });
  } catch (err) {
    const msg = err?.message || 'Image generation failed.';
    const payload = {
      content: `❌ Unable to generate image automatically: ${msg}`,
    };
    if (isInteraction) {
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } else if (message) {
      await message.reply(payload).catch(() => {});
    }
    return true;
  }
  const file = new AttachmentBuilder(buffer, {
    name: `slimy-auto-image-${Date.now()}.png`,
  });

  const safePrompt = prompt.length > 1800 ? `${prompt.slice(0, 1797)}…` : prompt;
  const responsePayload = {
    content: `🖼️ Prompt: ${safePrompt}`,
    files: [file],
  };

  if (isInteraction) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(responsePayload);
    } else {
      await interaction.reply(responsePayload);
    }
  } else if (message) {
    await message.reply(responsePayload);
  }

  return true;
}

module.exports = {
  maybeReplyWithImage,
};
