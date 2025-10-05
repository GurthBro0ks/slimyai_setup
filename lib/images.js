const openai = require('./openai');

async function generateImage({ prompt, size = '1024x1024' }) {
  const result = await openai.images.generate({
    model: process.env.IMAGE_MODEL || 'dall-e-3',
    prompt,
    size,
    response_format: 'b64_json',
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no content');
  return Buffer.from(b64, 'base64');
}

module.exports = {
  generateImage,
};
