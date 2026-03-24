# Slimy.ai Club Analytics - User Guide (Discord Format)
**Generated:** 2025-10-22

This guide is formatted for Discord posting (~2000 char blocks). Copy each section and paste into your Discord server.

---

## Block 1: Overview & Getting Started

```
🐌 **Club Analytics System - Getting Started**

The club analytics system helps you track your Super Snail club's weekly progress using GPT-4 Vision to analyze "Manage Members" screenshots.

**Key Features:**
✅ Automated OCR of member stats (Sim Power + Total Power)
✅ Week-over-week comparison with % changes
✅ Quality assurance with coverage tracking
✅ Export to Google Sheets
✅ Admin tools for rollback and management

**Weekly Schedule:**
📅 **Upload Window:** Friday-Sunday
🔄 **Club Reset:** Friday 00:00 America/Detroit
📊 **Comparison Window:** Current week vs prior week (−8d to −6d)

**Required Permissions:**
• Administrator OR configured `CLUB_ROLE_ID`
• Access to club's "Manage Members" screens
```

---

## Block 2: Uploading Screenshots

```
📸 **How to Upload Screenshots**

**Step 1: Prepare Screenshots**
1. In Super Snail, navigate to Club → Manage Members
2. Take screenshots of member lists showing:
   - Either "Sim Power" tab OR "Power" (Total) tab
   - Member names clearly visible
   - Power values clearly visible
3. You can upload 1-10 screenshots per run

**Step 2: Run /club-analyze**
```
/club-analyze images:[attach files] type:[both/sim/power]
```

**Parameters:**
• `images` — Attach 1-10 screenshots (required)
• `type` — Which metrics are in your screenshots:
  - `both` — Screenshots contain both Sim + Total tabs
  - `sim` — Only Sim Power screenshots
  - `power` — Only Total Power screenshots
• `force_commit` — (Admins only) Skip preview, commit immediately

**Step 3: Review Preview**
The bot will show a preview with:
• Parsed members and values
• Missing members vs last week
• New members this week
• Suspicious changes (large WoW %)
• Low confidence OCR results
```

---

## Block 3: Quality Assurance

```
🛡️ **Quality Assurance Features**

**Coverage Guard (100% Requirement)**
• All last week's members MUST be present
• Shows coverage % in preview footer
• Blocks commit if coverage <100%
• Use manual fixes to add missing members OR force commit

**Second Approver System**
Requires 2 admin approvals when:
• Coverage <100% (any members missing)
• OR >5 members exceed ±40% WoW change

When triggered:
1. First admin clicks "Approve (1/2)"
2. Preview updates showing 1/2 approvals
3. Second admin clicks "Approve (2/2) & Commit"
4. Commit proceeds with audit trail

**Suspicious Changes**
• Flags members with large WoW % changes (default: ≥85%)
• Shows top movers in preview
• For extreme changes (±40%), shows digit-diff:
```
Old: 1234567
New: 1534567
     ^^
```
This helps spot OCR errors visually.

**Ensemble Mode (Optional)**
• Enable with `CLUB_USE_ENSEMBLE=1`
• Uses TWO models (gpt-4o-mini + gpt-4o)
• Cross-validates every digit
• More accurate but 2x API cost
```

---

## Block 4: Manual Fixes

```
🔧 **Manual Fixes**

If OCR misses members or gets values wrong, use the Manual Fix button.

**Format:**
```
PlayerName = 123456
PlayerName, sim = 654321
PlayerName, total = 999999
```

**Examples:**
```
Dragon Slayer = 1234567
Dark Knight, sim = 5555555
Phoenix Rising, total = 9876543
```

**How It Works:**
1. Click "📝 Manual Fix" button
2. Enter corrections (one per line)
3. Bot updates preview with your fixes
4. Review and approve

**Tips:**
• Player name must match approximately (fuzzy matching enabled)
• Values can have commas/spaces (they'll be stripped)
• If metric not specified (sim/total), bot infers from context
• Invalid lines are shown in error list
```

---

## Block 5: Admin Tools

```
⚙️ **Admin Console - /club-admin**

**View Snapshots**
```
/club-admin snapshots limit:10
```
Shows last N snapshots with:
• Snapshot ID and timestamp
• Who created it (<@userId>)
• Number of metrics stored

**View Aliases**
```
/club-admin aliases action:view
```
Lists all member name aliases currently mapped

**Rollback Last Commit**
```
/club-admin rollback
```
⚠️ **DANGEROUS** — Deletes last snapshot and restores previous state
• Cannot rollback if only one snapshot exists
• Recomputes `club_latest` from previous snapshot
• Use this to undo accidental commits

**Export to CSV**
```
/club-admin export
```
Downloads full club data as CSV with:
• Name, Canonical, SimPower, TotalPower
• Previous week values
• % change columns
```

---

## Block 6: Viewing Stats

```
📊 **Weekly Stats - /club-stats**

**Basic Usage:**
```
/club-stats metric:both top:10 format:embed
```

**Parameters:**
• `metric` — Which metrics to show:
  - `both` — Sim + Total (default)
  - `total` — Total Power only
  - `sim` — Sim Power only
• `top` — Number of gainers/losers to show (3-25)
• `format` — Output format:
  - `embed` — Discord embed (default)
  - `csv` — Download CSV file

**What You'll See:**
📈 **Aggregates:**
• Total members (new + returning)
• Total Power (sum)
• Average Power

📊 **Top Movers:**
• Top N gainers (WoW %)
• Top N losers (WoW %)
• Bar chart visualization
• Absolute change amounts

🔥 **Volatility Leaderboard:**
• Top 5 most volatile members
• Sorted by absolute % change

🔗 **Google Sheets Link:**
• Button to open live spreadsheet
• Synced automatically after commits
```

---

## Block 7: Troubleshooting

```
❓ **Troubleshooting Common Issues**

**"Database not configured"**
• Club analytics requires MySQL
• Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env
• Run database migrations: `migrations/2025-10-20-club.sql`

**"Coverage guard active: 80% coverage"**
• Some last week members are missing
• Options:
  1. Upload more screenshots to capture missing members
  2. Use manual fixes to add them
  3. Admin: use force_commit to override

**"OCR boost already run twice"**
• Re-parse button limited to 2 uses per session
• If still issues, cancel and create new session

**"Only administrators can approve commits"**
• Set CLUB_ROLE_ID to allow non-admin role
• Or grant Administrator permission

**"Session expired"**
• Sessions timeout after 15 minutes
• Upload screenshots again to start fresh

**Low confidence warnings**
• Retry with "🪄 Re-parse (OCR boost)" button
• Or use manual fixes to override
• Enable ensemble mode for higher accuracy

**Google Sheets not syncing**
• Check GOOGLE_SHEETS_SPREADSHEET_ID
• Verify service account has Editor access
• Check logs for pushLatest errors
```

---

## Block 8: Best Practices

```
✨ **Best Practices**

**Screenshot Quality:**
• Use high-resolution screenshots
• Ensure member names are clearly visible
• Avoid cropped or partial screens
• Screenshot each tab separately if using type:both

**Weekly Workflow:**
1. **Friday-Saturday:** Upload week's screenshots
2. **Review Preview:** Check coverage, suspicious changes
3. **Manual Fixes:** Correct any OCR errors
4. **Approve:** Get 2 admins if second approval required
5. **Verify:** Check /club-stats output and Google Sheet

**Accuracy Tips:**
• Enable ensemble mode for critical weeks (tournaments, etc.)
• Always review suspicious changes >40% WoW
• Use manual fixes liberally—better safe than sorry
• Keep snapshots—use rollback if needed

**Permission Setup:**
```bash
# In .env:
CLUB_ROLE_ID=1234567890  # Optional: allow non-admins
CLUB_USE_ENSEMBLE=1  # Optional: 2x cost, higher accuracy
```

**Questions?**
Check `/help` or report issues to bot maintainers.
```

---

**End of User Guide** • Generated 2025-10-22 • Slimy.ai Club Analytics v2.1
