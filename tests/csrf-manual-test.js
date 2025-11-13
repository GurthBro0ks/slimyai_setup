#!/usr/bin/env node
/**
 * CSRF Manual Test Script
 *
 * Tests CSRF protection on all state-changing routes
 * Requires:
 * 1. Admin API running
 * 2. Valid auth cookie from browser
 * 3. CSRF token from JWT
 *
 * Usage:
 *   # First, login to admin UI and get your auth cookie
 *   # Then extract CSRF token from JWT payload
 *
 *   export AUTH_COOKIE="your_auth_cookie_here"
 *   export CSRF_TOKEN="your_csrf_token_here"
 *   node tests/csrf-manual-test.js
 */

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:3080';
const AUTH_COOKIE = process.env.AUTH_COOKIE;
const CSRF_TOKEN = process.env.CSRF_TOKEN;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Routes to test
const testRoutes = [
  {
    name: 'POST /api/chat/bot',
    method: 'POST',
    path: '/api/chat/bot',
    body: { prompt: 'test', guildId: '123' },
  },
  {
    name: 'POST /api/snail/calc',
    method: 'POST',
    path: '/api/snail/calc',
    body: { sim: 100, total: 1000 },
  },
  {
    name: 'POST /api/bot/rescan',
    method: 'POST',
    path: '/api/bot/rescan',
    body: {},
  },
];

async function testCsrfProtection() {
  if (!AUTH_COOKIE) {
    log('❌ AUTH_COOKIE environment variable not set', 'red');
    log('\nTo get your auth cookie:', 'yellow');
    log('1. Login to admin UI in browser', 'yellow');
    log('2. Open DevTools > Application > Cookies', 'yellow');
    log('3. Copy the "auth" cookie value', 'yellow');
    log('4. export AUTH_COOKIE="<value>"', 'yellow');
    process.exit(1);
  }

  if (!CSRF_TOKEN) {
    log('❌ CSRF_TOKEN environment variable not set', 'red');
    log('\nTo get your CSRF token:', 'yellow');
    log('1. Decode your JWT at https://jwt.io', 'yellow');
    log('2. Find "csrfToken" in payload', 'yellow');
    log('3. export CSRF_TOKEN="<value>"', 'yellow');
    process.exit(1);
  }

  log('\n' + '='.repeat(70), 'cyan');
  log('  CSRF PROTECTION MANUAL TEST', 'bright');
  log('='.repeat(70), 'cyan');
  log(`\nTesting against: ${ADMIN_API_URL}`, 'cyan');

  let passed = 0;
  let failed = 0;

  for (const route of testRoutes) {
    log(`\n--- Testing ${route.name} ---`, 'cyan');

    // Test 1: Request WITHOUT CSRF token (should fail with 403)
    log('\n1. Request WITHOUT CSRF token...', 'yellow');
    try {
      const response = await fetch(`${ADMIN_API_URL}${route.path}`, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth=${AUTH_COOKIE}`,
        },
        body: JSON.stringify(route.body),
      });

      if (response.status === 403) {
        const body = await response.json();
        if (body.error === 'invalid-csrf-token') {
          log('✓ PASS: Rejected without CSRF token (403)', 'green');
          passed++;
        } else {
          log(`✗ FAIL: Got 403 but wrong error: ${JSON.stringify(body)}`, 'red');
          failed++;
        }
      } else {
        log(`✗ FAIL: Expected 403, got ${response.status}`, 'red');
        failed++;
      }
    } catch (error) {
      log(`✗ FAIL: Request error: ${error.message}`, 'red');
      failed++;
    }

    // Test 2: Request WITH valid CSRF token (should succeed or return business error)
    log('\n2. Request WITH valid CSRF token...', 'yellow');
    try {
      const response = await fetch(`${ADMIN_API_URL}${route.path}`, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth=${AUTH_COOKIE}`,
          'X-CSRF-Token': CSRF_TOKEN,
        },
        body: JSON.stringify(route.body),
      });

      if (response.status !== 403) {
        // Not rejected by CSRF middleware - good!
        // Might get business logic error (400, 404, 500) which is fine
        const body = await response.text();
        log(`✓ PASS: Accepted with CSRF token (${response.status})`, 'green');
        if (response.status >= 400) {
          log(`  Note: Got error but not CSRF-related: ${body.substring(0, 100)}`, 'yellow');
        }
        passed++;
      } else {
        const body = await response.json();
        log(`✗ FAIL: Rejected even with CSRF token: ${JSON.stringify(body)}`, 'red');
        failed++;
      }
    } catch (error) {
      log(`✗ FAIL: Request error: ${error.message}`, 'red');
      failed++;
    }
  }

  // Summary
  log('\n' + '='.repeat(70), 'cyan');
  log('  SUMMARY', 'bright');
  log('='.repeat(70), 'cyan');
  log(`\n✓ Passed: ${passed}`, 'green');
  log(`✗ Failed: ${failed}`, 'red');

  if (failed === 0) {
    log('\n🎉 All CSRF tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some CSRF tests failed', 'red');
    process.exit(1);
  }
}

testCsrfProtection().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
