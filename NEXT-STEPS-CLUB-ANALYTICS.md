# Club Analytics - Next Steps

## ✅ COMPLETED (2025-10-23)

### 1. Admin `/usage` Command
- OpenAI usage tracking with cost calculation
- gpt-4o-mini token costs + DALL-E 3 image costs
- Time windows: today, 7d, 30d, this_month, custom
- **Status**: ✅ Deployed and working

### 2. TPM Budget System
- 2,000,000 TPM budget with token tracking
- 429 backoff with Retry-After header support
- Exponential backoff (1.5x, cap 60s)
- **Status**: ✅ Deployed and working

### 3. Week Anchor Utilities
- Default: Friday 04:30 America/Los_Angeles
- Week ID format: YYYY-Www
- Integrated into `/club-stats` footer
- **Status**: ✅ Deployed and working

### 4. Headless Scripts
- `scripts/ingest-club-screenshots.js` - headless ingest pipeline
- `scripts/verify-club-stats.js` - verification with thresholds
- `scripts/quick-sum.js` - quick health checks
- `scripts/post-stats-to-channel.js` - Discord posting
- **Status**: ✅ All working

### 5. Smart Thresholds (NEW)
- `lib/thresholds.js` with resolver and formatCompact()
- Priority: DB → per-guild env → default env → fallback
- Default: 1.0B - 50.0B (was 1B - 30B)
- `verify-club-stats.js`: --strict, --warn-low, --warn-high flags
- Shows top 5 members, compact notation
- **Status**: ✅ Committed (a5cd116)

---

## 🔴 REMAINING WORK (Not Yet Implemented)

### A. Number Parsing Anti-Inflation
**Priority**: HIGH - Prevents data corruption from OCR errors

**Requirements**:
- Create `lib/numparse.js` with `parsePower(rawText)` function
- Handle OCR confusions: O→0, l→1, I→1
- Support suffix forms: 10.1B, 325M, 1.5K
- Support thousands grouping: 218,010,208
- **Anti-inflation heuristics**:
  - Detect extra digits: "2180102088" → 218010208 (mark `corrected:true`)
  - Invalid grouping: "1,234,5678" → 1,234,567
  - Outlier detection: >8x median with grouping errors
- Unit tests required
- Integration: Replace all ad-hoc parsing in `lib/club-vision.js`

**Impact**: Currently numbers may be inflated by OCR errors (extra trailing digits)

### B. SIM Power Capture
**Priority**: HIGH - Required for complete metrics

**Requirements**:
1. **Page Classifier** (`lib/club-vision.js`):
   - Add `classifyPage(image)` → `{type:"sim"|"total"|"unknown"}`
   - OCR anchors: detect "Sim Power" vs "Power"
   - Filename hints: `sim-` prefix forces sim type

2. **Database Schema Changes**:
   ```sql
   -- Add member_key to club_latest (normalized name)
   ALTER TABLE club_latest ADD COLUMN member_key VARCHAR(120) NOT NULL AFTER guild_id;
   ALTER TABLE club_latest ADD UNIQUE KEY (guild_id, member_key);

   -- Add member_key to club_metrics
   ALTER TABLE club_metrics ADD COLUMN member_key VARCHAR(120) AFTER member_id;
   ALTER TABLE club_metrics ADD UNIQUE KEY (guild_id, snapshot_id, member_key, metric);

   -- Add sim_power to club_latest (if not exists)
   -- Already exists, verify it's being populated
   ```

3. **Metric Parser** (`lib/club-store.js`):
   - Emit `{member_key, display_name, value, metric}` where metric ∈ {"sim","total"}
   - member_key: normalized (lowercase, strip emojis, collapse spaces)
   - UPSERT with `value = GREATEST(existing.value, incoming.value)`

4. **Recompute Logic** (`lib/club-store.js`):
   - Union of all member_keys for current week
   - One row per member with both metrics:
     ```
     total_power = MAX(value WHERE metric='total')
     sim_power = MAX(value WHERE metric='sim')
     ```

5. **Sheet Writer** (`lib/club-sheets.js`):
   - Columns: Name | SIM Power | Total Power | Change %
   - Sort by Total desc
   - Leave SIM blank if null

### C. Member Cap Guard
**Priority**: MEDIUM - Prevents duplicate commits

**Requirements**:
- Parse header: "Manage Members **54/54**" → `cap_hint=54`
- Before commit: if `COUNT(DISTINCT member_key) > cap_hint + 1` → block
- Preview note: "Parsed 58 members > cap 54. Likely duplicates."
- Force commit available for admins

### D. SQL Sanity Checks
**Priority**: LOW - Diagnostic improvements

**Requirements** (add to `verify-club-stats.js`):
```sql
-- One row per member check
SELECT COUNT(*) rows, COUNT(DISTINCT member_key) members
FROM club_latest WHERE guild_id=?;

-- Members with duplicate rows (should be 0)
SELECT member_key, COUNT(*) c
FROM club_latest WHERE guild_id=?
GROUP BY member_key HAVING c>1;

-- Sim power coverage
SELECT COUNT(*) FROM club_latest
WHERE guild_id=? AND sim_power IS NOT NULL;

-- Week scope
SELECT DISTINCT week_id FROM club_latest
WHERE guild_id=? ORDER BY week_id DESC;
```

### E. Environment Variable Updates
**Priority**: LOW - Documentation

Add to `.env.example` or `tests/.env.example`:
```bash
# Verification thresholds
VERIFY_WARN_LOW_DEFAULT=1000000000      # 1.0B
VERIFY_WARN_HIGH_DEFAULT=50000000000    # 50.0B

# Per-guild overrides (example)
VERIFY_WARN_HIGH_1176605506912141444=60000000000
VERIFY_WARN_LOW_1176605506912141444=500000000
```

### F. Optional: DB-Based Threshold Overrides
**Priority**: LOW - Nice to have

**Requirements**:
- Use existing `guild_settings` table
- Keys: `warn_total_low`, `warn_total_high`
- Add `/club-admin verify-thresholds low:<num> high:<num>` command
- Priority already coded in `lib/thresholds.js`

---

## 📊 Current State Summary

**Guild 1176605506912141444 Analysis**:
```
Members: 57
Sum(total_power): 36,242,661,232 (36.24B)
Sum(sim_power): 0 (0)
Average: 635,836,162 (635.84M)
Top Member: DavoGato (2.10B)
```

**Issues**:
1. ✅ Thresholds were too low (30B max) - **FIXED** (now 50B)
2. ❌ SIM power not captured - **NEEDS IMPLEMENTATION**
3. ❌ No protection against OCR number inflation - **NEEDS IMPLEMENTATION**
4. ❌ member_key not used (using member_id) - **NEEDS IMPLEMENTATION**

**No Data Quality Issues Found**:
- ✅ No duplicate members in club_latest
- ✅ No duplicate metrics in snapshots
- ✅ Totals sum correctly
- ✅ Top 5 members show realistic power values

---

## 🎯 Recommended Implementation Order

1. **lib/numparse.js** (anti-inflation) - Prevents bad data from entering system
2. **Page classifier** (sim vs total) - Required for SIM capture
3. **Database schema updates** (member_key) - Foundation for one-row-per-member
4. **Recompute logic** (union + one row) - Core functionality
5. **Sheet writer** (both columns) - User-visible output
6. **Member cap guard** - Safety check
7. **SQL sanity checks** - Verification improvements

**Estimated Effort**: 4-6 hours for full implementation + testing

---

## 🧪 Testing Strategy

After implementing remaining features:

```bash
export GUILD_ID="1176605506912141444"

# 1. Dry run to see classification and parsing
node scripts/ingest-club-screenshots.js --guild "$GUILD_ID" \
  --dir "/opt/slimy/app/screenshots/test" --type both --dry --debug

# 2. Commit + verify
node scripts/ingest-club-screenshots.js --guild "$GUILD_ID" \
  --dir "/opt/slimy/app/screenshots/test" --type both --commit

# 3. Verify results
npm run verify:stats

# 4. Check database
mysql -h 127.0.0.1 -u root -pPAw5zMUt slimy_ai_bot <<EOF
SELECT COUNT(*) rows, COUNT(DISTINCT member_key) members,
       SUM(total_power) total, SUM(sim_power) sim
FROM club_latest WHERE guild_id='1176605506912141444';
EOF
```

**Expected After Full Implementation**:
- ≈54 members (±1 for roster changes)
- No duplicate member_keys
- SIM power populated for ~3-6 members (from sim-test*.png)
- Google Sheet shows both SIM and Total columns
- Single week_id in club_latest
- Number parsing prevents inflation

---

## 📝 Commits Made (2025-10-23)

1. `8b4a5d9` - feat(usage): admin /usage with cost math
2. `f37d504` - chore(openai): raise TPM to 2,000,000
3. `7c6aae7` - feat(week): anchor utils + Fri 04:30 PT
4. `49e16c3` - docs: README/UPDATES/help
5. `57858be` - feat(scripts): add quick-sum.js
6. `36fe990` - feat(scripts): add headless ingest + verify + post-stats
7. `a5cd116` - feat(thresholds): shared resolver + compact formatter

**Total**: 7 commits, ~2000 lines of new/modified code
