// lib/llm-fallback.js
const logger = require('./logger');
const openaiClient = require('./openai');
const DEFAULT_COOLDOWN_MS = 30000;
const DEFAULT_TIMEOUT_MS = 45000;
const TRANSIENT_STATUS_CODES = new Set([
  408,
  409,
  425,
  429,
  500,
  502,
  503,
  504,
]);

let openaiSdkInstance = null;

const providerCooldowns = new Map();

function getFetch() {
  if (typeof global.fetch === 'function') return global.fetch;
  // Lazy-load to keep this module testable with global.fetch stubs
  return require('node-fetch');
}

function getOpenAISdk() {
  if (openaiSdkInstance) return openaiSdkInstance;
  try {
    // eslint-disable-next-line global-require
    const OpenAI = require('openai');
    openaiSdkInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiSdkInstance;
  } catch (err) {
    return null;
  }
}

function withTimeout(fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return Promise.resolve()
    .then(() => fn(controller.signal))
    .catch((err) => {
      if (controller.signal.aborted && err?.name !== 'AbortError') {
        const timeoutError = new Error('Request timed out');
        timeoutError.name = 'AbortError';
        throw timeoutError;
      }
      throw err;
    })
    .finally(() => clearTimeout(timeout));
}

function extractSystem(messages = []) {
  const systemParts = [];
  const rest = [];
  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string') systemParts.push(message.content);
    } else {
      rest.push(message);
    }
  }
  return {
    system: systemParts.join('\n').trim() || undefined,
    messages: rest,
  };
}

function getRetryAfterMs(headers) {
  if (!headers) return null;
  let raw;
  if (typeof headers.get === 'function') {
    raw = headers.get('retry-after');
  } else {
    raw = headers['retry-after'] || headers['Retry-After'];
  }
  if (!raw) return null;
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber)) {
    return Math.max(0, asNumber * 1000);
  }
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

function classifyError(err) {
  const status = err?.status || err?.response?.status;
  const type = err?.type || err?.error?.type || err?.response?.data?.error?.type;
  const message =
    err?.message || err?.response?.data?.error?.message || err?.error?.message || '';
  const lowerMessage = String(message).toLowerCase();

  const isRateLimit =
    status === 429 || type === 'rate_limit_error' || lowerMessage.includes('rate limit');
  const isTimeout =
    err?.name === 'AbortError' ||
    err?.code === 'ETIMEDOUT' ||
    lowerMessage.includes('timeout');
  const isTransientStatus =
    typeof status === 'number' && TRANSIENT_STATUS_CODES.has(status);
  const isTransient = isTransientStatus || isTimeout;

  return {
    status,
    type,
    message,
    isRateLimit,
    isTimeout,
    isTransient,
  };
}

function createHttpError(status, message, options = {}) {
  const err = new Error(message || `HTTP ${status}`);
  err.status = status;
  if (options.type) err.type = options.type;
  if (options.headers) err.headers = options.headers;
  if (options.data) err.data = options.data;
  return err;
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const fetch = getFetch();
  return withTimeout(async (signal) => {
    const response = await fetch(url, { ...options, signal });
    const text = await response.text();
    let data;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const message =
        data?.error?.message || data?.message || `HTTP ${response.status}`;
      throw createHttpError(response.status, message, {
        headers: response.headers,
        type: data?.error?.type || data?.type,
        data,
      });
    }

    return data;
  }, timeoutMs || DEFAULT_TIMEOUT_MS);
}

async function callAnthropic(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const { system, messages } = extractSystem(payload.messages);
  const model =
    payload.anthropicModel ||
    process.env.ANTHROPIC_MODEL ||
    'claude-sonnet-4-5';

  const body = {
    model,
    max_tokens: payload.max_tokens || 1000,
    temperature: payload.temperature ?? 0.8,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };

  if (system) body.system = system;

  const data = await fetchJson(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    payload.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  const content = data?.content || [];
  const textParts = content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean);
  return { text: textParts.join('\n') || 'No response.', model };
}

async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const model = payload.model || process.env.OPENAI_MODEL || 'gpt-5-chat-latest';
  const params = {
    model,
    messages: payload.messages,
    temperature: payload.temperature ?? 0.8,
    max_tokens: payload.max_tokens || 1000,
  };

  const sdk = getOpenAISdk();
  if (sdk) {
    try {
      const response = await withTimeout(
        (signal) => sdk.chat.completions.create(params, { signal }),
        payload.timeoutMs || DEFAULT_TIMEOUT_MS,
      );
      return {
        text: response.choices?.[0]?.message?.content || 'No response.',
        model,
      };
    } catch (err) {
      if (!err?.status && err?.response?.status) {
        err.status = err.response.status;
      }
      throw err;
    }
  }

  const data = await fetchJson(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(params),
    },
    payload.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  return { text: data?.choices?.[0]?.message?.content || 'No response.', model };
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const { system, messages } = extractSystem(payload.messages);
  const model =
    payload.geminiModel || process.env.GEMINI_MODEL || 'gemini-flash-latest';

  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : message.role,
    parts: [{ text: message.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      temperature: payload.temperature ?? 0.8,
      maxOutputTokens: payload.max_tokens || 1000,
    },
  };

  if (system) {
    body.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const data = await fetchJson(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
    payload.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const textParts = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean);
  return { text: textParts.join('\n') || 'No response.', model };
}

function getProviderCooldown(provider) {
  return providerCooldowns.get(provider) || 0;
}

function setProviderCooldown(provider, waitMs) {
  providerCooldowns.set(provider, Date.now() + waitMs);
}

function resetProviderCooldowns() {
  providerCooldowns.clear();
}

function redactMessage(message) {
  if (!message) return '';
  const raw = String(message);
  const redacted = raw
    .replace(/sk-[a-zA-Z0-9]{10,}/g, 'sk-REDACTED')
    .replace(/sk-ant-[a-zA-Z0-9]{10,}/g, 'sk-ant-REDACTED')
    .replace(/AIza[0-9A-Za-z\\-_]{10,}/g, 'AIzaREDACTED');
  return redacted.length > 300 ? `${redacted.slice(0, 300)}…` : redacted;
}

function extractErrorDetails(err, classification) {
  const errorType =
    classification.type || err?.code || err?.name || 'unknown_error';
  const message = redactMessage(classification.message || err?.message);
  return { errorType, message };
}

function getProviderModel(providerName, payload) {
  if (providerName === 'openai') {
    return payload.model || process.env.OPENAI_MODEL || 'gpt-5-chat-latest';
  }
  if (providerName === 'gemini') {
    return payload.geminiModel || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  }
  return (
    payload.anthropicModel || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
  );
}

function hasConfiguredProvider() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      openaiClient.isConfigured,
  );
}

async function callWithFallbackInternal(payload) {
  const providers = [
    {
      name: 'openai',
      isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
      call: callOpenAI,
    },
    {
      name: 'gemini',
      isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
      call: callGemini,
    },
    {
      name: 'anthropic',
      isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
      call: callAnthropic,
    },
  ];

  if (!providers.some((provider) => provider.isConfigured())) {
    const err = new Error('No LLM providers configured');
    err.code = 'no_providers_configured';
    throw err;
  }

  const attempts = [];
  let lastError;

  for (const provider of providers) {
    const model = getProviderModel(provider.name, payload);
    if (!provider.isConfigured()) {
      attempts.push({
        provider: provider.name,
        model,
        status: 'skipped_unconfigured',
        transient: false,
        cooldownApplied: false,
        errorType: 'missing_api_key',
        message: 'API key not configured',
      });
      continue;
    }

    const cooldownUntil = getProviderCooldown(provider.name);
    if (cooldownUntil > Date.now()) {
      attempts.push({
        provider: provider.name,
        model,
        status: 'skipped_cooldown',
        transient: true,
        cooldownApplied: true,
        errorType: 'cooldown_active',
        message: 'Provider cooldown active',
        cooldown_ms: cooldownUntil - Date.now(),
      });
      continue;
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const providerResult = await provider.call(payload);
        attempts.push({
          provider: provider.name,
          model: providerResult.model || model,
          status: 'success',
          transient: false,
          cooldownApplied: false,
          errorType: null,
          message: null,
          attempt,
        });
        const result = {
          response: providerResult.text,
          providerUsed: provider.name,
          attempts,
        };
        logger.debug('LLM provider selected', {
          provider_used: provider.name,
          attempts,
        });
        return result;
      } catch (err) {
        lastError = err;
        const classification = classifyError(err);
        const { errorType, message } = extractErrorDetails(err, classification);

        if (classification.isRateLimit) {
          const retryAfterMs =
            getRetryAfterMs(err?.headers) ||
            getRetryAfterMs(err?.response?.headers) ||
            DEFAULT_COOLDOWN_MS;
          setProviderCooldown(provider.name, retryAfterMs);
          attempts.push({
            provider: provider.name,
            model,
            status: classification.status ?? 429,
            outcome: 'rate_limited',
            transient: true,
            cooldownApplied: true,
            attempt,
            wait_ms: retryAfterMs,
            errorType,
            message,
          });
          break;
        }

        if (classification.isTransient && attempt === 1) {
          attempts.push({
            provider: provider.name,
            model,
            status: classification.status ?? (classification.isTimeout ? 'timeout' : 'transient'),
            outcome: classification.isTimeout ? 'timeout_retry' : 'transient_retry',
            transient: true,
            cooldownApplied: false,
            attempt,
            errorType,
            message,
          });
          continue;
        }

        attempts.push({
          provider: provider.name,
          model,
          status: classification.status ?? (classification.isTimeout ? 'timeout' : 'failed'),
          outcome: 'failed',
          transient: Boolean(classification.isTransient),
          cooldownApplied: false,
          attempt,
          errorType,
          message,
        });
        break;
      }
    }
  }

  logger.error('LLM fallback exhausted', { attempts });
  const error = lastError || new Error('All providers failed');
  error.attempts = attempts;
  throw error;
}

function callWithFallback(payload) {
  return callWithFallbackInternal(payload);
}

module.exports = {
  callWithFallback,
  hasConfiguredProvider,
  resetProviderCooldowns,
  _internal: {
    callWithFallbackInternal,
    classifyError,
    getProviderCooldown,
  },
};
