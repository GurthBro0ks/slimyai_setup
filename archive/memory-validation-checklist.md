# Memory System Validation Checklist
**Project:** slimy.ai Discord Bot
**Component:** Memory System (lib/memory.js)
**Version:** 1.0.0
**Date:** 2025-10-06

---

## Pre-Flight Checks ✈️

Complete these checks BEFORE running any tests:

### Environment
- [ ] Node.js version >= 18
  ```bash
  node --version
  ```

- [ ] Bot is NOT running (to avoid conflicts)
  ```bash
  pm2 status slimy-bot  # Should show "stopped"
  ```

- [ ] Only ONE bot instance exists
  ```bash
  ps aux | grep "node.*index.js" | grep -v grep
  # Should return max 1 result
  ```

- [ ] Database file exists and is readable
  ```bash
  cat data_store.json | jq '.' > /dev/null
  # Should not error
  ```

### Backup
- [ ] Current database backed up
  ```bash
  cp data_store.json data_store.json.backup_$(date +%Y%m%d_%H%M%S)
  ```

- [ ] Backup verified
  ```bash
  diff data_store.json data_store.json.backup_*
  # Should show no differences
  ```

### Test Environment
- [ ] Test database file does NOT exist (will be auto-created)
  ```bash
  [ ! -f data_store_test.json ] && echo "✓ Clean" || echo "✗ Exists"
  ```

- [ ] Write permissions in project directory
  ```bash
  touch test_write && rm test_write && echo "✓ Writable"
  ```

---

## Automated Test Execution 🤖

### Step 1: Run Test Suite
```bash
npm run test:memory
```

**Success Criteria:**
- [ ] All unit tests pass (✓)
- [ ] All integration tests pass (✓)
- [ ] All edge case tests pass (✓)
- [ ] Race condition tests complete (may fail - expected)
- [ ] Error handling tests pass (✓)
- [ ] Data integrity tests pass (✓)
- [ ] Exit code = 0

**Expected Output:**
```
===========================================
Memory System Test Suite
===========================================

--- Unit Tests ---
✓ setConsent() creates consent entry
✓ getConsent() retrieves consent
...

Test Summary
===========================================
Passed: 30
Failed: 0
Skipped: 0
Total: 30

✓ All tests passed!
```

**⚠️ If Tests Fail:**
1. Note which tests failed
2. Check test output for error messages
3. Do NOT proceed to manual tests
4. Review bug report: `memory-bug-report.md`
5. Fix bugs or escalate

---

## Database Inspection 🔍

### Step 2: Inspect Test Database
```bash
./scripts/inspect-memory-db.sh data_store_test.json
```

**Success Criteria:**
- [ ] JSON is valid
- [ ] Schema contains prefs, memos, channelModes
- [ ] No duplicate IDs
- [ ] All memos have required fields
- [ ] Health score >= 90/100

**Expected Output:**
```
━━━ Database Health Score ━━━
✓ Excellent (100/100)
```

**❌ Fail Indicators:**
- Invalid JSON error
- Duplicate IDs detected
- Missing required fields
- Health score < 70

---

## Manual Testing 📝

### Step 3: Start Bot
```bash
pm2 start ecosystem.config.js
pm2 logs slimy-bot --lines 20
```

**Success Criteria:**
- [ ] Bot logs show "Logged in as..."
- [ ] No errors in startup logs
- [ ] Bot appears online in Discord

### Step 4: Basic Flow Test
Follow manual test guide: `test-memory-manual.md`

**Required Tests:**
1. [ ] Test 1.1: Grant Consent
2. [ ] Test 1.2: Remember a Note
3. [ ] Test 1.3: Export Notes
4. [ ] Test 1.4: Forget (Delete) Note

**Success Criteria:**
- All 4 tests pass without errors
- Discord responses match expected output
- Database file updated correctly

### Step 5: Edge Case Testing
**Required Tests:**
- [ ] Test 2.3: Special Characters & Emoji
- [ ] Test 2.4: Invalid Forget ID
- [ ] Test 3.1: Rapid Sequential Remember (5 notes)

**Success Criteria:**
- All edge cases handled gracefully
- No crashes or errors in logs

---

## Production Database Validation 💾

### Step 6: Inspect Production Database
```bash
./scripts/inspect-memory-db.sh data_store.json
```

**Success Criteria:**
- [ ] JSON is valid
- [ ] Health score >= 80/100
- [ ] No duplicate IDs
- [ ] No invalid memos

**⚠️ Critical Issues:**
- **Duplicate IDs**: STOP - Do not deploy, fix immediately
- **Invalid JSON**: STOP - Restore from backup
- **Health score < 50**: Review and clean database

---

## Rollback Procedures 🔄

### If Automated Tests Fail

```bash
# Stop bot if running
pm2 stop slimy-bot

# Remove test artifacts
rm -f data_store_test.json
rm -f data_store_test.json.tmp

# No rollback needed (tests are isolated)
```

### If Manual Tests Fail

```bash
# Stop bot
pm2 stop slimy-bot

# Restore backup
mv data_store.json data_store.json.FAILED
mv data_store.json.backup_XXXXXX data_store.json

# Restart bot
pm2 restart slimy-bot

# Verify
pm2 logs slimy-bot --lines 20
```

### If Production Database Corrupted

```bash
# IMMEDIATE ACTIONS:
1. pm2 stop slimy-bot
2. cp data_store.json data_store.json.CORRUPTED
3. Restore most recent backup
4. Run inspection script
5. If backup is good, restart bot
6. Monitor logs for errors
```

---

## Common Failure Patterns 🐛

### Pattern 1: Race Condition Data Loss
**Symptoms:**
- Concurrent /remember commands
- One memo missing after rapid operations
- Logs show multiple saves in quick succession

**Test:**
```bash
# Run Test 3.1 in manual guide
# If fewer than 5 notes saved → Race condition confirmed
```

**Action:**
- Document in bug report
- Add to known issues
- Do NOT deploy to high-traffic server

### Pattern 2: ID Collision
**Symptoms:**
- Duplicate `_id` values
- Delete command affects wrong memo
- Database integrity check fails

**Test:**
```bash
./scripts/inspect-memory-db.sh data_store.json | grep "duplicate"
```

**Action:**
- CRITICAL: Stop accepting new memos
- Manually fix duplicate IDs
- Deploy ID generation fix

### Pattern 3: Guild/DM Leakage
**Symptoms:**
- Guild notes appear in DM exports
- DM notes appear in guild exports
- Privacy violation

**Test:**
```bash
# Run Test 4.3 in manual guide
# Verify complete isolation
```

**Action:**
- CRITICAL: Privacy issue
- Review listMemos filter logic
- Test thoroughly before deploy

### Pattern 4: JSON Corruption
**Symptoms:**
- Bot crashes on startup
- Cannot read database file
- Logs show JSON parse errors

**Test:**
```bash
cat data_store.json | jq '.'  # Should not error
```

**Action:**
- Restore from backup immediately
- Investigate cause (disk full, concurrent writes)
- Add better error handling

---

## Success Exit Criteria ✅

Mark complete when ALL of the following are true:

### Automated Tests
- [x] `npm run test:memory` passes
- [x] Exit code = 0
- [x] No failing tests
- [x] Race condition tests documented (may fail)

### Database Inspection
- [ ] Production database health score >= 80
- [ ] No duplicate IDs
- [ ] No invalid entries
- [ ] No corruption

### Manual Tests
- [ ] Basic flow (consent → remember → export → forget) works
- [ ] Edge cases handled correctly
- [ ] No crashes during testing
- [ ] Logs show no errors

### Documentation
- [ ] Bug report reviewed
- [ ] All failures documented
- [ ] Fix recommendations noted
- [ ] Known issues list updated

---

## Post-Validation Actions 📋

### If ALL Tests Pass
1. ✅ Mark validation as complete
2. 📊 Export diagnostics report
3. 📝 Document in UPDATES.txt
4. 🚀 Safe to deploy to production
5. 📞 Notify team of success

### If Tests Fail
1. ❌ Mark validation as FAILED
2. 📊 Export test results and logs
3. 🐛 Update bug report with findings
4. 🔧 Create fix tickets/issues
5. 🚫 DO NOT deploy to production
6. 📞 Escalate to development team

---

## Validation Sign-Off ✍️

**Validator Name:** ___________________________

**Date:** ___________________________

**Test Results:**
- Automated: PASS / FAIL
- Manual: PASS / FAIL
- Database: PASS / FAIL

**Overall Status:** APPROVED / REJECTED / NEEDS REVIEW

**Notes:**
```



```

**Signature:** ___________________________

---

## Appendix: Quick Command Reference

```bash
# Run all automated tests
npm run test:memory

# Inspect database
./scripts/inspect-memory-db.sh data_store.json

# Backup database
cp data_store.json data_store.json.backup_$(date +%Y%m%d_%H%M%S)

# Restore database
mv data_store.json.backup_XXXXXX data_store.json

# Check bot status
pm2 status slimy-bot

# View logs
pm2 logs slimy-bot --lines 50

# Restart bot
pm2 restart slimy-bot

# Stop bot
pm2 stop slimy-bot
```

---

**Checklist Version:** 1.0
**Last Updated:** 2025-10-06
**Next Review:** After any memory.js changes
