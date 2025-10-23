# SLIMY.AI BOT - UPDATE LOG

## 2025-10-23 — Usage costs + TPM budget + week anchor (Fri 04:30 PT)
**Date:** 2025-10-23
**Status:** ✅ COMPLETED
**Branch:** chore/memory-audit-2025-10-12

### Summary
Implemented admin `/usage` command with OpenAI cost tracking, raised TPM budget to 2M with improved 429 backoff, and introduced week anchor utilities (Fri 04:30 PT) for consistent club analytics boundaries.

### Features Delivered

1. ✅ **`/usage` Command (Admin Only)** — OpenAI usage & cost tracking
   - Time windows: today, 7d, 30d, this_month, custom ranges
   - Fetches data from OpenAI `/v1/usage` API with graceful fallback
   - **Cost calculation**:
     - gpt-4o-mini: $0.15/M input + $0.60/M output tokens
     - DALL-E 3: $0.04 standard, $0.08 HD per image
   - Displays model breakdown, token counts, image counts, costs, and grand total
   - Pricing env-overridable via `PRICE_4OMINI_IN/OUT`, `PRICE_DALLE3_STANDARD/HD`

2. ✅ **DALL-E 3 Instrumentation** — Quality tracking for accurate costs
   - Added `quality` and `model` columns to `image_generation_log` table
   - Updated `generateImage()` to accept quality parameter (standard/hd)
   - Logs all image generations with quality tier for cost breakdowns
   - **Migration needed**: `ALTER TABLE image_generation_log ADD COLUMN quality VARCHAR(20) DEFAULT 'standard'; ADD COLUMN model VARCHAR(50) DEFAULT 'dall-e-3';`

3. ✅ **OpenAI TPM Budget** — 2,000,000 TPM with improved 429 backoff
   - Configurable via `OPENAI_TPM_BUDGET` env variable (default: 2M)
   - Tracks token usage in sliding 1-minute window
   - Respects `Retry-After` header from 429 responses
   - Exponential backoff: 1.5x multiplier, capped at 60s
   - Logs throttle warnings max once per minute
   - Wraps all OpenAI client methods with automatic retry logic

4. ✅ **Week Anchor Utilities** — Fri 04:30 PT for club analytics
   - New `lib/week-anchor.js` with luxon-based datetime handling
   - Default anchor: **Friday 04:30 America/Los_Angeles** (UTC-7)
   - Env overrides: `CLUB_WEEK_ANCHOR_DAY`, `CLUB_WEEK_ANCHOR_TIME`, `CLUB_WEEK_ANCHOR_TZ`
   - Functions: `getAnchor()`, `getLastAnchor()`, `getNextAnchor()`, `getWeekId()`, `formatAnchorDisplay()`
   - Week ID format: `YYYY-Www` (e.g., "2025-W43")
   - Integrated into `/club-stats` footer with timezone conversions (PT/Detroit/UTC)

### Environment Variables Added
```bash
# OpenAI Usage & Cost Tracking
OPENAI_TPM_BUDGET=2000000  # Tokens per minute budget
PRICE_4OMINI_IN=0.15       # gpt-4o-mini input cost per 1M tokens
PRICE_4OMINI_OUT=0.6       # gpt-4o-mini output cost per 1M tokens
PRICE_DALLE3_STANDARD=0.04 # DALL-E 3 standard quality per image
PRICE_DALLE3_HD=0.08       # DALL-E 3 HD quality per image

# Week Anchor (replaces CLUB_WEEKLY_BOUNDARY)
CLUB_WEEK_ANCHOR_DAY=FRI
CLUB_WEEK_ANCHOR_TIME=04:30
CLUB_WEEK_ANCHOR_TZ=America/Los_Angeles
```

### Commits (3 total)
```
8b4a5d9 - feat(usage): admin /usage with cost math (4o-mini tokens + DALL-E 3 per-image)
f37d504 - chore(openai): raise TPM to 2,000,000 via OPENAI_TPM_BUDGET + improved 429 backoff
7c6aae7 - feat(week): anchor utils + Fri 04:30 PT integration in stats/analyze
```

### Database Migrations Needed
```sql
-- Add quality and model tracking to image generation logs
ALTER TABLE image_generation_log
  ADD COLUMN quality VARCHAR(20) DEFAULT 'standard',
  ADD COLUMN model VARCHAR(50) DEFAULT 'dall-e-3',
  ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ADD INDEX idx_image_created (created_at);
```

### What's Next
- Multi-upload support for `/club analyze` (attachment collector + from_recent:N)
- Message context command "Analyze Screenshots"
- Per-guild week anchor overrides via `/club-admin`
- Week ID integration into club_snapshots table

---

## 2025-10-23 — Sheets sync + totals fixed
**Date:** 2025-10-23
**Status:** ✅ COMPLETED
**Branch:** chore/memory-audit-2025-10-12

### Summary
- Club stats now sum `club_latest.total_power` only, treat nulls safely, and format totals/averages with compact output (≈10.1B expectation).
- `/club analyze` embeds report Google Sheets sync status; failures surface to callers and keep logs concise.
- Google Sheets push honours per-guild IDs, auto-creates the `Club Latest` tab, and throws actionable errors when the service account lacks access.
- Added QA helpers: `scripts/verify-club-stats.js` regression snapshot + warnings, harnessed test-mode stubs, and “No prior week yet” message for empty movers.

## 2025-10-23 — Headless ingest + verifier
**Date:** 2025-10-23
**Status:** ✅ COMPLETED
**Branch:** chore/memory-audit-2025-10-12

### Summary
- Added CLI pipeline `scripts/ingest-club-screenshots.js` to mirror `/club analyze` for automated runs (snapshot commit + Sheet sync).
- Split reusable embed builder into `lib/club-stats-service.js` and introduced `scripts/post-stats-to-channel.js` for dev spot-checks.
- Replaced stats verifier with guild-scoped tool that writes `out/verify-*.txt` and warns when totals fall outside the expected band (~1–30 B).
- Wired npm helpers (`ingest:test`, `verify:stats`, `spotcheck:stats`) and ingested the latest `/opt/slimy/app/screenshots/test` batch via CLI.


## 2025-10-22 — Bulletproof club analytics + admin console + SLOs
**Date:** 2025-10-22
**Status:** ✅ COMPLETED
**Branch:** chore/memory-audit-2025-10-12

### Summary
Implemented Option C "Bulletproof" enhancements for club analytics, including two-model ensemble OCR, 100% coverage requirement, second approver system, admin console, cohort analysis, and volatility leaderboards. Significantly improved accuracy and safety of weekly club data commits.

### Phase 1: Accuracy Hardening (Paranoid Mode)
1. ✅ **Two-Model Ensemble OCR** — gpt-4o-mini + gpt-4o with digit-level reconciliation
   - Parallel parsing with two models, cross-validation of every digit
   - Disagreement tracking and automatic resolution (stronger model wins)
   - Optional via `CLUB_USE_ENSEMBLE=1` flag

2. ✅ **100% Coverage Requirement** — Block commits unless all last-week members present
   - Coverage guard triggers if any members missing from previous week
   - Shows coverage percentage in preview footer and embed
   - Force commit still available for admins to override

3. ✅ **Second Approver System** — Require 2 admins for risky commits
   - Triggers when coverage <100% OR >5 members exceed ±40% WoW change
   - Tracks approvals per session with audit trail
   - Shows approval status in preview (1/2, 2/2 approvals)
   - Admin/club role permission enforcement

4. ✅ **Digit-Diff Highlights** — Visual comparison for changed numbers
   - Shows digit-by-digit diff for extreme changes (±40%)
   - Helps reviewers spot OCR errors quickly
   - Format: Old/New values with caret indicators

### Phase 2: Admin Console
5. ✅ **New `/club admin` Command** — Management tools for club analytics
   - `aliases view` — Show all member aliases for guild
   - `snapshots` — View last N snapshots with metadata
   - `rollback` — Rollback last commit (deletes snapshot, recomputes from previous)
   - `export` — Export full club data to CSV
   - Admin/club role permission checks on all subcommands

### Phase 3: Deep Stats & Insights
6. ✅ **Enhanced `/club stats`** — Cohort views and volatility
   - Cohort breakdown: new members vs returning veterans
   - Volatility leaderboard: top 5 most volatile members (by Total Power %)
   - Weekly boundary display from `CLUB_WEEKLY_BOUNDARY` env var
   - Member count summary in description

### Environment Variables Added
```bash
CLUB_USE_ENSEMBLE=0  # Enable two-model ensemble OCR (2x API cost)
CLUB_VISION_ENSEMBLE_A=gpt-4o-mini  # First model
CLUB_VISION_ENSEMBLE_B=gpt-4o  # Second model (tiebreaker)
CLUB_ROLE_ID=  # Optional role for club permissions
```

### Test Results
- **ESLint**: ✅ 0 errors
- **Syntax Checks**: ✅ All files valid
- **Command Loading**: ✅ club-admin, club-analyze, club-stats

### Commits (8 total)
```
c96a797 - feat(club): add two-model ensemble OCR with digit-level reconciliation
43d45cf - feat(club): require 100% coverage before commit (paranoid mode)
f305088 - feat(club): add second approver system for suspicious data
01cee40 - feat(club): add digit-diff highlights for changed numbers
46b888d - feat(club): add /club admin command with management tools
fe4963f - feat(club): add cohorts and volatility leaderboard to /club stats
99b14a2 - chore: add bulletproof features to .env.example
```

### What's Next
- User guide generation (Discord-ready blocks)
- Deploy commands with `npm run deploy`
- Production testing with real screenshots

---

## 2025-10-22 — Hygiene pass & weekly boundary parameterization
**Date:** 2025-10-22
**Status:** ✅ COMPLETED
**Branch:** chore/memory-audit-2025-10-12

### Summary
Full-codebase health pass completed. Fixed 7 critical hygiene issues, parameterized weekly club boundary to Friday 00:00 America/Detroit, and validated all slash commands in TEST_MODE.

### Changes Applied
1. ✅ **ESLint Configuration** — Fixed deprecated --ext flag, configured for CommonJS
2. ✅ **jscpd Script** — Corrected --gitignore flag syntax
3. ✅ **Missing Dependency** — Added undici as explicit dependency
4. ✅ **Weekly Boundary Config** — Added CLUB_WEEKLY_BOUNDARY environment variable
5. ✅ **Documentation Updates** — Updated DATABASE-SETUP.md and screenshot-to-sheet-mapping.md to reference Friday boundary
6. ✅ **Code Formatting** — Applied Prettier to all JavaScript files (245 files)

### Test Results
- **Slash Commands**: 33 tests, 31 PASS, 2 SKIP, 0 FAIL
- **Circular Dependencies**: ✅ None found
- **Missing Dependencies**: ✅ 0 (fixed undici)
- **Duplicate Code**: ✅ 0 exact clones

### Commits
```
c74943b - fix(hygiene): correct ESLint config for CommonJS project
a338d6b - fix(hygiene): correct jscpd script gitignore flag
743eec0 - fix(deps): add undici as explicit dependency
3b54c98 - feat(config): add CLUB_WEEKLY_BOUNDARY environment variable
6325e62 - docs: update weekly boundary to Friday America/Detroit in DATABASE-SETUP.md
2912517 - docs: update weekly boundary to Friday America/Detroit in screenshot-to-sheet-mapping.md
f41921a - style: apply Prettier formatting to JavaScript files
```

### Reports Generated
- `command-test-report.txt` (overwritten with latest results)
- `repo-hygiene-report.txt` (comprehensive summary)
- `auto-codex-test-run-2025-10-22.md` (detailed execution log)

---

## Session: Memory System Bugs Fixed + GPT-4 Vision Integration
**Date:** 2025-10-06
**Status:** ✅ PRODUCTION DEPLOYED

---

## 1. FIXED: Memory System Critical Bugs ✅

**STATUS:** ALL 5 BUGS FIXED - PRODUCTION READY
**Test Results:** 10/10 PASS (100%)

### Bug Fixes Applied

#### 🔴 Bug #1 (CRITICAL): Race Conditions in Concurrent Operations
- **Problem:** load() → modify → save() pattern not atomic
- **Fix:** Added proper-lockfile for atomic writes
- **Result:** No data loss under concurrent operations

#### 🔴 Bug #2 (CRITICAL): ID Collision Risk
- **Problem:** Date.now() + random could create duplicates
- **Fix:** Replaced with crypto.randomUUID()
- **Result:** Guaranteed unique IDs

#### 🔴 Bug #3 (CRITICAL): No File Locking for Multi-Instance
- **Problem:** Multiple bot instances could corrupt database
- **Fix:** Implemented proper-lockfile with retry logic
- **Result:** Multi-instance safe

#### ⚠️ Bug #4 (HIGH): Error Masking in load()
- **Problem:** Silent failures hiding corruption
- **Fix:** Added detailed error logging and recovery
- **Result:** Better diagnostics and auto-recovery

#### ⚠️ Bug #5 (MEDIUM): Misleading Async Functions
- **Problem:** Functions marked async but were synchronous
- **Fix:** Made save() truly async with proper await
- **Result:** Consistent async/await usage

### Files Changed
- `lib/memory.js` (complete rewrite with all fixes)
- `package.json` (added proper-lockfile@4.1.2)
- `tests/memory-simple.test.js` (new comprehensive test suite)

### New Dependencies
- `proper-lockfile@4.1.2` (file locking for atomic writes)

### Testing Results
- ✅ 10/10 automated tests pass
- ✅ Basic functionality verified
- ✅ Guild/DM isolation verified
- ✅ Concurrent operations handle safely
- ✅ No data loss or corruption
- ✅ Production database healthy (8 memos, 0 duplicates)

### Documentation Created
- `memory-bug-report.md` (bug analysis)
- `test-memory-manual.md` (manual test guide)
- `tests/memory-simple.test.js` (automated tests)
- `scripts/inspect-memory-db.sh` (database inspection)
- `lib/memory-diagnostics.js` (diagnostic logging)
- `memory-validation-checklist.md` (validation guide)
- `FIXES-APPLIED.md` (implementation report)

### Deployment
- ✅ Backward compatible (old IDs still work)
- ✅ No breaking changes
- ✅ Deployed: 2025-10-06 12:18:32
- ✅ Bot Status: Online and healthy
- ✅ Memory Module: FIXED VERSION active
- ✅ Test Results: 10/10 PASS (100%)
- ✅ Production Verified: All systems operational

---

## 2. NEW FEATURE: GPT-4 Vision Screenshot Analysis

### Overview
- Added GPT-4 Vision API integration for analyzing Super Snail screenshots
- Extracts all 9 stats automatically: HP, ATK, DEF, RUSH, FAME, TECH, ART, CIV, FTH
- Provides confidence ratings (high/medium/low) for extraction accuracy
- Auto-detects and analyzes screenshots in super_snail mode channels
- 10-second per-user cooldown to prevent API spam

### Implementation

#### Files Created
- `lib/vision.js` - Generic GPT-4 Vision wrapper with base64 conversion
- `lib/snail-vision.js` - Super Snail specific analyzer with JSON parsing
- `handlers/snail-auto-detect.js` - Auto-detection when images uploaded

#### Files Modified
- `commands/snail.js` - Added /snail analyze subcommand
- `index.js` - Lines 206-218, attached snail-auto-detect handler
- `.env` - Added VISION_MODEL=gpt-4-vision-preview
- `package.json` - Added node-fetch@2.7.0 dependency

### Usage
1. **Slash command:** `/snail analyze screenshot:[upload]`
2. **Auto-detect:** Enable super_snail mode, then upload any screenshot
3. Bot extracts stats and displays formatted results

### Cost Warning
- GPT-4 Vision costs ~$0.01-0.02 per image analysis
- Cooldown prevents accidental spam
- Only active in channels with super_snail mode enabled

### Testing
- ✅ lib/vision.js: Image URL to base64 conversion
- ✅ lib/snail-vision.js: JSON extraction and formatting
- ✅ handlers/snail-auto-detect.js: Auto-detection in super_snail channels
- ✅ commands/snail.js: /snail analyze subcommand
- ✅ Bot startup: All handlers attached successfully
- ✅ Existing /snail test and /snail calc still work

---

## 3. FIXED: Duplicate Command Loading

### Problem
- Commands were loading twice (once during deploy-commands.js, once during bot startup)
- Memory module and other lib files printed initialization messages twice
- Caused by index.js accidentally being in /commands folder on Pterodactyl

### Solution
- Added console output suppression in deploy-commands.js during command loading
- Prevents duplicate [memory] json-store ready and [dotenv] messages
- Removed index.js from commands directory (should only contain command files)

### Files Changed
- `deploy-commands.js` (lines 11-29)

---

## 4. FIXED: Image Generation in Mentions

### Problem
- Bot would say "I can't display images directly" when mentioned with image requests
- Invalid model name 'gpt-image-1' causing API errors
- System prompt didn't tell the AI it could generate images
- Missing explicit response_format parameter

### Solution
- Changed model from 'gpt-image-1' → 'dall-e-3'
- Added response_format: 'b64_json' to API calls
- Updated system prompt in persona.json to inform AI of image generation capability
- Added DALL-E 3 size support (1024x1024, 1024x1792, 1792x1024)
- Added logging to track image generation attempts

### Files Changed
- `lib/images.js` (lines 5, 8)
- `commands/image.js` (lines 15-21, 48-51)
- `config/slimy_ai.persona.json` (added "prompt" field)
- `lib/persona.js` (getPersona now accepts mode parameter, lines 23-44)
- `lib/auto-image.js` (added logging lines 8-10, 30-34)

### Testing
- ✅ Image intent detection works with API key
- ✅ Mention handler calls image generation

## 2025-10-22 — QA Suite
- Scripts: `refresh:commands`, `restart:bot`, `test:slash`, `qa:full`
- Auto test runner produces `command-test-report.txt`
- Manual checklist: `manual-tests-1022.txt`
- ✅ DALL-E 3 size options validated

---

## 5. FIXED: Memory.js listMemos Filter Bug

### Problem
- /export in guilds was returning both guild notes AND DM notes
- Filter condition incorrectly used (!m.guildId || m.guildId === ...)
- DM notes (guildId: null) leaked into guild exports

### Solution
Changed filter from:
```javascript
m.userId === userId && (!m.guildId || m.guildId === (guildId || null))
```

To strict equality:
```javascript
m.userId === userId && m.guildId === (guildId || null)
```

### Files Changed
- `lib/memory.js` (line 257)

### Validation
- ✅ Guild context: Returns only guild notes
- ✅ DM context: Returns only DM notes
- ✅ Delete operation: Works in correct scope
- ✅ Consent management: Unaffected
- ✅ All command flows tested end-to-end

---

## Git Commits

1. `810efc9` - Phase 1 complete: Fix memory persistence bugs, add /diag v2, add comprehensive test suite
2. `847f77f` - Add UPDATES.txt changelog for recent bug fixes
3. `6c0601a` - Fix: memory.js listMemos filter incorrectly including DM notes in guild queries
4. `8b04aa6` - Fix: duplicate command loading and enable image generation in mentions
5. `fe10947` - Add singleton guard to prevent duplicate bot instances

---

## Deployment Notes

### To Deploy These Fixes

1. **Pull latest changes on Pterodactyl server:**
   ```bash
   cd /home/container
   git pull
   ```

2. **Verify index.js is NOT in commands directory:**
   ```bash
   ls -la commands/
   # Should only show: chat.js, consent.js, diag.js, export.js, forget.js,
   #                   image.js, mode.js, remember.js, snail.js
   ```

3. **Restart the bot:**
   ```bash
   pm2 restart slimy-bot
   # OR on Pterodactyl: use the restart button in panel
   ```

4. **Test image generation:**
   ```
   @slimy.ai draw me a cat riding a skateboard
   ```

5. **Test memory commands:**
   ```
   /consent allow:true
   /remember note:"Test guild note"
   /export
   # Should only show guild notes, not DM notes
   ```

---

## 2025-02-15 — Club Analytics (Confirm-before-commit)

- New commands: `/club analyze` (with preview/QA/confirm) and `/club stats` (beautiful summary).
- Vision extraction with confidence + OCR-boost retry flow.
- Weekly WoW % change (Mon 00:00 UTC).
- Sheet: "Club Latest" ⇒ Name | SIM Power | Total Power | Change % from last week.
- Safety: compare against last week, flag missing names and suspicious jumps; manual fix modal; aliases table.

---

## Known Issues

None currently identified.

---

## Future Improvements

- Consider adding rate limiting for image generation
- Add cost tracking for OpenAI API usage
- Implement memory export as downloadable JSON file
- Add pagination for /export with >25 notes

---

**Generated with Claude Code**
