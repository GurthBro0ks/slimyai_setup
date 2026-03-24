// tests/llm-fallback.test.js
const assert = require('assert');

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

let results = { passed: 0, failed: 0 };
let openaiCreateImpl = null;

function makeResponse({ status = 200, body = {}, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || headers[name] || null;
      },
      ...headers,
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function loadModules() {
  delete require.cache[require.resolve('../lib/openai')];
  delete require.cache[require.resolve('../lib/llm-fallback')];
  const openai = require('../lib/openai');
  const fallback = require('../lib/llm-fallback');
  return { openai, fallback };
}

function installOpenAIStub() {
  const modulePath = require.resolve('openai');
  const OpenAI = function OpenAIStub() {
    return {
      chat: {
        completions: {
          create: (...args) => {
            if (!openaiCreateImpl) {
              throw new Error('OpenAI stub not configured');
            }
            return openaiCreateImpl(...args);
          },
        },
      },
    };
  };
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: OpenAI,
  };
}

function freezeTime(epochMs) {
  const originalNow = Date.now;
  let now = epochMs;
  Date.now = () => now;
  return {
    tick(ms) {
      now += ms;
    },
    restore() {
      Date.now = originalNow;
    },
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    results.passed += 1;
  } catch (err) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
    results.failed += 1;
  }
}

async function runTests() {
  console.log(`${BLUE}===========================================`);
  console.log(`LLM Fallback Test Suite`);
  console.log(`===========================================${RESET}\n`);

  const originalFetch = global.fetch;
  const originalEnv = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  process.env.OPENAI_API_KEY = 'test-openai';
  process.env.GEMINI_API_KEY = 'test-gemini';
  installOpenAIStub();

  await test('OpenAI 429 -> Gemini success (no error bubble)', async () => {
    const { openai, fallback } = loadModules();
    const { callWithFallback, resetProviderCooldowns } = fallback;

    resetProviderCooldowns();

    let geminiCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        geminiCalls += 1;
        return makeResponse({
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'gemini-ok' }],
                },
              },
            ],
          },
        });
      }
      if (String(url).includes('api.anthropic.com')) {
        return makeResponse({
          status: 500,
          body: { error: { message: 'Anthropic should not be called' } },
        });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    openaiCreateImpl = async () => {
      const err = new Error('Rate limit');
      err.status = 429;
      err.type = 'rate_limit_error';
      err.headers = { 'retry-after': '30' };
      throw err;
    };

    const result = await callWithFallback({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    assert.strictEqual(result.response, 'gemini-ok');
    assert.strictEqual(result.providerUsed, 'gemini');
    assert.strictEqual(geminiCalls, 1);
    const openaiAttempt = result.attempts.find(
      (attempt) => attempt.provider === 'openai',
    );
    assert.ok(openaiAttempt);
    assert.strictEqual(openaiAttempt.status, 429);
    assert.strictEqual(openaiAttempt.outcome, 'rate_limited');
    assert.strictEqual(openaiAttempt.cooldownApplied, true);
    assert.strictEqual(openaiAttempt.transient, true);
    assert.ok(openaiAttempt.model);
  });

  await test('OpenAI timeout -> retry once -> Gemini success', async () => {
    const { openai, fallback } = loadModules();
    const { callWithFallback, resetProviderCooldowns } = fallback;

    resetProviderCooldowns();

    let geminiCalls = 0;
    let openaiCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        geminiCalls += 1;
        return makeResponse({
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'gemini-ok' }],
                },
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    openaiCreateImpl = async () => {
      openaiCalls += 1;
      const err = new Error('Request timed out');
      err.name = 'AbortError';
      throw err;
    };

    const result = await callWithFallback({
      messages: [{ role: 'user', content: 'Timeout test' }],
    });

    assert.strictEqual(result.providerUsed, 'gemini');
    assert.strictEqual(openaiCalls, 2);
    assert.strictEqual(geminiCalls, 1);
  });

  await test('OpenAI 500 -> retry once -> Gemini success', async () => {
    const { fallback } = loadModules();
    const { callWithFallback, resetProviderCooldowns } = fallback;

    resetProviderCooldowns();

    let geminiCalls = 0;
    let openaiCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        geminiCalls += 1;
        return makeResponse({
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'gemini-ok' }],
                },
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    openaiCreateImpl = async () => {
      openaiCalls += 1;
      const err = new Error('Server error');
      err.status = 500;
      throw err;
    };

    const result = await callWithFallback({
      messages: [{ role: 'user', content: '500 test' }],
    });

    assert.strictEqual(result.providerUsed, 'gemini');
    assert.strictEqual(openaiCalls, 2);
    assert.strictEqual(geminiCalls, 1);
  });

  await test('OpenAI 429 sets cooldown then skips next call', async () => {
    const { fallback } = loadModules();
    const { callWithFallback, resetProviderCooldowns } = fallback;

    resetProviderCooldowns();
    const clock = freezeTime(1700000000000);

    let geminiCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        geminiCalls += 1;
        return makeResponse({
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'gemini-ok' }],
                },
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    openaiCreateImpl = async () => {
      const err = new Error('Rate limit');
      err.status = 429;
      err.type = 'rate_limit_error';
      err.headers = { 'retry-after': '30' };
      throw err;
    };

    await callWithFallback({
      messages: [{ role: 'user', content: 'Cooldown 1' }],
    });

    openaiCreateImpl = async () => {
      throw new Error('OpenAI should be on cooldown');
    };

    const result = await callWithFallback({
      messages: [{ role: 'user', content: 'Cooldown 2' }],
    });

    clock.restore();

    assert.strictEqual(result.providerUsed, 'gemini');
    assert.strictEqual(geminiCalls, 2);
    const cooldownAttempt = result.attempts.find(
      (attempt) =>
        attempt.provider === 'openai' &&
        attempt.status === 'skipped_cooldown',
    );
    assert.ok(cooldownAttempt);
    assert.strictEqual(cooldownAttempt.cooldownApplied, true);
  });

  await test('Gemini 429 -> Anthropic success', async () => {
    const { fallback } = loadModules();
    const { callWithFallback, resetProviderCooldowns } = fallback;

    resetProviderCooldowns();

    let geminiCalls = 0;
    let anthropicCalls = 0;
    global.fetch = async (url) => {
      const target = String(url);
      if (target.includes('generativelanguage.googleapis.com')) {
        geminiCalls += 1;
        return makeResponse({
          status: 429,
          body: { error: { message: 'Rate limit', type: 'rate_limit_error' } },
          headers: { 'retry-after': '30' },
        });
      }
      if (target.includes('api.anthropic.com')) {
        anthropicCalls += 1;
        return makeResponse({
          status: 200,
          body: { content: [{ text: 'anthropic-ok' }] },
        });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    openaiCreateImpl = async () => {
      const err = new Error('OpenAI failed');
      err.status = 500;
      throw err;
    };

    const result = await callWithFallback({
      messages: [{ role: 'user', content: 'Gemini 429' }],
    });

    assert.strictEqual(result.providerUsed, 'anthropic');
    assert.strictEqual(geminiCalls, 1);
    assert.strictEqual(anthropicCalls, 1);
  });

  await test('All providers fail -> throws with attempts', async () => {
    const { fallback } = loadModules();
    const { callWithFallback, resetProviderCooldowns } = fallback;

    resetProviderCooldowns();

    global.fetch = async (url) => {
      const target = String(url);
      if (target.includes('generativelanguage.googleapis.com')) {
        return makeResponse({
          status: 500,
          body: { error: { message: 'Gemini failed' } },
        });
      }
      if (target.includes('api.anthropic.com')) {
        return makeResponse({
          status: 500,
          body: { error: { message: 'Anthropic failed' } },
        });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    openaiCreateImpl = async () => {
      const err = new Error('OpenAI failed');
      err.status = 500;
      throw err;
    };

    let thrown;
    try {
      await callWithFallback({
        messages: [{ role: 'user', content: 'All fail' }],
      });
    } catch (err) {
      thrown = err;
    }

    assert.ok(thrown);
    assert.ok(Array.isArray(thrown.attempts));
    assert.ok(thrown.attempts.length >= 3);
    const providers = thrown.attempts.map((attempt) => attempt.provider);
    assert.ok(providers.includes('openai'));
    assert.ok(providers.includes('gemini'));
    assert.ok(providers.includes('anthropic'));
  });

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }

  process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;

  console.log();
  console.log(
    `${BLUE}Tests complete:${RESET} ${GREEN}${results.passed} passed${RESET}, ${RED}${results.failed} failed${RESET}`,
  );
  if (results.failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(`${RED}Test suite failed:${RESET}`, err);
  process.exit(1);
});
