// tests/test-helpers.js - Helper functions for Discord integration tests
const { Events } = require('discord.js');

/**
 * Send a message and wait for bot response
 * @param {TextChannel} channel - Discord channel
 * @param {string} content - Message content (can include @mention)
 * @param {string} botId - Bot user ID to wait for
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Message>} Bot's response message
 */
async function sendAndWaitForResponse(channel, content, botId, timeout = 15000) {
  const startTime = Date.now();

  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      collector.stop('timeout');
      reject(new Error(`Timeout waiting for response after ${timeout}ms`));
    }, timeout);

    // Create message collector
    const collector = channel.createMessageCollector({
      filter: m => m.author.id === botId && !m.author.bot === false,
      time: timeout,
      max: 1
    });

    collector.on('collect', message => {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      message.responseTime = responseTime; // Attach timing metadata
      resolve(message);
    });

    collector.on('end', (collected, reason) => {
      clearTimeout(timeoutId);
      if (reason === 'timeout' && collected.size === 0) {
        reject(new Error(`No response received within ${timeout}ms`));
      }
    });

    // Send the message
    try {
      await channel.send(content);
    } catch (err) {
      clearTimeout(timeoutId);
      collector.stop();
      reject(new Error(`Failed to send message: ${err.message}`));
    }
  });
}

/**
 * Execute a slash command (simulated via interaction)
 * Note: Slash commands can't be directly triggered by bots in testing
 * This is a placeholder - actual testing requires user interaction or Discord API
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 * @param {string} commandName - Command name
 * @param {Object} options - Command options
 */
async function executeSlashCommand(client, guildId, channelId, commandName, options = {}) {
  // This is a limitation: Bots cannot trigger slash commands programmatically
  // We'll use message-based testing with @mentions instead
  throw new Error('Slash commands cannot be programmatically triggered. Use @mention testing instead.');
}

/**
 * Wait for a specific amount of time
 * @param {number} ms - Milliseconds to wait
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify response contains expected patterns
 * @param {Message} response - Discord message object
 * @param {Object} expectations - Expected patterns
 * @param {string[]} expectations.includes - Strings that should be present
 * @param {string[]} expectations.excludes - Strings that should NOT be present
 * @param {RegExp[]} expectations.matches - Regex patterns that should match
 * @param {number} expectations.maxResponseTime - Maximum acceptable response time (ms)
 * @returns {Object} Verification result
 */
function verifyResponse(response, expectations = {}) {
  const result = {
    passed: true,
    failures: [],
    checks: []
  };

  const content = response.content || '';
  const embeds = response.embeds || [];
  const attachments = response.attachments || new Map();

  // Combine all text content
  const allText = [
    content,
    ...embeds.map(e => [e.title, e.description, ...e.fields.map(f => `${f.name} ${f.value}`)].join(' '))
  ].join(' ');

  // Check includes
  if (expectations.includes) {
    for (const pattern of expectations.includes) {
      const found = allText.toLowerCase().includes(pattern.toLowerCase());
      result.checks.push({ type: 'includes', pattern, passed: found });
      if (!found) {
        result.passed = false;
        result.failures.push(`Missing expected pattern: "${pattern}"`);
      }
    }
  }

  // Check excludes
  if (expectations.excludes) {
    for (const pattern of expectations.excludes) {
      const found = allText.toLowerCase().includes(pattern.toLowerCase());
      result.checks.push({ type: 'excludes', pattern, passed: !found });
      if (found) {
        result.passed = false;
        result.failures.push(`Found excluded pattern: "${pattern}"`);
      }
    }
  }

  // Check regex matches
  if (expectations.matches) {
    for (const regex of expectations.matches) {
      const found = regex.test(allText);
      result.checks.push({ type: 'matches', pattern: regex.toString(), passed: found });
      if (!found) {
        result.passed = false;
        result.failures.push(`No match for pattern: ${regex.toString()}`);
      }
    }
  }

  // Check response time
  if (expectations.maxResponseTime && response.responseTime) {
    const withinTime = response.responseTime <= expectations.maxResponseTime;
    result.checks.push({
      type: 'responseTime',
      expected: `<= ${expectations.maxResponseTime}ms`,
      actual: `${response.responseTime}ms`,
      passed: withinTime
    });
    if (!withinTime) {
      result.passed = false;
      result.failures.push(`Response too slow: ${response.responseTime}ms > ${expectations.maxResponseTime}ms`);
    }
  }

  // Check for attachments
  if (expectations.hasAttachment) {
    const hasAttachment = attachments.size > 0;
    result.checks.push({ type: 'hasAttachment', passed: hasAttachment });
    if (!hasAttachment) {
      result.passed = false;
      result.failures.push('Expected attachment but none found');
    }
  }

  // Check for embeds
  if (expectations.hasEmbed) {
    const hasEmbed = embeds.length > 0;
    result.checks.push({ type: 'hasEmbed', passed: hasEmbed });
    if (!hasEmbed) {
      result.passed = false;
      result.failures.push('Expected embed but none found');
    }
  }

  result.responseTime = response.responseTime;
  result.contentLength = content.length;

  return result;
}

/**
 * Analyze personality characteristics in a response
 * @param {string} content - Message content
 * @returns {Object} Personality analysis
 */
function analyzePersonality(content) {
  const analysis = {
    hasEmoji: /[\p{Emoji}]/u.test(content),
    hasCatchphrases: false,
    hasPlayfulTone: false,
    isConcise: content.length < 200,
    isNeutral: true,
    hasCreativeMetaphors: false,
    wordCount: content.split(/\s+/).length
  };

  // Check for slimy.ai catchphrases
  const catchphrases = [
    'exploit secured',
    'dopamine banked',
    'rivers branch',
    'flowing forward',
    'plates spinning',
    'none dropped'
  ];
  analysis.hasCatchphrases = catchphrases.some(phrase =>
    content.toLowerCase().includes(phrase)
  );

  // Check for playful tone indicators
  const playfulIndicators = [
    /(?:haha|hehe|lol)/i,
    /(?:!\?|!!)/,
    /(?:~|✨|🎉|🚀|💪|🔥)/,
    /(?:let's|let me|here's the deal|check this out)/i
  ];
  analysis.hasPlayfulTone = playfulIndicators.some(indicator =>
    indicator.test(content)
  );

  // Check for neutral/professional tone
  const neutralIndicators = [
    /^(?:here|this|the|to)/i,
    /\.\s+[A-Z]/,  // Multiple sentences with proper capitalization
    /(?:specifically|essentially|therefore|however)/i
  ];
  const professionalCount = neutralIndicators.filter(indicator =>
    indicator.test(content)
  ).length;
  analysis.isNeutral = professionalCount >= 2 && !analysis.hasPlayfulTone;

  // Check for creative metaphors
  const metaphorIndicators = [
    /like .+ but/i,
    /think of .+ as/i,
    /dream .+ as/i,
    /(?:flow|branch|river|stream|current)/i
  ];
  analysis.hasCreativeMetaphors = metaphorIndicators.some(indicator =>
    indicator.test(content)
  );

  // Overall personality score (0 = neutral, 10 = max personality)
  let score = 0;
  if (analysis.hasEmoji) score += 2;
  if (analysis.hasCatchphrases) score += 3;
  if (analysis.hasPlayfulTone) score += 2;
  if (analysis.hasCreativeMetaphors) score += 2;
  if (analysis.isNeutral) score -= 5;
  if (analysis.isConcise && !analysis.hasPlayfulTone) score -= 2;

  analysis.personalityScore = Math.max(0, Math.min(10, score));

  return analysis;
}

/**
 * Clean up test messages from a channel
 * @param {TextChannel} channel - Discord channel
 * @param {number} limit - Maximum messages to fetch
 */
async function cleanupTestMessages(channel, limit = 50) {
  try {
    const messages = await channel.messages.fetch({ limit });
    const testMessages = messages.filter(m =>
      m.content.includes('[TEST]') ||
      m.content.includes('Integration test')
    );

    if (testMessages.size > 0) {
      // Bulk delete if possible (messages < 14 days old)
      const deletable = testMessages.filter(m =>
        Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      if (deletable.size > 1) {
        await channel.bulkDelete(deletable);
        console.log(`Cleaned up ${deletable.size} test messages`);
      } else if (deletable.size === 1) {
        await deletable.first().delete();
        console.log('Cleaned up 1 test message');
      }
    }
  } catch (err) {
    console.warn('Cleanup failed:', err.message);
  }
}

/**
 * Format test result as readable string
 * @param {Object} testResult - Test result object
 * @returns {string} Formatted result
 */
function formatTestResult(testResult) {
  const { name, passed, duration, error, details } = testResult;
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const time = duration ? ` (${duration}ms)` : '';

  let output = `${status} ${name}${time}`;

  if (!passed && error) {
    output += `\n  Error: ${error}`;
  }

  if (details) {
    output += `\n  ${details}`;
  }

  return output;
}

/**
 * Calculate overall test score
 * @param {Array} testResults - Array of test result objects
 * @returns {Object} Score summary
 */
function calculateScore(testResults) {
  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = total - passed;
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    total,
    passed,
    failed,
    percentage,
    grade: percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'F'
  };
}

module.exports = {
  sendAndWaitForResponse,
  executeSlashCommand,
  delay,
  verifyResponse,
  analyzePersonality,
  cleanupTestMessages,
  formatTestResult,
  calculateScore
};
