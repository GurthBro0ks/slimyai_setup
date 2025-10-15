const openai = require('./openai');
const db = require('./database');

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

async function generateImageWithSafety({
  prompt,
  originalPrompt,
  styleName,
  styleKey,
  dalleStyle,
  rating = 'default',
  userId,
  guildId = null,
  channelId = null,
}) {
  try {
    // Generate the image using DALL-E
    const buffer = await generateImage({
      prompt,
      size: '1024x1024',
    });

    // Log successful generation
    if (db.isConfigured()) {
      try {
        await db.logImageGeneration({
          userId,
          guildId,
          channelId,
          prompt: originalPrompt,
          enhancedPrompt: prompt,
          style: styleKey,
          rating,
          success: true,
          errorMessage: null,
          imageUrl: null
        });
      } catch (dbErr) {
        console.error('[images] Failed to log generation:', dbErr.message);
        // Continue even if logging fails
      }
    }

    return {
      success: true,
      buffer
    };
  } catch (err) {
    // Log failed generation
    if (db.isConfigured()) {
      try {
        await db.logImageGeneration({
          userId,
          guildId,
          channelId,
          prompt: originalPrompt,
          enhancedPrompt: prompt,
          style: styleKey,
          rating,
          success: false,
          errorMessage: err.message,
          imageUrl: null
        });
      } catch (dbErr) {
        console.error('[images] Failed to log error:', dbErr.message);
      }
    }

    return {
      success: false,
      message: `❌ Image generation failed: ${err.message}`
    };
  }
}

module.exports = {
  generateImage,
  generateImageWithSafety,
};
