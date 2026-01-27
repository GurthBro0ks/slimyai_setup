// tests/llm-handler.integration.test.js
const assert = require('assert');

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

let results = { passed: 0, failed: 0 };

function stubModule(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function resetModule(modulePath) {
  delete require.cache[modulePath];
}

function makeQueueStub() {
  return {
    enqueue(fn) {
      return Promise.resolve().then(fn);
    },
  };
}

function makeCallWithFallbackStub() {
  let impl = null;
  const fn = async (...args) => {
    if (!impl) throw new Error('callWithFallback stub not configured');
    return impl(...args);
  };
  fn.setImpl = (next) => {
    impl = next;
  };
  return fn;
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
  console.log(`LLM Handler Integration Test Suite`);
  console.log(`===========================================${RESET}\n`);

  process.env.TEST_MODE = '1';
  process.env.OPENAI_API_KEY = 'test-openai';
  process.env.GEMINI_API_KEY = 'test-gemini';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';

  const llmFallbackPath = require.resolve('../lib/llm-fallback');
  const messageQueuePath = require.resolve('../lib/message-queue');
  const autoImagePath = require.resolve('../lib/auto-image');
  const imageIntentPath = require.resolve('../lib/image-intent');

  const callWithFallback = makeCallWithFallbackStub();

  stubModule(llmFallbackPath, {
    callWithFallback,
    hasConfiguredProvider: () => true,
    resetProviderCooldowns: () => {},
  });
  stubModule(messageQueuePath, makeQueueStub());
  stubModule(autoImagePath, { maybeReplyWithImage: async () => false });
  stubModule(imageIntentPath, { detectImageIntent: () => false });

  await test('mention handler hides provider error when fallback succeeds', async () => {
    callWithFallback.setImpl(async () => ({
      response: 'assistant from gemini',
      providerUsed: 'gemini',
      attempts: [
        { provider: 'openai', status: 429, outcome: 'rate_limited' },
        { provider: 'gemini', status: 'success' },
      ],
    }));

    resetModule(require.resolve('../commands/chat'));
    resetModule(require.resolve('../handlers/mention'));
    const chat = require('../commands/chat');
    if (!chat.getEffectiveModesForChannel) {
      chat.getEffectiveModesForChannel = () => ({
        rating_unrated: false,
        rating_pg13: false,
        personality: false,
        no_personality: false,
      });
    }
    const { attachMentionHandler } = require('../handlers/mention');

    const replies = [];
    const client = {
      user: { id: 'bot-123' },
      isReady: () => true,
      once: () => {},
      on(event, handler) {
        this._handler = handler;
      },
      listenerCount: () => 1,
    };

    attachMentionHandler(client);

    const message = {
      author: { id: 'user-1', tag: 'User#1', bot: false },
      content: '<@bot-123> hello there',
      mentions: { users: { has: () => true } },
      channelId: 'channel-1',
      guildId: 'guild-1',
      guild: { id: 'guild-1' },
      channel: { id: 'channel-1', parentId: null, parent: null },
      reply: async ({ content }) => {
        replies.push(content);
        return { content };
      },
    };

    await client._handler(message);

    assert.strictEqual(replies.length, 1);
    const content = replies[0];
    assert.ok(content.includes('assistant from gemini'));
    assert.ok(!content.includes('HTTP 429'));
    assert.ok(!content.includes('rate_limit_error'));
  });

  await test('chat command hides provider error when fallback succeeds', async () => {
    callWithFallback.setImpl(async () => ({
      response: 'assistant reply',
      providerUsed: 'gemini',
      attempts: [
        { provider: 'openai', status: 429, outcome: 'rate_limited' },
        { provider: 'gemini', status: 'success' },
      ],
    }));

    resetModule(require.resolve('../commands/chat'));
    const chat = require('../commands/chat');

    const replies = [];
    const interaction = {
      user: { id: 'user-1', username: 'User1' },
      member: { displayName: 'User1' },
      channelId: 'channel-1',
      guildId: 'guild-1',
      channel: { id: 'channel-1', parentId: null, parent: null },
      guild: { id: 'guild-1' },
      options: {
        getString: () => 'Hello!',
        getBoolean: () => false,
      },
      reply: async ({ content }) => {
        replies.push(content);
      },
      deferReply: async () => {},
      editReply: async ({ content }) => {
        replies.push(content);
      },
    };

    await chat.execute(interaction);

    const content = replies.join('\n');
    assert.ok(content.includes('assistant reply'));
    assert.ok(!content.includes('HTTP 429'));
    assert.ok(!content.includes('rate_limit_error'));
  });

  await test('handlers surface clean error when all providers fail', async () => {
    callWithFallback.setImpl(async () => {
      const err = new Error('LLM temporarily unavailable');
      err.status = 503;
      throw err;
    });

    resetModule(require.resolve('../commands/chat'));
    resetModule(require.resolve('../handlers/mention'));
    const chat = require('../commands/chat');
    if (!chat.getEffectiveModesForChannel) {
      chat.getEffectiveModesForChannel = () => ({
        rating_unrated: false,
        rating_pg13: false,
        personality: false,
        no_personality: false,
      });
    }
    const { attachMentionHandler } = require('../handlers/mention');

    const mentionReplies = [];
    const client = {
      user: { id: 'bot-123' },
      isReady: () => true,
      once: () => {},
      on(_event, handler) {
        this._handler = handler;
      },
      listenerCount: () => 1,
    };

    attachMentionHandler(client);

    const message = {
      author: { id: 'user-1', tag: 'User#1', bot: false },
      content: '<@bot-123> hello there',
      mentions: { users: { has: () => true } },
      channelId: 'channel-1',
      guildId: 'guild-1',
      guild: { id: 'guild-1' },
      channel: { id: 'channel-1', parentId: null, parent: null },
      reply: async ({ content }) => {
        mentionReplies.push(content);
        return { content };
      },
    };

    await client._handler(message);

    assert.strictEqual(mentionReplies.length, 1);
    assert.ok(mentionReplies[0].includes('LLM error'));
    assert.ok(mentionReplies[0].includes('LLM temporarily unavailable'));

    const chatReplies = [];
    const interaction = {
      user: { id: 'user-1', username: 'User1' },
      member: { displayName: 'User1' },
      channelId: 'channel-1',
      guildId: 'guild-1',
      channel: { id: 'channel-1', parentId: null, parent: null },
      guild: { id: 'guild-1' },
      options: {
        getString: () => 'Hello!',
        getBoolean: () => false,
      },
      reply: async ({ content }) => {
        chatReplies.push(content);
      },
      deferReply: async () => {},
      editReply: async ({ content }) => {
        chatReplies.push(content);
      },
    };

    await chat.execute(interaction);

    const content = chatReplies.join('\n');
    assert.ok(content.includes('LLM error'));
    assert.ok(content.includes('LLM temporarily unavailable'));
  });

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
