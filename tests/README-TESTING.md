# Testing Guide for slimy.ai Discord Bot

**Version:** 1.0.0
**Last Updated:** 2025-10-06

---

## Table of Contents

1. [Overview](#overview)
2. [Test Types](#test-types)
3. [Setup Instructions](#setup-instructions)
4. [Running Tests](#running-tests)
5. [Understanding Results](#understanding-results)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This directory contains comprehensive testing infrastructure for the slimy.ai Discord bot, including:

- **Automated Integration Tests** - Live Discord tests via bot/user account
- **Manual Validation Checklist** - Human verification of features
- **Test Helpers** - Utility functions for testing
- **Production Readiness Reports** - Automated assessment generation

---

## Test Types

### 1. Automated Integration Tests

**File:** `discord-integration-test.js`

Tests that can be automated by sending messages to Discord and verifying bot responses:
- Chat & mention handling
- Memory system (via @mention since slash commands can't be triggered)
- Performance metrics
- Edge case handling

**Limitations:**
- Cannot trigger slash commands programmatically (Discord API restriction)
- Mode personality differences require human judgment
- Visual elements (images, embeds) require human verification

### 2. Manual Validation Tests

**File:** `manual-validation-checklist.md`

Human-performed tests for features requiring judgment:
- All 8 mode profile personality verification
- Rating system appropriateness checks
- Mode persistence across restarts
- Slash command functionality
- Visual quality assessment

### 3. Unit Tests

**File:** `memory-simple.test.js`

Isolated tests for individual components:
- Memory system (CRUD operations)
- File locking
- UUID generation
- Error handling

---

## Setup Instructions

### Step 1: Get Discord IDs

You need to collect several Discord IDs for testing:

#### A. Create a Test Bot or Use User Account

**Option 1: Test Bot (Recommended)**

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it "slimy-test-bot"
4. Go to "Bot" tab
5. Click "Add Bot"
6. Under "Privileged Gateway Intents", enable:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
7. Click "Reset Token" and copy the token
8. Save as `TEST_DISCORD_TOKEN` in `.env`

**Option 2: User Account (Advanced)**

⚠️ **Warning:** Using user tokens violates Discord ToS. Only use for private testing.

1. Open Discord in browser
2. Press F12 (Developer Tools)
3. Go to "Network" tab
4. Send a message in Discord
5. Find request to discord.com/api
6. Look for "authorization" header
7. Copy the token value

#### B. Get Guild ID (Server ID)

1. Enable Developer Mode:
   - User Settings → Advanced → Developer Mode: ON
2. Right-click your test server
3. Click "Copy ID"
4. Save as `TEST_GUILD_ID` in `.env`

#### C. Get Channel ID

1. Right-click the test channel in your server
2. Click "Copy ID"
3. Save as `TEST_CHANNEL_ID` in `.env`

#### D. Get slimy.ai Bot ID

1. Right-click the slimy.ai bot in your server
2. Click "Copy ID"
3. Save as `SLIMY_BOT_ID` in `.env`

### Step 2: Configure Environment

Copy `.env.example` to `.env` (if not already done):

```bash
cp .env.example .env
```

Add your test configuration to `.env`:

```bash
# Testing Configuration
TEST_DISCORD_TOKEN=your_test_bot_token_here
TEST_GUILD_ID=1234567890123456789
TEST_CHANNEL_ID=9876543210987654321
SLIMY_BOT_ID=1111222233334444555
TEST_DELAY=2000
TEST_CLEANUP=false
```

### Step 3: Install Dependencies

Ensure all dependencies are installed:

```bash
npm install
```

### Step 4: Set Up Test Channel

1. Create a dedicated test channel (recommended: #bot-testing)
2. Give the test bot permissions:
   - ✅ View Channel
   - ✅ Send Messages
   - ✅ Read Message History
3. Ensure slimy.ai bot is also in the channel

### Step 5: Verify Setup

Test your configuration:

```bash
node tests/discord-integration-test.js
```

If configured correctly, you should see:
```
🔧 Initializing test client...
✅ Test client logged in as YourTestBot#1234
📍 Test Guild: Your Server Name
📍 Test Channel: #bot-testing
🤖 Target Bot: slimy.ai#0630
```

---

## Running Tests

### Automated Integration Tests

#### Run All Tests (with confirmation)

```bash
npm run test:integration
```

This will:
1. Connect to Discord
2. Send test messages
3. Verify bot responses
4. Generate reports
5. Display summary

#### Run with Force (skip confirmation)

```bash
npm run test:integration:force
```

#### Run with Verbose Output

```bash
npm run test:integration:verbose
```

#### Run with Cleanup (delete test messages after)

```bash
TEST_CLEANUP=true npm run test:integration:force
```

### Manual Validation Tests

1. Open `tests/manual-validation-checklist.md`
2. Follow each test step
3. Record results in the checklist
4. Calculate overall pass/fail rate

### Memory Unit Tests

```bash
npm run test:memory
```

---

## Understanding Results

### Test Output

After running tests, you'll see:

```
═══════════════════════════════════════════════════════════════
📊 TEST SUMMARY
═══════════════════════════════════════════════════════════════

Total Tests:    12
✅ Passed:      10
❌ Failed:      2
⏭️  Skipped:     0
📊 Success Rate: 83%
⏱️  Duration:    45230ms
🎯 Grade:       B

🎉 OVERALL: PASS - Production Ready (with manual validation)
```

### Generated Reports

Three files are generated after tests:

#### 1. `integration-test-results-[timestamp].json`

Raw test data in JSON format:

```json
{
  "timestamp": "2025-10-06T12:34:56.789Z",
  "totalTests": 12,
  "passed": 10,
  "failed": 2,
  "tests": [
    {
      "name": "Chat & Mention Handler",
      "passed": true,
      "duration": 3456,
      "details": "..."
    }
  ]
}
```

#### 2. `PRODUCTION-READY-REPORT.md`

Production readiness assessment with GO/NO-GO recommendation.

#### 3. Test console output

Real-time progress shown in terminal.

### Success Criteria

| Success Rate | Grade | Recommendation |
|--------------|-------|----------------|
| 90-100% | A | ✅ GO - Ready for production |
| 80-89% | B | ✅ GO - Minor issues acceptable |
| 70-79% | C | ⚠️ CONDITIONAL - Review failures |
| 60-69% | D | ❌ NO-GO - Significant issues |
| 0-59% | F | ❌ NO-GO - Major problems |

---

## Troubleshooting

### "TEST_DISCORD_TOKEN not set"

**Solution:** Add your test bot token to `.env`:
```bash
TEST_DISCORD_TOKEN=your_token_here
```

### "Timeout connecting to Discord"

**Possible Causes:**
- Invalid token
- Network issues
- Discord API outage

**Solution:**
1. Verify token is correct
2. Check internet connection
3. Try again in a few minutes

### "Cannot find module 'discord.js'"

**Solution:** Install dependencies:
```bash
npm install
```

### "Target bot not found in guild"

**Possible Causes:**
- Wrong SLIMY_BOT_ID
- Bot not in the test server
- Bot was kicked

**Solution:**
1. Verify SLIMY_BOT_ID is correct
2. Ensure bot is in the server
3. Re-invite bot if needed

### "Permission denied" errors

**Solution:** Ensure test bot has these permissions:
- View Channel
- Send Messages
- Read Message History

### Tests hang or timeout

**Possible Causes:**
- Bot is offline
- Bot is rate-limited
- Channel permissions incorrect

**Solution:**
1. Check bot is online: `pm2 status slimy-bot`
2. Restart bot: `pm2 restart slimy-bot`
3. Verify channel permissions
4. Increase timeout in test configuration

### "Cannot trigger slash commands"

This is expected. Discord API does not allow bots to trigger slash commands programmatically.

**Solution:** Use manual validation checklist for slash command testing.

---

## Advanced Testing

### Custom Test Scenarios

Create your own test file:

```javascript
const { sendAndWaitForResponse, verifyResponse } = require('./test-helpers');

async function myCustomTest(channel, botId) {
  const response = await sendAndWaitForResponse(
    channel,
    `@${botId} your test prompt`,
    botId,
    10000
  );

  const verification = verifyResponse(response, {
    includes: ['expected text'],
    maxResponseTime: 5000
  });

  if (!verification.passed) {
    throw new Error(verification.failures.join(', '));
  }

  return 'Test passed!';
}
```

### Continuous Integration

Run tests automatically on deployment:

```bash
#!/bin/bash
# deploy-with-tests.sh

echo "Running tests before deployment..."
npm run test:integration:force

if [ $? -eq 0 ]; then
  echo "✅ Tests passed. Deploying..."
  git pull
  npm install
  pm2 restart slimy-bot
else
  echo "❌ Tests failed. Aborting deployment."
  exit 1
fi
```

### Performance Profiling

Track response times over multiple runs:

```bash
for i in {1..10}; do
  echo "Run $i"
  npm run test:integration:force | grep "Avg mention response"
  sleep 30
done
```

---

## Best Practices

### 1. Use Dedicated Test Channel

Don't test in production channels. Create #bot-testing.

### 2. Run Tests During Off-Peak Hours

Avoid disrupting active users.

### 3. Clean Up Test Data

Enable `TEST_CLEANUP=true` or manually delete test memos:

```
/forget id:[test-memo-id]
```

### 4. Document Test Results

Save reports in version control:

```bash
git add tests/PRODUCTION-READY-REPORT.md
git commit -m "Test results: 95% pass rate"
```

### 5. Validate Before Major Changes

Always run full test suite before:
- Production deployments
- Major feature updates
- Persona/mode changes

---

## Test Coverage

### Covered by Automated Tests ✅
- Chat message handling
- Mention detection and response
- Basic memory operations (via mention)
- Performance metrics
- Edge case handling
- Error recovery

### Requires Manual Testing ⚠️
- All slash commands
- Mode profile personality differences
- Visual elements (images, embeds)
- Google Sheets integration
- Mode persistence across restarts

### Not Currently Tested ❌
- Voice channel features
- DM (Direct Message) functionality
- Multi-guild scenarios
- Concurrent user load testing
- Database backup/recovery

---

## Getting Help

### Issues with Tests

1. Check this README first
2. Review error messages carefully
3. Verify `.env` configuration
4. Check bot logs: `pm2 logs slimy-bot`

### Discord API Issues

- Rate Limiting: Wait and retry
- Gateway timeout: Check Discord status
- Permission errors: Review bot permissions

### Contact

For support with testing:
- Check existing documentation
- Review error logs
- Test in isolation (one feature at a time)

---

## Changelog

### Version 1.0.0 (2025-10-06)
- Initial release
- Automated integration tests
- Manual validation checklist
- Production readiness reports
- Comprehensive documentation

---

**End of Testing Guide**
