// lib/openai.js — AI Client (supports OpenAI, Z.AI GLM, Ollama)
//
// Provider selection via env vars:
//   AI_BASE_URL  — API base URL (default: Z.AI)
//   AI_API_KEY   — API key (falls back to OPENAI_API_KEY)
//
// To switch providers, just change .env:
//   Z.AI:    AI_BASE_URL=https://api.z.ai/api/paas/v4  AI_API_KEY=your-zai-key
//   OpenAI:  AI_BASE_URL=https://api.openai.com/v1      AI_API_KEY=sk-...
//   Ollama:  AI_BASE_URL=http://localhost:11434/v1       AI_API_KEY=ollama

const OpenAI = require("openai");

const baseURL = process.env.AI_BASE_URL || "https://api.z.ai/api/paas/v4";
const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

const isConfigured = Boolean(apiKey);
if (!isConfigured) {
  console.warn(
    "[openai] Missing AI_API_KEY / OPENAI_API_KEY — /chat and /image will refuse.",
  );
}

function missingKey() {
  throw new Error("AI_API_KEY is not configured");
}

// TPM (tokens per minute) budget tracking
const TPM_BUDGET = Number(process.env.OPENAI_TPM_BUDGET || 2000000);
const TPM_WINDOW_MS = 60 * 1000; // 1 minute
let tokenUsage = [];
let lastThrottleWarning = 0;
const THROTTLE_WARNING_INTERVAL_MS = 60 * 1000; // Log warning max once per minute

/**
 * Track token usage for TPM budget
 */
function trackTokens(tokens) {
  const now = Date.now();
  tokenUsage.push({ tokens, timestamp: now });

  // Remove old entries outside the window
  tokenUsage = tokenUsage.filter((entry) => now - entry.timestamp < TPM_WINDOW_MS);

  const totalTokens = tokenUsage.reduce((sum, entry) => sum + entry.tokens, 0);
  return totalTokens;
}

/**
 * Check if we're within TPM budget
 */
function checkTPMBudget() {
  const now = Date.now();
  tokenUsage = tokenUsage.filter((entry) => now - entry.timestamp < TPM_WINDOW_MS);
  const totalTokens = tokenUsage.reduce((sum, entry) => sum + entry.tokens, 0);
  return totalTokens < TPM_BUDGET;
}

/**
 * Execute OpenAI request with 429 backoff and retry logic
 */
async function executeWithBackoff(fn, context = {}) {
  let attempt = 0;
  const maxAttempts = 5;
  let lastError;

  while (attempt < maxAttempts) {
    attempt++;

    // Check TPM budget before making request
    if (!checkTPMBudget()) {
      const now = Date.now();
      if (now - lastThrottleWarning > THROTTLE_WARNING_INTERVAL_MS) {
        console.warn(
          `[openai] TPM budget (${TPM_BUDGET}) exceeded, throttling requests`,
        );
        lastThrottleWarning = now;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    try {
      const response = await fn();

      // Track token usage
      if (response?.usage?.total_tokens) {
        trackTokens(response.usage.total_tokens);
      }

      return response;
    } catch (err) {
      lastError = err;

      // Check if it's a 429 rate limit error
      const is429 =
        err.status === 429 ||
        err.code === "rate_limit_exceeded" ||
        (err.message && err.message.toLowerCase().includes("rate limit"));

      if (!is429 || attempt >= maxAttempts) {
        throw err;
      }

      // Extract Retry-After header if available
      let waitMs = 1000 * Math.pow(1.5, attempt - 1); // Exponential backoff (1.5x)

      if (err.headers && err.headers["retry-after"]) {
        const retryAfter = Number(err.headers["retry-after"]);
        if (!isNaN(retryAfter)) {
          waitMs = retryAfter * 1000; // Convert seconds to ms
        }
      }

      // Cap at 60 seconds
      waitMs = Math.min(waitMs, 60000);

      const now = Date.now();
      if (now - lastThrottleWarning > THROTTLE_WARNING_INTERVAL_MS) {
        console.warn(
          `[openai] 429 rate limit hit, retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${maxAttempts})`,
        );
        lastThrottleWarning = now;
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError || new Error("OpenAI request failed after retries");
}

// Create base client with configurable baseURL
const baseClient = isConfigured
  ? new OpenAI({ apiKey: apiKey, baseURL: baseURL })
  : {
      chat: { completions: { create: missingKey } },
      responses: { create: missingKey },
      images: { generate: missingKey },
    };

// Log which provider we're using (once at startup)
const provider = baseURL.includes("z.ai") ? "Z.AI GLM"
  : baseURL.includes("openai.com") ? "OpenAI"
  : baseURL.includes("localhost") ? "Ollama (local)"
  : baseURL;
console.log(`[openai] Provider: ${provider} (${baseURL})`);

// Wrap client methods with backoff
const client = isConfigured
  ? {
      chat: {
        completions: {
          create: (params) =>
            executeWithBackoff(() => baseClient.chat.completions.create(params)),
        },
      },
      images: {
        generate: (params) =>
          executeWithBackoff(() => baseClient.images.generate(params)),
      },
      // Preserve other methods
      ...baseClient,
    }
  : baseClient;

// Backward compatibility wrapper for test suite
async function chatCompletion(messages, options = {}) {
  if (!isConfigured) missingKey();
  return client.chat.completions.create({
    model: process.env.CHAT_MODEL || process.env.OPENAI_MODEL || "glm-4.7-flash",
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
module.exports.executeWithBackoff = executeWithBackoff;
