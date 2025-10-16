# Slimy.AI Snail Workflow Update — 2025-10-16 (sequential capture)

## Summary
- Rebuilt `/snail analyze` around a single-image workflow with per-screenshot previews, explicit Save/Discard buttons, and short-lived pending state.
- Added `/snail stats` to stitch saved screenshots into a final report, persist the analysis, and close out the in-progress snapshot.
- Extended snapshot storage with guild scoping and `finalized_at` tracking, plus button routing so Discord component interactions reach the snail command.
- Updated user-facing guidance (`/snail analyze help`, README) to describe the new capture loop and stats handoff.

## Command & UX Changes
- `commands/snail.js`
  - Limits `/snail analyze` to one attachment, validates image type, and produces contextual previews (`Pentagon Stats`, `Loadout & Gear`, `Compass Relics`).
  - Stores pending previews in-memory (UUID + TTL) until the user presses **Save Screenshot Data** or **Discard**.
  - Implements `/snail stats` to gather all snapshot parts, generate the consolidated analysis text, save `snail_stats`, and mark the snapshot finalized.
  - Adds button handler exports used by the main interaction router.
- `index.js` now dispatches button interactions to the owning command via `handleButton`.

## Data & Persistence
- `lib/snapshots.js`
  - Auto-upgrades `account_snapshots` with `guild_id` and `finalized_at`.
  - Reuses existing unfinished snapshots per user/guild and exposes helpers to fetch parts or finalize a run.
- `README.md` documents the new sequential analyze flow and `snail stats`.

## Deployment
- Slash commands redeployed for the updated definitions: `node deploy-commands.js`.
- Bot restarted to load the new workflow: `docker compose restart bot`.

## Verification
- Manual verification only: no automated test suite (`npm test` is undefined). Interaction flow exercised via command deployment and container restart; bot reports healthy login afterwards.

## Known Follow-ups
- Persisting previews currently uses in-process memory; consider Redis if we need multi-instance resilience.
- Pending map TTL is 15 minutes—monitor for user feedback on premature expiry.
- Snapshot schema alteration relies on online `ALTER TABLE`; confirm migration completed on all environments.
