const openai = require("./openai");
const db = require("./database");

async function generateImage({ prompt, size = "1024x1024" }) {
  const result = await openai.images.generate({
    model: process.env.IMAGE_MODEL || "dall-e-3",
    prompt,
    size,
    response_format: "b64_json",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API returned no content");
  return Buffer.from(b64, "base64");
}

async function generateImageWithSafety({
  prompt,
  originalPrompt,
  styleName: _styleName,
  styleKey,
  dalleStyle: _dalleStyle,
  rating = "default",
  userId,
  guildId = null,
  channelId = null,
}) {
  try {
    // Generate the image using DALL-E
    const buffer = await generateImage({
      prompt,
      size: "1024x1024",
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
          imageUrl: null,
        });
      } catch (dbErr) {
        console.error("[images] Failed to log generation:", dbErr.message);
        // Continue even if logging fails
      }
    }

    return {
      success: true,
      buffer,
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
          imageUrl: null,
        });
      } catch (dbErr) {
        console.error("[images] Failed to log error:", dbErr.message);
      }
    }

    return {
      success: false,
      message: `❌ Image generation failed: ${err.message}`,
    };
  }
}

module.exports = {
  generateImage,
  generateImageWithSafety,
};
