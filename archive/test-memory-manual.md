# Manual Memory System Test Guide
**Discord Bot:** slimy.ai
**Test Scope:** /remember → /export → /forget workflow
**Duration:** ~15 minutes
**Tester:** Non-technical friendly

---

## Pre-Flight Checklist

Before starting tests, verify:

- [ ] Bot is online (green dot in Discord)
- [ ] You have admin permissions or are in a test server
- [ ] Bot responds to `/help` or `/ping` (if available)
- [ ] PM2 is running: `pm2 list` shows `slimy-bot` as `online`
- [ ] Only ONE bot instance is running (check local + Pterodactyl)

### Verify Single Instance
```bash
# On local machine
pm2 list | grep slimy

# On Pterodactyl (if applicable)
# Check via panel or SSH - ensure bot is stopped there
```

**⚠️ CRITICAL:** If multiple instances are running, **stop all except one** before testing.

---

## Test Environment Setup

### 1. Backup Current Database
```bash
cd /home/mint/Desktop/slimyai_setup
cp data_store.json data_store.json.backup
echo "Backup created: $(date)"
```

### 2. Open Log Monitor (Terminal 1)
```bash
pm2 logs slimy-bot --lines 50
```
Leave this terminal open to watch real-time logs.

### 3. Open Database Inspector (Terminal 2 - optional)
```bash
watch -n 2 'cat data_store.json | jq ".memos | length"'
```
This shows memo count updating in real-time.

---

## Test Suite

## Test 1: Basic Remember-Export-Forget Loop ✅

### Test 1.1: Grant Consent
**In Discord:**
```
/consent allow:true
```

**Expected:**
```
✅ Consent granted. You can now use /remember.
```

**Verify:**
```bash
cat data_store.json | jq '.prefs[] | select(.userId == "YOUR_DISCORD_ID")'
```

**✅ PASS Criteria:**
- Discord shows success message
- `data_store.json` contains consent entry with `"value": "1"`
- Logs show no errors

---

### Test 1.2: Remember a Note
**In Discord:**
```
/remember note:My first test note
```

**Expected:**
```
📝 Noted.
```

**Verify:**
```bash
cat data_store.json | jq '.memos | length'
# Should show count increased by 1
```

**✅ PASS Criteria:**
- Discord shows "📝 Noted."
- Memo count increased by 1
- Logs show `[memory]` operations without errors

---

### Test 1.3: Export Notes
**In Discord:**
```
/export
```

**Expected:**
- File attachment: `slimy-notes-YOUR_ID.json`
- Content shows your note with `_id`, `userId`, `guildId`, `content`, `createdAt`

**Download the file and verify:**
```json
{
  "user": "YOUR_DISCORD_ID",
  "guild": "GUILD_ID or null",
  "notes": [
    {
      "_id": "...",
      "userId": "YOUR_DISCORD_ID",
      "guildId": "...",
      "content": "My first test note",
      "createdAt": 1234567890
    }
  ]
}
```

**✅ PASS Criteria:**
- Export file downloads successfully
- JSON is valid (paste into jsonlint.com to verify)
- Note content matches what you entered
- `_id` field exists and is non-empty

**❌ FAIL Indicators:**
- Attachment fails to send
- JSON is malformed
- Note content is missing or incorrect
- `_id` is null or empty

---

### Test 1.4: Forget (Delete) Note
**In Discord:**
```
/forget id:PASTE_ID_FROM_EXPORT
```

Example:
```
/forget id:1759579124763y3agseluxr
```

**Expected:**
```
🧽 Deleted note #1759579124763y3agseluxr.
```

**Verify:**
```bash
cat data_store.json | jq '.memos | length'
# Should show count decreased by 1
```

**Re-export to confirm deletion:**
```
/export
```
The deleted note should NOT appear.

**✅ PASS Criteria:**
- Discord shows delete confirmation
- Memo count decreased by 1
- Re-export shows note is gone
- Logs show successful deletion

---

## Test 2: Edge Cases 🔍

### Test 2.1: Empty Note
**In Discord:**
```
/remember note:
```

**Expected:**
```
❌ This option requires a value
```

**✅ PASS:** Discord rejects empty input (slash command validation)

---

### Test 2.2: Very Long Note (1000+ characters)
**In Discord:**
```
/remember note:[Paste 1000 character text]
```

**Sample long text:**
```
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
```

**Expected:**
```
📝 Noted.
```

**✅ PASS Criteria:**
- Note is saved successfully
- Export shows full text without truncation
- No JSON parsing errors in logs

**❌ FAIL:** Text is truncated or command fails

---

### Test 2.3: Special Characters & Emoji
**In Discord:**
```
/remember note:Test with emoji 🐌🎉 and symbols: <>&"'
```

**Expected:**
```
📝 Noted.
```

**Verify in export:**
- Emoji renders correctly: `🐌🎉`
- Special chars escaped properly: `<>&"'`

**✅ PASS:** All characters preserved in export

---

### Test 2.4: Invalid Forget ID
**In Discord:**
```
/forget id:INVALID_ID_12345
```

**Expected:**
```
🧽 Deleted note #INVALID_ID_12345.
```
(Note: Current implementation doesn't validate, so this is expected behavior)

**Verify:**
```bash
cat data_store.json | jq '.memos | length'
# Count should NOT change
```

**✅ PASS:** Database unchanged, no errors in logs

---

### Test 2.5: Forget Already Deleted Note
**In Discord:**
1. Create note: `/remember note:Temp note`
2. Export and get `_id`
3. Delete: `/forget id:TEMP_ID`
4. Delete again: `/forget id:TEMP_ID`

**Expected (2nd delete):**
```
🧽 Deleted note #TEMP_ID.
```

**✅ PASS:** No error, database integrity maintained

---

## Test 3: Concurrent Operations ⚡

### Test 3.1: Rapid Sequential Remember
**In Discord (run these as fast as possible):**
```
/remember note:Note 1
/remember note:Note 2
/remember note:Note 3
/remember note:Note 4
/remember note:Note 5
```

**Expected:**
- All 5 notes saved
- Export shows all 5 notes
- No duplicates
- All have unique `_id` values

**Verify:**
```bash
cat data_store.json | jq '.memos | length'
/export  # Download and count notes
```

**✅ PASS Criteria:**
- All 5 notes present
- No duplicates
- Unique IDs
- No errors in logs

**❌ FAIL Indicators (Race Condition Bug):**
- Fewer than 5 notes saved
- Duplicate IDs
- Logs show save errors

---

### Test 3.2: Concurrent Remember + Export
**In Discord:**
1. Start typing `/remember note:Long note text here...`
2. **Before hitting Enter**, open another channel
3. Type `/export`
4. Hit Enter on both at nearly the same time

**Expected:**
- Remember completes: `📝 Noted.`
- Export shows notes (may or may not include the new one depending on timing)

**✅ PASS:** Both operations succeed, no corruption

**❌ FAIL:** One operation fails or database corrupted

---

### Test 3.3: Two Users Remember Simultaneously
**Requires 2 Discord accounts:**

**Account A:**
```
/remember note:User A note
```

**Account B (at same time):**
```
/remember note:User B note
```

**Expected:**
- Both users get `📝 Noted.`
- Both notes saved to database
- Each user's export shows only their note

**Verify:**
```bash
cat data_store.json | jq '.memos'
# Should show 2 notes with different userIds
```

**✅ PASS:** Both notes saved independently

**❌ FAIL (Race Condition):** Only one note saved

---

## Test 4: Guild vs DM Context 🌐

### Test 4.1: Remember in Guild
**In Discord Server:**
```
/consent allow:true
/remember note:Guild note
/export
```

**Expected:**
- Export shows `"guild": "GUILD_ID_HERE"`

---

### Test 4.2: Remember in DM
**In Direct Message to bot:**
```
/consent allow:true
/remember note:DM note
/export
```

**Expected:**
- Export shows `"guild": null`

---

### Test 4.3: Context Isolation
**Verify:**
1. Export from guild → should show only guild notes
2. Export from DM → should show only DM notes
3. Notes should NOT leak between contexts

**✅ PASS:** Complete isolation between guild/DM

**❌ FAIL:** Notes appear in wrong context

---

## Test 5: Error Recovery 💥

### Test 5.1: Database Corruption Test
**⚠️ Backup first!**

```bash
# Backup
cp data_store.json data_store.json.backup

# Corrupt the file
echo "{invalid json" > data_store.json

# In Discord, try to remember
/remember note:Test after corruption
```

**Expected:**
- Bot may create new empty database
- Or show error message

**Restore:**
```bash
mv data_store.json.backup data_store.json
pm2 restart slimy-bot
```

**✅ PASS:** Bot handles gracefully (either error or recovery)

**❌ FAIL:** Bot crashes or becomes unresponsive

---

### Test 5.2: Missing Database File
```bash
# Backup
mv data_store.json data_store.json.backup

# In Discord
/remember note:Test with missing DB
```

**Expected:**
- Bot creates new `data_store.json`
- Note is saved

**Restore:**
```bash
rm data_store.json
mv data_store.json.backup data_store.json
pm2 restart slimy-bot
```

**✅ PASS:** Bot auto-creates database

---

## Test 6: Large Dataset 📊

### Test 6.1: 25+ Notes (Export Limit)
**In Discord:**
```
Create 30 notes using /remember
/export
```

**Expected:**
- Export shows exactly 25 notes (limit specified in code)
- Most recent 25 notes shown
- File downloads successfully

**✅ PASS:** Limit enforced, no performance issues

---

## Monitoring & Debugging

### Watch Logs in Real-Time
```bash
pm2 logs slimy-bot --raw | grep -E "\[memory\]|remember|export|forget"
```

### Check for Errors
```bash
pm2 logs slimy-bot --err --lines 100
```

### Inspect Database
```bash
# Pretty print
cat data_store.json | jq '.'

# Count memos
cat data_store.json | jq '.memos | length'

# Find specific user's memos
cat data_store.json | jq '.memos[] | select(.userId == "YOUR_ID")'

# Check for duplicate IDs
cat data_store.json | jq '.memos | group_by(._id) | map(select(length > 1))'
```

---

## Success Criteria Summary

### ✅ All Tests Pass If:
- [ ] All basic remember/export/forget operations work
- [ ] Edge cases handled gracefully (empty, long, special chars)
- [ ] Concurrent operations don't cause data loss
- [ ] Guild/DM isolation maintained
- [ ] Error recovery works (corruption, missing file)
- [ ] Large datasets (25+) handled correctly
- [ ] No crashes or unhandled errors in logs

### ❌ Test Fails If:
- [ ] Notes are lost after remember
- [ ] Export shows wrong/missing notes
- [ ] Forget doesn't actually delete
- [ ] Concurrent ops cause data loss
- [ ] Guild notes appear in DM exports
- [ ] Bot crashes during any operation
- [ ] Database becomes corrupted

---

## Rollback Procedure

If tests fail and database is corrupted:

```bash
cd /home/mint/Desktop/slimyai_setup

# Stop bot
pm2 stop slimy-bot

# Restore backup
mv data_store.json data_store.json.FAILED
mv data_store.json.backup data_store.json

# Restart bot
pm2 restart slimy-bot

# Verify
pm2 logs slimy-bot --lines 20
```

---

## Reporting Results

### Test Report Format
```
Test: [Test Name]
Status: PASS / FAIL
Time: [Timestamp]
Notes: [Any observations]
Logs: [Relevant log excerpts]
```

### Example:
```
Test: Basic Remember-Export-Forget Loop
Status: PASS
Time: 2025-10-06 12:00:00
Notes: All operations completed successfully
Logs: [memory] json-store ready, no errors
```

---

**Manual Testing Complete!**
Proceed to automated test suite: `npm run test:memory`
