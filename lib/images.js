const openai = require('./openai');
const database = require('./database');

const DEFAULT_IMAGE_MODEL = process.env.IMAGE_MODEL || 'dall-e-3';
const DEFAULT_IMAGE_SIZE = process.env.IMAGE_SIZE || '1024x1024';
const MODERATION_MODEL = process.env.MODERATION_MODEL || 'omni-moderation-latest';

async function generateImage({ prompt, size = DEFAULT_IMAGE_SIZE, style = 'vivid' }) {
  const result = await openai.images.generate({
    model: DEFAULT_IMAGE_MODEL,
    prompt,
    size,
    style,
    quality: 'standard',
    response_format: 'b64_json',
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no content');
  return Buffer.from(b64, 'base64');
}

async function runModerationCheck(prompt) {
  const response = await openai.moderations.create({
    model: MODERATION_MODEL,
    input: prompt,
  });

  const result = response.results?.[0];
  if (!result) return { flagged: false };

  return {
    flagged: Boolean(result.flagged),
    categories: result.categories,
  };
}

async function generateImageWithSafety({
  prompt,
  originalPrompt,
  styleName,
  styleKey,
  dalleStyle = 'vivid',
  rating = 'default',
  userId,
  guildId,
  channelId,
}) {
  if (!prompt) {
    return { success: false, message: 'Prompt is required for image generation.' };
  }

  try {
    if (rating === 'pg13') {
      const moderation = await runModerationCheck(prompt);
      if (moderation.flagged) {
        return {
          success: false,
          message: '⚠️ Prompt blocked by safety filters. Try a more family-friendly description.',
        };
      }
    }

    const buffer = await generateImage({ prompt, style: dalleStyle });

    if (database.isConfigured?.()) {
      try {
        await database.logImageGeneration({
          userId,
          guildId,
          channelId,
          prompt: originalPrompt || prompt,
          enhancedPrompt: prompt,
          style: styleKey,
          rating,
          success: true,
          errorMessage: null,
          imageUrl: null,
        });
      } catch (err) {
        console.warn('[images] Failed to log successful generation:', err.message);
      }
    }

    return {
      success: true,
      buffer,
      styleName,
      styleKey,
    };

  } catch (err) {
    console.error('[images] Image generation failed:', err);

    if (database.isConfigured?.()) {
      try {
        await database.logImageGeneration({
          userId,
          guildId,
          channelId,
          prompt: originalPrompt || prompt,
          enhancedPrompt: prompt,
          style: styleKey,
          rating,
          success: false,
          errorMessage: err?.response?.data?.error?.message || err.message || 'Unknown error',
          imageUrl: null,
        });
      } catch (logErr) {
        console.warn('[images] Failed to log failed generation:', logErr.message);
      }
    }

    const errorMessage = err?.response?.data?.error?.message || err.message || 'Unknown error';
    return {
      success: false,
      message: `❌ Image generation failed: ${errorMessage}`,
    };
  }
}

module.exports = {
  generateImage,
  generateImageWithSafety,
};
