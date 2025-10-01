// lib/openai.js
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.warn('[openai] Missing OPENAI_API_KEY — /chat and /image will refuse.');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-will-fail-at-runtime'
});
module.exports = client;

