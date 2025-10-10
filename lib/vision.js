// lib/vision.js
const openai = require('./openai');

/**
 * Analyze an image using GPT-4 Vision
 * @param {string} imageUrl - URL or base64 image
 * @param {string} prompt - What to ask about the image
 * @param {string} systemPrompt - System prompt (optional)
 * @returns {Promise<string>} - Analysis text
 */
async function analyzeImage({ imageUrl, prompt, systemPrompt = null }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const messages = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  messages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: prompt
      },
      {
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: 'high' // 'low', 'high', or 'auto'
        }
      }
    ]
  });

  const response = await openai.chat.completions.create({
    model: process.env.VISION_MODEL || 'gpt-4o',
    messages,
    max_tokens: 1000,
  });

  return response.choices[0].message.content;
}

/**
 * Convert Discord attachment to base64 data URL
 * @param {string} attachmentUrl - Discord CDN URL
 * @returns {Promise<string>} - base64 data URL
 */
async function urlToBase64(attachmentUrl) {
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(attachmentUrl);
  const buffer = await response.buffer();
  const base64 = buffer.toString('base64');

  // Detect mime type from URL
  let mimeType = 'image/png';
  if (attachmentUrl.includes('.jpg') || attachmentUrl.includes('.jpeg')) {
    mimeType = 'image/jpeg';
  } else if (attachmentUrl.includes('.webp')) {
    mimeType = 'image/webp';
  }

  return `data:${mimeType};base64,${base64}`;
}

module.exports = {
  analyzeImage,
  urlToBase64,
};
