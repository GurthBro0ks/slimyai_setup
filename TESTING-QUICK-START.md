# Security Fixes Testing - Quick Start Guide
**Last Updated:** 2025-11-13

---

## 🎯 Quick Test Summary

All automated code validation tests are **PASSING** ✅:
- CORS configuration: 5/5 tests passed
- CSRF middleware: 8/8 routes protected
- Memory leak fix: 6/6 validations passed

---

## 📋 What You Need to Test

### Already Tested (Automated) ✅
- [x] CORS configuration code
- [x] CSRF middleware applied to all routes
- [x] Memory cleanup code present
- [x] Cookie domain configuration

### Still Need Testing (Manual) ⏳
- [ ] Environment variable validation (server starts/fails correctly)
- [ ] CSRF protection (routes reject requests without token)
- [ ] Memory leak fix (functional test - optional, takes 70 minutes)
- [ ] End-to-end admin UI flow

---

## 🚀 Quick Testing Steps

### Step 1: Run Automated Tests (5 minutes)
```bash
# Already done! Results above ✅
node tests/security-fixes-test-suite.js cors
node tests/security-fixes-test-suite.js csrf-routes
node tests/security-fixes-test-suite.js memory
```

### Step 2: Test Environment Variables (10 minutes)
```bash
cd /home/user/slimyai_setup/admin-api

# Test 1: Create test .env file
cat > .env <<EOF
# Minimal valid config
CORS_ORIGIN=http://localhost:3080
COOKIE_DOMAIN=localhost
DISCORD_REDIRECT_URI=http://localhost:3080/api/auth/callback
DISCORD_CLIENT_ID=test_client_id
DISCORD_CLIENT_SECRET=test_client_secret
JWT_SECRET=test_secret_minimum_32_characters_long_please
SESSION_SECRET=test_session_minimum_32_characters_long
DB_HOST=localhost
DB_USER=slimyai
DB_PASSWORD=password
DB_NAME=slimyai
EOF

# Test 2: Verify server starts with valid config
npm run start
# Expected: Server starts, logs show "Listening on port..."
# Press Ctrl+C to stop

# Test 3: Remove CORS_ORIGIN and verify failure
sed -i '/CORS_ORIGIN/d' .env
npm run start
# Expected: Server exits with "Missing required environment variable: CORS_ORIGIN"

# Test 4: Restore config
echo "CORS_ORIGIN=http://localhost:3080" >> .env
```

**Result:** [ ] PASS  [ ] FAIL

---

### Step 3: Test CSRF Protection (20 minutes)

**Option A: Quick Manual Test (Recommended)**

1. Start admin-api with valid config:
```bash
cd admin-api
npm run start
```

2. In another terminal, test without CSRF token:
```bash
# This should FAIL with 403
curl -X POST http://localhost:3080/api/snail/calc \
  -H "Content-Type: application/json" \
  -d '{"sim": 100, "total": 1000}'

# Expected: {"error":"invalid-csrf-token"} or {"error":"unauthorized"}
```

3. Test GET route (no CSRF needed):
```bash
# This should work (or return 401 if not authenticated)
curl http://localhost:3080/health

# Expected: 200 OK or similar non-403 response
```

**Result:** [ ] PASS  [ ] FAIL

**Option B: Full CSRF Test (If you have admin UI running)**

Follow instructions in `TESTING-CHECKLIST.md` Section "Test Suite 3"

---

### Step 4: Integration Test (30 minutes) - OPTIONAL

If you have admin UI and can login:

1. Start both services:
```bash
# Terminal 1
cd admin-api && npm run start

# Terminal 2
cd admin-ui && npm run start
```

2. Open browser to http://localhost:3000

3. Perform these actions and verify no errors:
   - Login with Discord OAuth
   - Navigate to guild settings
   - Update any setting (triggers PUT with CSRF)
   - Check browser console - should see NO "403" or "CSRF" errors

**Result:** [ ] PASS  [ ] FAIL  [ ] SKIPPED

---

### Step 5: Memory Test (70 minutes) - OPTIONAL

Only if you want to verify memory cleanup works:

1. Start bot: `npm start`

2. Use `/chat` command 10 times in different channels

3. Wait 70 minutes (1 hour + 10 min)

4. Check logs for:
```
[chat] Cleaned up X expired conversation histories
```

**Result:** [ ] PASS  [ ] FAIL  [ ] SKIPPED

---

## ✅ Minimum Required for Production

You **MUST** complete these tests before deploying:

- [x] Automated code validation (DONE ✅)
- [ ] Environment variable validation (Step 2)
- [ ] CSRF protection basic test (Step 3, Option A)

**Optional but recommended:**
- [ ] Full CSRF test with auth (Step 3, Option B)
- [ ] Integration test (Step 4)

**Can skip:**
- [ ] Memory leak functional test (Step 5) - code validation is sufficient

---

## 🎯 Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| Code Validation | ✅ PASS | All automated tests passed |
| Env Var Validation | ⏳ TODO | Required before production |
| CSRF Protection | ⏳ TODO | Required before production |
| Integration Test | ⏳ TODO | Optional but recommended |
| Memory Cleanup | ⏳ TODO | Optional - code verified |

---

## 🚀 Ready for Production?

**Checklist:**
- [x] All code validation tests pass
- [ ] Environment variable tests pass
- [ ] CSRF protection tests pass
- [ ] Production `.env` file updated with:
  ```
  CORS_ORIGIN=https://admin.slimyai.xyz
  COOKIE_DOMAIN=.slimyai.xyz
  DISCORD_REDIRECT_URI=https://admin.slimyai.xyz/api/auth/callback
  ```

**When all checked:**
✅ Ready to deploy to staging
✅ After staging tests pass → Ready for production

---

## 📞 Need Help?

**Common Issues:**

1. **"Cannot find module 'mysql2'"**
   - Run: `npm install mysql2`

2. **"Missing required environment variable"**
   - Create `.env` file in admin-api directory
   - Copy from `.env.example` and fill in values

3. **CSRF tests all fail**
   - Make sure you're authenticated (have valid auth cookie)
   - Check that CSRF token matches JWT payload

4. **Server won't start**
   - Check logs for specific error
   - Verify all required env vars are set
   - Check database is running (if using DB features)

---

## 📚 Full Documentation

For complete testing procedures:
- `TESTING-CHECKLIST.md` - Complete checklist with all test cases
- `SECURITY-FIXES-REVIEW.md` - Detailed explanation of each fix
- `tests/security-fixes-test-suite.js` - Automated test code
- `tests/csrf-manual-test.js` - CSRF testing script

---

**Next Steps After Testing:**
1. Review test results
2. Fix any failures
3. Update production `.env` files
4. Deploy to staging
5. Deploy to production
6. Monitor for 24 hours

Good luck! 🎉
