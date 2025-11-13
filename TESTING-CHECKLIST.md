# Security Fixes Testing Checklist
**Date:** 2025-11-13
**Branch:** claude/repo-scan-report-01UCn4QgdqJA4DnDjpVw2Wdb
**Tester:** ________________

---

## Pre-Test Setup

### Environment Preparation
- [ ] Code checked out to test branch
- [ ] Dependencies installed: `npm install && npm install --prefix admin-api`
- [ ] Test environment variables set (see below)
- [ ] Backup of current production `.env` files created

### Required Environment Variables

Create a test `.env` file in `admin-api/` directory:

```bash
# Required for tests
CORS_ORIGIN=http://localhost:3000
COOKIE_DOMAIN=localhost
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback
DISCORD_CLIENT_ID=your_test_client_id
DISCORD_CLIENT_SECRET=your_test_client_secret
JWT_SECRET=test_secret_minimum_32_characters_long
SESSION_SECRET=test_session_minimum_32_characters

# Optional for testing
DISCORD_BOT_TOKEN=your_bot_token
DB_HOST=localhost
DB_USER=slimyai
DB_PASSWORD=your_password
DB_NAME=slimyai_test
```

---

## Automated Tests

### Test Suite 1: Code Validation
Run automated code inspection tests:

```bash
cd /home/user/slimyai_setup
node tests/security-fixes-test-suite.js
```

**Expected Results:**
- [ ] ✓ All environment variable checks pass
- [ ] ✓ All CORS configuration checks pass
- [ ] ✓ All cookie domain checks pass
- [ ] ✓ All CSRF middleware checks pass
- [ ] ✓ All memory leak fix checks pass

**Test Output:**
```
Expected: "✓ Passed: X" (where X > 20)
Actual: _________________
```

**Status:** [ ] PASS  [ ] FAIL

**Notes:**
```
_________________________________________________________________
_________________________________________________________________
```

---

## Manual Tests

### Test Suite 2: Environment Variable Validation

#### Test 2.1: Missing CORS_ORIGIN
```bash
cd admin-api
# Remove CORS_ORIGIN from .env
node server.js
```

**Expected:** Server exits with error: `"Missing required environment variable: CORS_ORIGIN"`

**Actual Output:**
```
_________________________________________________________________
_________________________________________________________________
```

**Status:** [ ] PASS  [ ] FAIL

---

#### Test 2.2: Missing COOKIE_DOMAIN
```bash
# Remove COOKIE_DOMAIN from .env
node server.js
```

**Expected:** Server exits with error: `"Missing required env var: COOKIE_DOMAIN"`

**Actual Output:**
```
_________________________________________________________________
_________________________________________________________________
```

**Status:** [ ] PASS  [ ] FAIL

---

#### Test 2.3: Missing DISCORD_REDIRECT_URI
```bash
# Remove DISCORD_REDIRECT_URI from .env
node server.js
```

**Expected:** Server exits with error: `"Missing required env var: DISCORD_REDIRECT_URI"`

**Actual Output:**
```
_________________________________________________________________
_________________________________________________________________
```

**Status:** [ ] PASS  [ ] FAIL

---

#### Test 2.4: All Variables Present
```bash
# Restore all variables to .env
node server.js
```

**Expected:** Server starts successfully, logs show variables loaded

**Actual Output:**
```
_________________________________________________________________
_________________________________________________________________
```

**Status:** [ ] PASS  [ ] FAIL

---

### Test Suite 3: CSRF Protection

#### Setup for CSRF Tests
1. Start admin-api: `npm run start --prefix admin-api`
2. Start admin-ui (if available): `npm run start --prefix admin-ui`
3. Navigate to admin UI in browser
4. Login with Discord OAuth
5. Open DevTools > Application > Cookies
6. Copy `auth` cookie value
7. Decode JWT at https://jwt.io
8. Extract `csrfToken` from payload

**Auth Cookie:** `_________________________________`
**CSRF Token:** `_________________________________`

---

#### Test 3.1: CSRF Token Rejection
Test routes WITHOUT CSRF token:

```bash
# Export credentials
export AUTH_COOKIE="your_auth_cookie_here"
export CSRF_TOKEN="your_csrf_token_here"

# Run CSRF test script
node tests/csrf-manual-test.js
```

**Expected Results:**
- [ ] POST /api/chat/bot - Rejected (403) without CSRF
- [ ] POST /api/snail/calc - Rejected (403) without CSRF
- [ ] POST /api/bot/rescan - Rejected (403) without CSRF

**Test Output:**
```
Expected: "✓ Passed: 6" (3 routes × 2 tests each)
Actual: _________________
```

**Status:** [ ] PASS  [ ] FAIL

**Notes:**
```
_________________________________________________________________
_________________________________________________________________
```

---

#### Test 3.2: Manual Route Testing
Test additional routes manually:

**Route: PUT /api/:guildId/personality**
```bash
curl -X PUT http://localhost:3080/api/1234567890/personality \
  -H "Cookie: auth=$AUTH_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"temperature": 0.7}'
```
**Expected:** 403 Forbidden, {"error": "invalid-csrf-token"}
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL

---

**Route: POST /api/:guildId/uploads**
```bash
curl -X POST http://localhost:3080/api/1234567890/uploads \
  -H "Cookie: auth=$AUTH_COOKIE" \
  -F "files=@test-image.png"
```
**Expected:** 403 Forbidden
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL

---

**Route: DELETE /api/chat/conversations/:id**
```bash
curl -X DELETE http://localhost:3080/api/chat/conversations/test123 \
  -H "Cookie: auth=$AUTH_COOKIE"
```
**Expected:** 403 Forbidden
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL

---

#### Test 3.3: CSRF Token Acceptance
Repeat tests above WITH CSRF header:

```bash
curl -X PUT http://localhost:3080/api/1234567890/personality \
  -H "Cookie: auth=$AUTH_COOKIE" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"temperature": 0.7}'
```

**Expected:** NOT 403 (may be 400/404/500 for business reasons, but not CSRF error)
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL

---

### Test Suite 4: Memory Leak Fix

#### Test 4.1: Code Verification
Already tested by automated suite - verify results:
- [ ] HISTORY_TTL_MS constant exists (1 hour)
- [ ] CLEANUP_INTERVAL_MS constant exists (10 minutes)
- [ ] cleanupOldHistories() function exists
- [ ] setInterval registered for cleanup
- [ ] lastAccess timestamp tracking present

**Status:** [ ] PASS  [ ] FAIL

---

#### Test 4.2: Functional Test (Long-running)
**NOTE:** This test takes ~70 minutes

```bash
# Start bot
npm start

# Use /chat command 10 times in different channels
# Document usage:
```

| Time | Channel ID | User ID | Command |
|------|------------|---------|---------|
| __:__ | _________ | _______ | /chat hello |
| __:__ | _________ | _______ | /chat test |
| __:__ | _________ | _______ | /chat ... |

**After 1 hour 10 minutes, check logs:**
```bash
# Look for cleanup message
tail -f logs/bot.log | grep "Cleaned up"
```

**Expected:** `[chat] Cleaned up X expired conversation histories`
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL  [ ] SKIPPED (time constraint)

---

### Test Suite 5: CORS Configuration

#### Test 5.1: Allowed Origin
```bash
curl -X OPTIONS http://localhost:3080/api/guilds \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

**Expected:** Response includes `Access-Control-Allow-Origin: http://localhost:3000`
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL

---

#### Test 5.2: Disallowed Origin
```bash
curl -X OPTIONS http://localhost:3080/api/guilds \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

**Expected:** No CORS headers or CORS error
**Actual:** _________________
**Status:** [ ] PASS  [ ] FAIL

---

### Test Suite 6: Integration Testing

#### Test 6.1: Full Admin UI Flow
**Prerequisites:** Admin UI running, valid Discord OAuth configured

1. Navigate to http://localhost:3000
   **Status:** [ ] Page loads

2. Click "Login with Discord"
   **Status:** [ ] Redirects to Discord OAuth

3. Complete OAuth flow
   **Status:** [ ] Redirects back to dashboard

4. Navigate to guild settings
   **Status:** [ ] Settings page loads

5. Update personality settings (triggers PUT with CSRF)
   **Status:** [ ] Update succeeds, no CSRF errors in console

6. Upload screenshot (triggers POST with CSRF)
   **Status:** [ ] Upload succeeds

7. Create conversation (triggers POST with CSRF)
   **Status:** [ ] Conversation created

8. Delete conversation (triggers DELETE with CSRF)
   **Status:** [ ] Conversation deleted

9. Check browser console for errors
   **Expected:** No CSRF errors, no CORS errors
   **Actual:** _________________

**Overall Status:** [ ] PASS  [ ] FAIL

**Browser Console Screenshot:** (attach if errors)

---

### Test Suite 7: Bot Chat Command Stability

#### Test 7.1: Memory Usage Monitoring
```bash
# Start bot
npm start

# In another terminal, monitor memory
watch -n 30 'ps aux | grep "node index.js"'
```

**Initial Memory (RSS):** _________ MB

**After 50 /chat commands:**
- Memory (RSS): _________ MB
- Time elapsed: _________ minutes

**After 100 /chat commands:**
- Memory (RSS): _________ MB
- Time elapsed: _________ minutes

**After 1 hour:**
- Memory (RSS): _________ MB
- Expected cleanup: [ ] Yes  [ ] No
- Log message seen: [ ] Yes  [ ] No

**After cleanup:**
- Memory (RSS): _________ MB
- Reduction: _________ MB

**Status:** [ ] PASS  [ ] FAIL  [ ] SKIPPED

**Notes:**
```
Expected: Memory returns close to baseline after cleanup
Acceptable: Memory growth <5MB over baseline
_________________________________________________________________
_________________________________________________________________
```

---

## Production Readiness Checklist

### Pre-Deployment
- [ ] All automated tests pass
- [ ] All manual tests pass (or skipped with justification)
- [ ] Production `.env` file updated with required variables
- [ ] Production `.env` backed up
- [ ] Deployment plan reviewed
- [ ] Rollback plan prepared

### Environment Variables Configured
- [ ] CORS_ORIGIN set to production admin UI URL
- [ ] COOKIE_DOMAIN set to production domain
- [ ] DISCORD_REDIRECT_URI set to production callback URL
- [ ] All existing variables preserved

### Stakeholder Approval
- [ ] Test results reviewed by: _________________
- [ ] Deployment approved by: _________________
- [ ] Date/time for deployment: _________________

---

## Test Summary

### Overall Results
**Total Tests Run:** _________
**Passed:** _________
**Failed:** _________
**Skipped:** _________

**Pass Rate:** _________ %

### Critical Issues Found
```
Issue #1: ________________________________________________________
Severity: [ ] BLOCKER  [ ] CRITICAL  [ ] MAJOR  [ ] MINOR
Status: [ ] FIXED  [ ] OPEN  [ ] DEFERRED

Issue #2: ________________________________________________________
Severity: [ ] BLOCKER  [ ] CRITICAL  [ ] MAJOR  [ ] MINOR
Status: [ ] FIXED  [ ] OPEN  [ ] DEFERRED
```

### Recommendation
- [ ] ✅ READY FOR PRODUCTION - All tests passed
- [ ] ⚠️ READY WITH CAVEATS - Minor issues, proceed with caution
- [ ] ❌ NOT READY - Critical issues must be fixed first

**Tester Signature:** _________________
**Date:** _________________

---

## Deployment Log

### Deployment to Staging
**Date/Time:** _________________
**Deployed By:** _________________
**Issues Encountered:**
```
_________________________________________________________________
_________________________________________________________________
```

### Deployment to Production
**Date/Time:** _________________
**Deployed By:** _________________
**Issues Encountered:**
```
_________________________________________________________________
_________________________________________________________________
```

### Post-Deployment Verification (24 hours)
- [ ] No errors in logs
- [ ] Memory usage stable
- [ ] CSRF protection working
- [ ] No user complaints
- [ ] Monitoring metrics normal

**Verified By:** _________________
**Date:** _________________

---

**Document Version:** 1.0
**Last Updated:** 2025-11-13
