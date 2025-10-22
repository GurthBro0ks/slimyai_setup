// lib/openai.js
const OpenAI = require("openai");

const isConfigured = Boolean(process.env.OPENAI_API_KEY);
if (!isConfigured) {
  console.warn(
    "[openai] Missing OPENAI_API_KEY — /chat and /image will refuse.",
  );
}

function missingKey() {
  throw new Error("OPENAI_API_KEY is not configured");
}

const client = isConfigured
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : {
      chat: { completions: { create: missingKey } },
      responses: { create: missingKey },
      images: { generate: missingKey },
    };

// Backward compatibility wrapper for test suite
async function chatCompletion(messages, options = {}) {
  if (!isConfigured) missingKey();
  return client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages,
    ...options,
  });
}

module.exports = client;
module.exports.chatCompletion = chatCompletion;
module.exports.isConfigured = isConfigured;
module.exports.ensureConfigured = () => {
  if (!isConfigured) missingKey();
};
