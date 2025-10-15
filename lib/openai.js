// lib/openai.js
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.warn('[openai] Missing OPENAI_API_KEY — /chat and /dream will refuse.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Backward compatibility wrapper for test suite
async function chatCompletion(messages, options = {}) {
  return client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages,
    ...options
  });
}

module.exports = client;
module.exports.chatCompletion = chatCompletion;

