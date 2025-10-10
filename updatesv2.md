# Updates v2.1 — Google Sheets Automation

## Highlights
- `/snail analyze` now auto-provisions per-user spreadsheets, storing each `sheet_id` in `user_guilds` and recovering missing sheets on the fly.
- Added `SHEETS_PARENT_FOLDER_ID` environment variable alongside `GOOGLE_APPLICATION_CREDENTIALS` to direct new spreadsheets into a shared Drive folder.
- Expanded Sheets helper utilities to reuse Drive metadata, avoid duplicate files, and surface links in Discord responses.

## New Scripts
- `scripts/seed-sheets.js` generates Drive spreadsheets for every consenting user/guild pairing and updates `user_guilds.sheet_id`, with optional header seeding.
- `scripts/verify-sheets.js` spot-checks database rows with sheet IDs and appends a test marker to confirm Drive write access.
- Bundled a `run-all` bash helper that installs dependencies, normalises `.env`, seeds sheets, restarts the bot via PM2, and verifies append access end-to-end.

## Operational Notes
- Ensure the service account JSON sits at `./google-service-account.json` (or provide inline JSON) before running the seeding workflow.
- Grant the service account edit access to Drive folder `1ivR2dyxdQ1W3cNPOSKGYLdIceanJ5Epc` so `files.create` succeeds.
- Re-run `node scripts/seed-sheets.js` whenever new consent records appear to backfill spreadsheets safely.

## Validation
- `npm run test:memory`
- `node scripts/verify-sheets.js`

Stay slimy 🐌
