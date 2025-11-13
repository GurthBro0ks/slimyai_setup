#!/usr/bin/env node
/**
 * Security Fixes Test Suite
 *
 * Tests all security hardening changes:
 * 1. Environment variable validation
 * 2. CSRF token validation on state-changing routes
 * 3. Memory leak fix (conversation history cleanup)
 * 4. CORS configuration
 *
 * Usage:
 *   node tests/security-fixes-test-suite.js [test-name]
 *
 * Examples:
 *   node tests/security-fixes-test-suite.js              # Run all tests
 *   node tests/security-fixes-test-suite.js env          # Test env validation only
 *   node tests/security-fixes-test-suite.js csrf         # Test CSRF protection only
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const ADMIN_API_PORT = process.env.ADMIN_API_PORT || 3080;
const ADMIN_API_URL = process.env.ADMIN_API_URL || `http://localhost:${ADMIN_API_PORT}`;
const TEST_TIMEOUT = 30000; // 30 seconds

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testHeader(name) {
  log('\n' + '='.repeat(70), 'cyan');
  log(`  TEST: ${name}`, 'bright');
  log('='.repeat(70), 'cyan');
}

function testPass(message) {
  log(`✓ PASS: ${message}`, 'green');
  results.passed++;
  results.tests.push({ name: message, status: 'PASS' });
}

function testFail(message, error) {
  log(`✗ FAIL: ${message}`, 'red');
  if (error) {
    log(`  Error: ${error}`, 'red');
  }
  results.failed++;
  results.tests.push({ name: message, status: 'FAIL', error: error?.toString() });
}

function testSkip(message) {
  log(`○ SKIP: ${message}`, 'yellow');
  results.skipped++;
  results.tests.push({ name: message, status: 'SKIP' });
}

/**
 * Test 1: Environment Variable Validation
 * Verify server fails fast with missing required environment variables
 */
async function testEnvironmentValidation() {
  testHeader('Environment Variable Validation');

  const requiredVars = [
    'CORS_ORIGIN',
    'COOKIE_DOMAIN',
    'DISCORD_REDIRECT_URI',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
  ];

  for (const varName of requiredVars) {
    await testMissingEnvVar(varName);
  }
}

async function testMissingEnvVar(varName) {
  return new Promise((resolve) => {
    log(`\nTesting missing ${varName}...`, 'blue');

    // Create temp env file without the variable
    const originalEnv = process.env[varName];
    const envCopy = { ...process.env };
    delete envCopy[varName];

    // Try to start admin-api
    const proc = spawn('node', ['admin-api/server.js'], {
      env: envCopy,
      stdio: 'pipe',
    });

    let stderr = '';
    let timeout;

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0 && stderr.includes(varName)) {
        testPass(`Server exits with error for missing ${varName}`);
      } else if (code === 0) {
        testFail(`Server started without ${varName} (should fail)`, 'Server did not exit');
        proc.kill();
      } else {
        testFail(`Server exited but error message unclear for ${varName}`, stderr);
      }

      resolve();
    });

    // Kill after 5 seconds if still running
    timeout = setTimeout(() => {
      testFail(`Server did not exit quickly for missing ${varName}`, 'Timeout after 5s');
      proc.kill();
      resolve();
    }, 5000);
  });
}

/**
 * Test 2: CSRF Token Validation
 * Verify all state-changing routes require valid CSRF tokens
 */
async function testCsrfProtection() {
  testHeader('CSRF Token Validation');

  log('\nNOTE: This test requires admin-api to be running with valid config', 'yellow');
  log('Start admin-api first: npm run start --prefix admin-api', 'yellow');

  // Check if server is running
  const serverRunning = await checkServerHealth();
  if (!serverRunning) {
    testSkip('CSRF tests - admin-api not running');
    return;
  }

  log('\nNOTE: You need to manually test CSRF protection', 'yellow');
  log('1. Login to admin UI to get auth cookie', 'yellow');
  log('2. Extract CSRF token from JWT payload', 'yellow');
  log('3. Run: node tests/csrf-manual-test.js', 'yellow');

  testSkip('CSRF protection tests - requires manual execution');
}

async function checkServerHealth() {
  try {
    const response = await fetch(`${ADMIN_API_URL}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Test 3: Memory Leak Fix
 * Verify conversation histories are cleaned up after TTL
 */
async function testMemoryLeakFix() {
  testHeader('Memory Leak Fix - Conversation History Cleanup');

  const chatModule = path.join(__dirname, '../commands/chat.js');

  if (!fs.existsSync(chatModule)) {
    testFail('chat.js not found', `Path: ${chatModule}`);
    return;
  }

  // Read chat.js and verify cleanup code exists
  const chatCode = fs.readFileSync(chatModule, 'utf8');

  const checks = [
    {
      pattern: /HISTORY_TTL_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/,
      name: 'HISTORY_TTL_MS constant defined (1 hour)',
    },
    {
      pattern: /CLEANUP_INTERVAL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/,
      name: 'CLEANUP_INTERVAL_MS constant defined (10 minutes)',
    },
    {
      pattern: /function\s+cleanupOldHistories/,
      name: 'cleanupOldHistories() function exists',
    },
    {
      pattern: /setInterval\s*\(\s*cleanupOldHistories/,
      name: 'Periodic cleanup interval registered',
    },
    {
      pattern: /lastAccess/,
      name: 'lastAccess timestamp tracking',
    },
    {
      pattern: /histories\.delete\(/,
      name: 'History deletion logic',
    },
  ];

  checks.forEach(({ pattern, name }) => {
    if (pattern.test(chatCode)) {
      testPass(name);
    } else {
      testFail(name, 'Pattern not found in code');
    }
  });

  log('\nNOTE: Functional testing requires running bot', 'yellow');
  log('To test cleanup:', 'yellow');
  log('1. Start bot: npm start', 'yellow');
  log('2. Use /chat command multiple times', 'yellow');
  log('3. Wait 1 hour + 10 minutes', 'yellow');
  log('4. Check logs for: "[chat] Cleaned up X expired conversation histories"', 'yellow');
}

/**
 * Test 4: CORS Configuration
 * Verify CORS is properly configured
 */
async function testCorsConfiguration() {
  testHeader('CORS Configuration');

  const appModule = path.join(__dirname, '../admin-api/src/app.js');

  if (!fs.existsSync(appModule)) {
    testFail('app.js not found', `Path: ${appModule}`);
    return;
  }

  const appCode = fs.readFileSync(appModule, 'utf8');

  const checks = [
    {
      pattern: /const\s+CORS_ORIGIN\s*=\s*process\.env\.CORS_ORIGIN/,
      name: 'CORS_ORIGIN loaded from environment',
    },
    {
      pattern: /if\s*\(\s*!CORS_ORIGIN\s*\)/,
      name: 'CORS_ORIGIN validation check',
    },
    {
      pattern: /throw\s+new\s+Error.*CORS_ORIGIN/,
      name: 'Error thrown if CORS_ORIGIN missing',
    },
    {
      pattern: /origin:\s*CORS_ORIGIN/,
      name: 'CORS middleware uses CORS_ORIGIN variable',
    },
  ];

  checks.forEach(({ pattern, name }) => {
    if (pattern.test(appCode)) {
      testPass(name);
    } else {
      testFail(name, 'Pattern not found in code');
    }
  });

  // Check that hardcoded origin is removed
  if (appCode.includes('admin.slimyai.xyz') && !appCode.includes('Example:')) {
    testFail('Hardcoded origin still present', 'Found "admin.slimyai.xyz" in non-comment');
  } else {
    testPass('Hardcoded origin removed');
  }
}

/**
 * Test 5: Cookie Domain Configuration
 * Verify cookie domain is properly configured
 */
async function testCookieDomainConfiguration() {
  testHeader('Cookie Domain Configuration');

  const authModule = path.join(__dirname, '../admin-api/src/routes/auth.js');

  if (!fs.existsSync(authModule)) {
    testFail('auth.js not found', `Path: ${authModule}`);
    return;
  }

  const authCode = fs.readFileSync(authModule, 'utf8');

  const checks = [
    {
      pattern: /const\s+COOKIE_DOMAIN\s*=\s*requiredEnv\(['"]COOKIE_DOMAIN['"]\)/,
      name: 'COOKIE_DOMAIN uses requiredEnv()',
    },
    {
      pattern: /function\s+requiredEnv/,
      name: 'requiredEnv() helper function exists',
    },
    {
      pattern: /throw\s+new\s+Error.*Missing required env var/,
      name: 'requiredEnv() throws on missing var',
    },
  ];

  checks.forEach(({ pattern, name }) => {
    if (pattern.test(authCode)) {
      testPass(name);
    } else {
      testFail(name, 'Pattern not found in code');
    }
  });

  // Check that hardcoded fallback is removed
  if (authCode.match(/COOKIE_DOMAIN\s*=.*\|\|.*\.slimyai\.xyz/)) {
    testFail('Hardcoded cookie domain fallback still present', 'Found fallback to .slimyai.xyz');
  } else {
    testPass('Hardcoded cookie domain fallback removed');
  }
}

/**
 * Test 6: CSRF Middleware Application
 * Verify CSRF middleware is applied to all state-changing routes
 */
async function testCsrfMiddlewareApplication() {
  testHeader('CSRF Middleware Application to Routes');

  const routeFiles = [
    'admin-api/src/routes/personality.js',
    'admin-api/src/routes/uploads.js',
    'admin-api/src/routes/guild-settings.js',
    'admin-api/src/routes/bot.js',
    'admin-api/src/routes/chat.js',
    'admin-api/src/routes/snail.js',
    'admin-api/src/routes/guild-channels.js',
    'admin-api/src/routes/stats-tracker.js',
  ];

  for (const routeFile of routeFiles) {
    const filePath = path.join(__dirname, '..', routeFile);

    if (!fs.existsSync(filePath)) {
      testFail(`${routeFile} not found`, `Path: ${filePath}`);
      continue;
    }

    const routeCode = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(routeFile);

    // Check for requireCsrf import
    if (!/require.*csrf/.test(routeCode)) {
      testFail(`${fileName} - requireCsrf not imported`, 'Missing CSRF import');
      continue;
    }

    // Check for requireCsrf usage in routes
    const csrfUsage = routeCode.match(/requireCsrf/g);
    if (!csrfUsage || csrfUsage.length < 2) { // At least import + 1 usage
      testFail(`${fileName} - requireCsrf not used in routes`, 'CSRF middleware not applied');
    } else {
      testPass(`${fileName} - requireCsrf applied (${csrfUsage.length - 1} routes)`);
    }
  }
}

/**
 * Print test summary
 */
function printSummary() {
  log('\n' + '='.repeat(70), 'cyan');
  log('  TEST SUMMARY', 'bright');
  log('='.repeat(70), 'cyan');

  log(`\nTotal Tests: ${results.passed + results.failed + results.skipped}`, 'bright');
  log(`✓ Passed: ${results.passed}`, 'green');
  log(`✗ Failed: ${results.failed}`, 'red');
  log(`○ Skipped: ${results.skipped}`, 'yellow');

  if (results.failed > 0) {
    log('\n' + '='.repeat(70), 'red');
    log('  FAILED TESTS', 'red');
    log('='.repeat(70), 'red');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        log(`\n✗ ${t.name}`, 'red');
        if (t.error) {
          log(`  ${t.error}`, 'red');
        }
      });
  }

  log('\n' + '='.repeat(70), 'cyan');

  if (results.failed === 0 && results.passed > 0) {
    log('🎉 All tests passed!', 'green');
    process.exit(0);
  } else if (results.failed > 0) {
    log('❌ Some tests failed', 'red');
    process.exit(1);
  } else {
    log('⚠️  No tests were run', 'yellow');
    process.exit(0);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  const testName = process.argv[2];

  log('\n' + '█'.repeat(70), 'bright');
  log('  SECURITY FIXES TEST SUITE', 'bright');
  log('  Testing all security hardening changes', 'bright');
  log('█'.repeat(70), 'bright');

  try {
    if (!testName || testName === 'env') {
      await testEnvironmentValidation();
    }

    if (!testName || testName === 'cors') {
      await testCorsConfiguration();
    }

    if (!testName || testName === 'cookie') {
      await testCookieDomainConfiguration();
    }

    if (!testName || testName === 'csrf-routes') {
      await testCsrfMiddlewareApplication();
    }

    if (!testName || testName === 'memory') {
      await testMemoryLeakFix();
    }

    if (!testName || testName === 'csrf') {
      await testCsrfProtection();
    }

    printSummary();
  } catch (error) {
    log(`\n❌ Test suite error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
