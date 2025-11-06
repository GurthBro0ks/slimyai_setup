const { AttachmentBuilder } = require("discord.js");
const { detectImageIntent } = require("./image-intent");
const { generateImage } = require("./images");

async function maybeReplyWithImage({
  interaction,
  message,
  prompt,
  rating = "default",
}) {
  const isInteraction = Boolean(interaction);
  if (!prompt || !detectImageIntent(prompt)) return false;
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[auto-image] OPENAI_API_KEY missing - image generation skipped",
    );
    return false;
  }

  const size = process.env.AUTO_IMAGE_SIZE || "1024x1024";
  let finalPrompt = prompt;

  // Map the new rating system to prompt constraints
  if (rating === "rated" || rating === "pg13") {
    // Family-friendly content
    finalPrompt = `${prompt}\n\nContent guidelines: Keep imagery appropriate for ages 13+; avoid explicit content.`;
  } else if (rating === "unrated") {
    // Unrated: No artificial restrictions, full creative freedom
    // Let DALL-E use its native judgment without extra constraints
    finalPrompt = prompt;
  } else {
    // Default to safe
    finalPrompt = `${prompt}\n\nContent guidelines: Keep imagery appropriate for a general audience.`;
  }

  let buffer;
  try {
    console.log(
      `[auto-image] Generating image: "${prompt.substring(0, 50)}..." (rating: ${rating})`,
    );
    buffer = await generateImage({ prompt: finalPrompt, size });
    console.log("[auto-image] Image generated successfully");
  } catch (err) {
    console.error("[auto-image] Generation failed:", err.message);
    const msg = err?.message || "Image generation failed.";
    const suggestions = {
      unrated:
        "Colorful arcade-style frog hero racing atop a turbo snail, bold lighting, comic panel framing.",
      pg13: "Cheerful cartoon frog adventurer riding a giant snail under neon lights, playful indie-game vibe.",
      default:
        "Friendly frog explorer on a giant snail in a bright indie-game scene, whimsical and upbeat.",
    };
    const fallbackPrompt = suggestions[rating] || suggestions.default;
    const payload = {
      content: `⚠️ Unable to generate that image automatically (safety filter). Try a safer prompt such as:\n\`${fallbackPrompt}\`\n(${msg})`,
    };
    if (isInteraction) {
      if (interaction.deferred || interaction.replied)
        await interaction.editReply(payload);
      else await interaction.reply(payload);
    } else if (message) {
      await message.reply(payload).catch(() => {});
    }
    return true;
  }
  const file = new AttachmentBuilder(buffer, {
    name: `slimy-auto-image-${Date.now()}.png`,
  });

  const safePrompt =
    prompt.length > 1800 ? `${prompt.slice(0, 1797)}…` : prompt;
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
