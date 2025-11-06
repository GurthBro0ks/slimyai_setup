# Google Sheets Structure

This document captures the canonical layout of spreadsheets managed by Slimy.AI. Existing tabs for individual snail stats remain unchanged. Club analytics introduces a shared export tab.

## Club Latest (shared analytics tab)

- **Location:** Spreadsheet ID from `GOOGLE_SHEETS_SPREADSHEET_ID`
- **Tab name:** `Club Latest` (override via `GOOGLE_SHEETS_TAB_LATEST`)
- **Columns (A–D):**
  1. `Name`
  2. `SIM Power`
  3. `Total Power`
  4. `Change % from last week`

### Population rules

- `/club analyze` commits rewrite the entire tab each time.
- Rows are sorted by **Total Power DESC** with null totals pushed to the bottom.
- Numeric values are written as raw numbers; format the `%` column inside Sheets if you prefer percent formatting.
- Source data comes from `club_latest` immediately after `recomputeLatestForGuild`.

### Links

- `/club analyze` preview embeds include a sheet link for quick validation.
- `/club stats` adds a **"Open Sheet"** button pointing at the same spreadsheet ID.
