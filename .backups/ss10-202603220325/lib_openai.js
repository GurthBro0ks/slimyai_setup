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

// Create base client
const baseClient = isConfigured
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : {
      chat: { completions: { create: missingKey } },
      responses: { create: missingKey },
      images: { generate: missingKey },
    };

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
module.exports.executeWithBackoff = executeWithBackoff;
