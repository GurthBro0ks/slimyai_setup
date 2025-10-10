// lib/openai.js
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.warn('[openai] Missing OPENAI_API_KEY — /chat and /dream will refuse.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
module.exports = client;
