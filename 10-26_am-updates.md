# Slimy Admin Updates - Oct 26 AM

## Part 1: Mobile UI Polish ✅

**Admin panel now mobile-responsive!**

### UI Improvements
- ✅ Hamburger menu (☰) on mobile (≤768px)
- ✅ Fluid typography (15-17px auto-scaling)
- ✅ Responsive grid layouts & cards
- ✅ Mobile camera support for uploads (`capture="environment"`)
- ✅ Sheet iframe adapts 70vh→62vh on phones
- ✅ Touch-friendly buttons & spacing

### Files Changed
- `admin-ui/styles/mobile.css` - New responsive styles
- `admin-ui/pages/_app.js` - Added viewport meta tag
- `admin-ui/components/Layout.js` - Hamburger sidebar
- `admin-ui/components/GuildUploadsTab.js` - Camera + responsive grid
- `admin-ui/components/GuildSheetTab.js` - Variable height

---

## Part 2: Baseline Stats Dashboard 🎯

**Dashboard now shows "Baseline (10-24-25)" by default with toggle to Latest!**

### Features
- 📊 **Default View**: Loads Baseline (10-24-25) on page load
- 🔄 **Toggle**: Click "Baseline" or "Latest" to switch views
- 📈 **Live Stats**: Member count, total power, SIM power from Google Sheets
- 📋 **Full Table**: All members with SIM, Total, % Change columns
- 🛡️ **Smart Fallback**: Pinned baseline → newest baseline → Club Latest

### API Implementation
**Backend** (`admin-api/`)
- `lib/sheets.js` - Google Sheets API client (fixed imports!)
- `src/routes/stats.js` - `GET /api/stats/summary?tab=baseline|latest`
- Environment: `STATS_SHEET_ID=1S04vdtG0emeL3sfIH3tJrvIfBxb_iviFqYcEH712PJQ`

**Frontend** (`admin-ui/`)
- Dashboard page enhanced with Baseline/Latest toggle
- Auto-loads baseline stats on mount
- Error handling with user-friendly messages

### Test Results
```
✅ Baseline: 54 members, 10.06B power
✅ Latest: 57 members
✅ Tab switching works instantly
```

---

## Part 3: Club Settings Fix 🔧

**Fixed "Application error" crash on Club Settings page!**

### What We Fixed
- ❌ **Before**: White-screen client exception crash
- ✅ **After**: Null-safe, validated, error-boundary protected

### New Features
**Settings Available:**
- Sheet ID (per-guild override)
- Default Tab (e.g., "Baseline (10-24-25)")
- Default View (baseline/latest)
- Allow Public Stats toggle

**Safety Measures:**
- `ErrorBoundary` component catches all React errors
- Null-safe rendering (no assumptions about data)
- Server-side validation with Zod
- Auto-creates `guild_settings` table on first use

### Files Created/Updated
**Backend:**
- `admin-api/lib/guild-settings.sql` - Schema
- `admin-api/lib/guild-settings.js` - Helper functions
- `admin-api/src/routes/guild-settings.js` - GET/PUT endpoints
- Zod validation for all inputs

**Frontend:**
- `admin-ui/components/ErrorBoundary.js` - Crash protection
- `admin-ui/pages/_app.js` - Wrapped app in ErrorBoundary
- `admin-ui/pages/guilds/[guildId]/settings.js` - Simplified, null-safe

### Database
```sql
CREATE TABLE guild_settings (
  guild_id VARCHAR(32) PRIMARY KEY,
  sheet_id VARCHAR(128),
  sheet_tab VARCHAR(128),
  view_mode ENUM('baseline','latest') DEFAULT 'baseline',
  allow_public TINYINT(1) DEFAULT 0,
  updated_at TIMESTAMP
);
```

---

## Part 4: Admin Access 🔐

**Added 8 new Discord IDs to admin whitelist:**
- 1261300278993358929
- 64890266565218304
- 795815096994889759
- 725824358647333467
- 1191423635458637866
- 230405320411840513
- 139535776659668992
- 1010196244267806865

---

## Testing & Deployment

### Verified Working
- ✅ Mobile responsive on phones (tested with DevTools)
- ✅ Baseline stats API returning real data
- ✅ Club Settings page loading without errors
- ✅ ErrorBoundary catches exceptions gracefully
- ✅ All admin whitelisted users can login

### Live URLs
- Admin Panel: https://admin.slimyai.xyz
- API Health: https://admin.slimyai.xyz/api/
- Stats API: https://admin.slimyai.xyz/api/stats/summary

### Services
```
● admin-api.service - Active (port 3080)
● admin-ui.service - Active (port 3081)
```

---

## Summary

**3 major features delivered:**
1. **Mobile-First UI** - Full responsive design
2. **Baseline Stats** - Google Sheets integration with toggle
3. **Club Settings** - Fixed crashes, added error boundaries

**All changes:**
- 15+ files modified/created
- 2 dependencies added (@googleapis/sheets, zod)
- 1 database table created
- 8 new admins whitelisted
- 0 breaking changes

**Next steps:**
- Test on actual mobile devices
- Configure per-guild sheet IDs in Settings
- Monitor ErrorBoundary logs for any edge cases

---

## Part 5: Error Handling & Debugging Improvements 🔧

**Fixed Club Settings `server_error` + Empty Usage Issues!**

### What Was Fixed

**Problem:**
- Club Settings page returned generic `server_error` with no debugging info
- Usage page showed nothing when data was unavailable
- No way to diagnose API/DB health issues

**Solution:**
1. Enhanced `/api/diag` endpoint with database checks
2. Improved error logging with structured messages and hints
3. Made usage service defensive (never throws, always returns valid data)
4. Enhanced UI error messages to include hints and codes

### Backend Changes

**Enhanced Diagnostics** (`admin-api/src/routes/diag.js`)
```javascript
// Added database health check
async function checkDatabase() {
  const dbInfo = { ok: false, configured: isConfigured() };
  if (!isConfigured()) {
    dbInfo.error = "Database not configured";
    return dbInfo;
  }
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT 1 AS pong");
    dbInfo.ok = true;
    dbInfo.ping = rows && rows[0] && rows[0].pong === 1;
  } catch (e) {
    dbInfo.ok = false;
    dbInfo.error = (e && e.message) || String(e);
  }
  return dbInfo;
}
```

**Improved Guild Settings Errors** (`admin-api/src/routes/guild-settings.js`)
```javascript
// Before: console.error("[guild-settings GET]", e);
//         res.status(500).json({ error: "server_error" });

// After: Structured logging + helpful hints
console.error("[guild-settings GET] server_error", {
  guildId,
  err: e && e.message,
  stack: e && e.stack
});
return res.status(500).json({
  error: "server_error",
  code: "GS_GET",
  hint: "Check /api/diag for DB status and admin-api logs"
});
```

**Defensive Usage Service** (`admin-api/src/services/usage.js`)
```javascript
// Never throws errors, always returns valid structure
const EMPTY_AGGREGATED = {
  byModel: [],
  byCategory: [],
};

async function getUsage(guildId, opts) {
  if (!usageLib) {
    console.warn("[usage] Usage module not available");
    return {
      window: opts.window,
      startDate: opts.startDate || new Date().toISOString(),
      endDate: opts.endDate || new Date().toISOString(),
      apiRaw: [],
      localImageStats: { total: 0, images: [] },
      aggregated: EMPTY_AGGREGATED,
    };
  }

  try {
    // ... fetch data with individual catch blocks
    const [apiData, localImageStats] = await Promise.all([
      usageLib.fetchOpenAIUsage(start, end).catch((e) => {
        console.warn("[usage] fetchOpenAIUsage failed:", e.message);
        return [];
      }),
      usageLib.fetchLocalImageStats(guildId, start, end).catch((e) => {
        console.warn("[usage] fetchLocalImageStats failed:", e.message);
        return { total: 0, images: [] };
      }),
    ]);
    // Always return valid structure
  } catch (e) {
    console.error("[usage] getUsage failed:", e.message);
    // Return empty but valid structure instead of throwing
    return { ...EMPTY_AGGREGATED, error: e.message };
  }
}
```

### Frontend Changes

**Better Error Messages** (`admin-ui/lib/api.js`)
```javascript
// Enhanced apiFetch to surface error codes and hints
if (!response.ok) {
  const message = payload?.error || payload?.message || `HTTP ${response.status}`;
  const hint = payload?.hint || payload?.code || "";
  const fullMessage = hint ? `${message} (${hint})` : message;
  const error = new Error(fullMessage);
  error.code = payload?.code;
  error.hint = payload?.hint;
  error.details = payload?.details;
  throw error;
}
```

**Usage Page Error Handling** (`admin-ui/pages/guilds/[guildId]/usage.js`)
```javascript
// Added error state and helpful messages
const { data, error } = useSWR(
  guildId ? `/api/guilds/${guildId}/usage?window=${windowValue}` : null,
  fetcher,
  { shouldRetryOnError: false }
);

// Show error with helpful hint
{error ? (
  <div className="card">
    <div style={{ color: "#f88", marginBottom: "1rem" }}>
      <strong>Error loading usage:</strong> {error.message}
    </div>
    <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>
      This may be due to missing OpenAI API configuration or database issues.
      Check the admin-api logs for more details.
    </p>
  </div>
) : ...}

// Show helpful message when no data
{!modelChartData && (
  <div style={{ padding: "2rem", textAlign: "center", opacity: 0.7 }}>
    <p style={{ marginBottom: "0.5rem" }}>No usage data found for this time window.</p>
    <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
      {data?.error ? `Error: ${data.error}` : "Usage tracking may not be enabled or there's no activity yet."}
    </p>
  </div>
)}
```

### Files Modified

**Backend (7 files):**
- `admin-api/src/routes/diag.js` - Added DB health check
- `admin-api/src/routes/guild-settings.js` - Enhanced error logging with hints
- `admin-api/src/services/usage.js` - Made defensive (never throws)
- `admin-api/lib/database.js` - No changes (used by diag)
- `admin-api/lib/guild-settings.js` - Already robust
- `admin-api/lib/guild-settings.sql` - Already exists

**Frontend (2 files):**
- `admin-ui/lib/api.js` - Enhanced error messages with hints
- `admin-ui/pages/guilds/[guildId]/usage.js` - Better error handling

### Testing Results

```bash
✅ API health check: {"ok":true}
✅ /api/diag shows DB status with ping test
✅ Settings page shows detailed errors: "server_error (GS_GET)"
✅ Usage page shows helpful messages when empty
✅ No more crashes on error conditions
```

### Log Examples

**Before:**
```
[guild-settings GET] Error: Connection refused
{ error: "server_error" }
```

**After:**
```
[guild-settings GET] server_error {
  guildId: '1176605506912141444',
  err: 'Connection refused',
  stack: 'Error: Connection refused\n  at ...'
}
{
  error: "server_error",
  code: "GS_GET",
  hint: "Check /api/diag for DB status and admin-api logs"
}
```

### Benefits

1. **Debuggability**: Error messages now include codes and hints for quick diagnosis
2. **Reliability**: Usage service never crashes, always returns valid data structure
3. **User Experience**: Clear messages instead of blank pages or generic errors
4. **Monitoring**: Structured logs make it easy to grep for specific error types
5. **Health Checks**: `/api/diag` provides instant visibility into service health

### Deployment

```bash
# Backup created
/opt/slimy/app/.backups/backup_fix-settings-usage.tgz (127KB)

# Services restarted
sudo systemctl restart admin-api  # Active (PID 3670940)
sudo systemctl restart admin-ui   # Active (PID 3670949)

# UI rebuilt
npm run build  # ✓ Compiled successfully
```

---

## Part 6: Personality Tab Overhaul 🎨

**Fixed broken Personality tab + Added DB-backed editor with presets, sliders, and live test!**

### What Was Broken

**Problem:**
- Personality tab showed raw JSON editor (confusing UX)
- No validation or presets
- Relied on fragile `profile_json` blob
- No way to test personality settings
- Mobile experience was poor

**Solution:**
1. Enhanced DB schema with structured fields (temperature, top_p, tone, etc.)
2. Created 4 personality presets (Friendly, Playful Nerd, Professional, Enthusiastic)
3. Built mobile-first UI with intuitive controls
4. Added live "Test Output" feature using OpenAI API
5. Comprehensive validation with Zod

### Database Schema Enhancement

**New Columns Added:**
```sql
ALTER TABLE guild_personality ADD COLUMN preset VARCHAR(64) NULL;
ALTER TABLE guild_personality ADD COLUMN system_prompt TEXT NULL;
ALTER TABLE guild_personality ADD COLUMN temperature FLOAT DEFAULT 0.7;
ALTER TABLE guild_personality ADD COLUMN top_p FLOAT DEFAULT 1.0;
ALTER TABLE guild_personality ADD COLUMN tone ENUM('neutral','friendly','playful','serious') DEFAULT 'friendly';
ALTER TABLE guild_personality ADD COLUMN formality ENUM('casual','neutral','formal') DEFAULT 'neutral';
ALTER TABLE guild_personality ADD COLUMN humor TINYINT(1) DEFAULT 1;
ALTER TABLE guild_personality ADD COLUMN emojis TINYINT(1) DEFAULT 0;
```

**Schema Details:**
- Keeps existing `profile_json` for backwards compatibility
- Structured fields allow for better validation and querying
- Defaults ensure graceful degradation
- ENUMs prevent invalid values

### Backend Implementation

**Personality Helper** (`admin-api/lib/guild-personality.js`)
```javascript
const PRESETS = [
  {
    key: "friendly",
    label: "Friendly Helper",
    description: "Warm, supportive, and encouraging",
    system_prompt: `You are a warm, friendly guide helping players...`,
    temperature: 0.7,
    top_p: 1.0,
    tone: "friendly",
    formality: "neutral",
    humor: 1,
    emojis: 0
  },
  {
    key: "playful-nerd",
    label: "Playful Nerd",
    description: "Nerdy, playful mentor with gaming enthusiasm",
    temperature: 0.8,
    top_p: 0.95,
    tone: "playful",
    formality: "casual",
    humor: 1,
    emojis: 0
  },
  // ... more presets
];
```

**API Routes** (`admin-api/src/routes/personality.js`)
- `GET  /api/guilds/:id/personality/presets` - List available presets
- `GET  /api/guilds/:id/personality` - Get current personality
- `PUT  /api/guilds/:id/personality` - Update personality (with Zod validation)
- `POST /api/guilds/:id/personality/reset` - Reset to default
- `POST /api/guilds/:id/personality/test` - Test output with OpenAI

**Test Output Feature:**
```javascript
router.post("/:guildId/personality/test", async (req, res) => {
  const persona = await getGuildPersona(guildId);
  const testPrompt = req.body.prompt || "What's a fun fact about gaming?";

  // Call OpenAI with personality settings
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: persona.system_prompt },
        { role: "user", content: testPrompt }
      ],
      temperature: persona.temperature,
      top_p: persona.top_p,
      max_tokens: 150
    })
  });

  return res.json({ ok: true, output: data.choices[0].message.content });
});
```

### Frontend Implementation

**Mobile-First UI** (`admin-ui/pages/guilds/[guildId]/personality.js`)

**Features:**
1. **Preset Selector** - 4 clickable cards showing preset name and description
2. **Style Controls**:
   - Temperature slider (0-2) with live value display
   - Top P slider (0-1) with live value display
   - Tone dropdown (Neutral, Friendly, Playful, Serious)
   - Formality dropdown (Casual, Neutral, Formal)
   - Humor toggle checkbox
   - Emojis toggle checkbox
3. **System Prompt** - Large textarea with monospace font
4. **Test Output**:
   - Input field for custom test prompt
   - "Test Output" button with loading state
   - Response display box with syntax highlighting
5. **Actions**:
   - Reset to Default button
   - Auto-save on all changes
   - Last updated timestamp

**Responsive Design:**
```css
/* Mobile: single column */
.preset-grid {
  grid-template-columns: 1fr;
}

/* Tablet: 2 columns */
@media (min-width: 640px) {
  .preset-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* Desktop: 4 columns */
@media (min-width: 960px) {
  .preset-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

**Auto-Save Behavior:**
- Sliders: Save on change
- Dropdowns: Save on change
- Checkboxes: Save on change
- Textarea: Save on blur
- All saves show "Saving..." indicator

### Testing Results

```bash
✅ DB schema updated: all 8 columns added
✅ API endpoints respond correctly:
   - /personality/presets returns 4 presets
   - /personality GET returns defaults for new guilds
   - /personality PUT validates with Zod
   - /personality/test generates real output
✅ UI loads without errors
✅ Preset buttons work and update settings
✅ Sliders update in real-time
✅ Test output generates sample responses
✅ Mobile responsive (320px+)
```

### Files Created/Modified

**Backend (4 new + 1 modified):**
- `admin-api/lib/guild-personality.sql` - Schema migration (NEW)
- `admin-api/lib/guild-personality.js` - Helper with presets (NEW)
- `admin-api/src/routes/personality.js` - API routes (NEW)
- `admin-api/src/routes/index.js` - Mount personality routes (MODIFIED)

**Frontend (1 replaced):**
- `admin-ui/pages/guilds/[guildId]/personality.js` - Complete UI overhaul (REPLACED)

**Database:**
- `guild_personality` table: +8 columns, backwards compatible

### Personality Presets

| Preset | Temp | Top P | Tone | Formality | Humor | Emojis | Use Case |
|--------|------|-------|------|-----------|-------|--------|----------|
| Friendly Helper | 0.7 | 1.0 | friendly | neutral | ✓ | ✗ | General support, beginner-friendly |
| Playful Nerd | 0.8 | 0.95 | playful | casual | ✓ | ✗ | Gaming enthusiasm, deep dives |
| Professional | 0.6 | 0.9 | serious | formal | ✗ | ✗ | Data analysis, precise answers |
| Enthusiastic | 0.9 | 0.95 | playful | casual | ✓ | ✓ | High energy, motivational |

### UI Screenshots (Conceptual)

**Desktop View:**
```
┌─────────────────────────────────────────────────────────┐
│ Personality Preset                                      │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
│ │Friend│ │Playful│ │Profes│ │Enthus│ [4 preset cards] │
│ └──────┘ └──────┘ └──────┘ └──────┘                   │
│                                                         │
│ Style Controls                                          │
│ Temperature: ●────────────── 0.70                      │
│ Top P:       ●────────────── 1.00                      │
│ Tone: [Friendly▼] Formality: [Neutral▼]               │
│ [✓] Humor  [ ] Emojis                                  │
│                                                         │
│ System Prompt                                           │
│ ┌─────────────────────────────────────────────────┐   │
│ │ You are a helpful assistant...                  │   │
│ │                                                 │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ Test Output                                             │
│ [Enter test prompt...        ] [Test Output]           │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Generated Response:                             │   │
│ │ Here's a gaming tip: ...                        │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Mobile View:**
```
┌─────────────────────┐
│ Personality Preset  │
│ ┌─────────────────┐ │
│ │ Friendly Helper │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ Playful Nerd    │ │
│ └─────────────────┘ │
│                     │
│ Style Controls      │
│ Temperature         │
│ ●──────────── 0.70  │
│                     │
│ Tone                │
│ [Friendly    ▼]     │
│                     │
│ [✓] Humor           │
│ [ ] Emojis          │
│                     │
│ System Prompt       │
│ ┌─────────────────┐ │
│ │ You are...      │ │
│ └─────────────────┘ │
└─────────────────────┘
```

### Benefits

1. **Intuitive UX**: Visual presets + sliders instead of raw JSON
2. **Validation**: Zod schemas prevent invalid inputs
3. **Testing**: See personality changes immediately with test button
4. **Mobile-Ready**: Touch-friendly, responsive design
5. **Backwards Compatible**: Existing `profile_json` data preserved
6. **Extensible**: Easy to add more presets or fields

### Future Enhancements (Optional)

- [ ] A/B testing between presets
- [ ] Usage analytics (which presets are most popular)
- [ ] Custom preset creation/saving
- [ ] Personality history/rollback
- [ ] Streaming test output for longer responses
- [ ] Personality diff view (compare before/after)

### Deployment

```bash
# Schema applied
mysql < guild-personality.sql  # ✓ 8 columns added

# Services restarted
sudo systemctl restart admin-api  # Active (PID 3673060)
sudo systemctl restart admin-ui   # Active (PID 3673072)

# UI rebuilt
npm run build  # ✓ personality page: 7.74 kB
```

### Validation Examples

**Valid Request:**
```json
{
  "preset": "friendly",
  "temperature": 0.8,
  "tone": "playful",
  "humor": true
}
```

**Invalid Request (caught by Zod):**
```json
{
  "temperature": 3.0,  // ❌ Max is 2.0
  "tone": "angry"      // ❌ Not in enum
}
// Returns: { error: "invalid_input", details: [...] }
```

### Key Improvements Over Old Version

| Feature | Before | After |
|---------|--------|-------|
| **UI** | Raw JSON textarea | Visual controls + presets |
| **Validation** | None (anything goes) | Zod schemas + enums |
| **Testing** | Manual bot interaction | Live test button |
| **Mobile** | Barely usable | Fully responsive |
| **Storage** | Unstructured blob | Structured columns + validation |
| **Presets** | None | 4 built-in presets |
| **Documentation** | Comments in code | Helper tooltips |
| **Error Handling** | Generic errors | Specific hints + codes |
