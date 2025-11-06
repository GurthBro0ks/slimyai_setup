const openai = require("./openai");
const db = require("./database");

async function generateImage({
  prompt,
  size = "1024x1024",
  quality = "standard",
}) {
  const model = process.env.IMAGE_MODEL || "dall-e-3";
  const result = await openai.images.generate({
    model,
    prompt,
    size,
    quality, // "standard" or "hd"
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
  quality = "standard",
  userId,
  guildId = null,
  channelId = null,
}) {
  const model = process.env.IMAGE_MODEL || "dall-e-3";

  // Apply rating-based prompt modifications
  let finalPrompt = prompt;
  if (rating === "pg13") {
    // PG-13: Family-friendly content
    finalPrompt = `${prompt}\n\nContent guidelines: Keep imagery appropriate for ages 13+; avoid explicit content.`;
  } else if (rating === "unrated") {
    // Unrated: No artificial restrictions, full creative freedom
    // Let DALL-E use its native judgment without extra constraints
    finalPrompt = prompt;
  } else {
    // Default: General audience
    finalPrompt = `${prompt}\n\nContent guidelines: Keep imagery appropriate for a general audience.`;
  }

  try {
    // Generate the image using DALL-E
    const buffer = await generateImage({
      prompt: finalPrompt,
      size: "1024x1024",
      quality,
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
          quality,
          model,
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
          quality,
          model,
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
