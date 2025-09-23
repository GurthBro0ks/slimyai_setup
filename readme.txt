Slimy.ai Setup
==============

Version: 1.0.0 (see package.json)

Overview
--------
This workspace contains the Discord-native slimy.ai bot. It ships slash commands (e.g., `/chat`, `/mode`, `/remember`, `/forget`, `/export`) plus utility handlers and deployment scripts. The entrypoint is `index.js`, which loads `.env`, registers commands, and wires shared listeners such as the mention handler.

Recent Updates
--------------
- Migrated persistence to SQLite (`better-sqlite3`) via `lib/memory.js`, including an automatic one-time import from the legacy `data_*.db` NeDB snapshots.
- Updated the Phase 1 docs (`seed_about_channels.js`, `seed_more_channels.js`) so the documented command list matches the published `/chat` slash command.
- Adjusted ops tooling: `npm run preflight` now invokes `node supersnail-costs.js` directly to avoid Node 22 unicode-escape issues, and the mention handler sets `client.mentionHandlerReady` for accurate `/diag` reporting.

Testing
-------
Run `npm run preflight` before committing changes. This script checks for merge markers and ensures `supersnail-costs.js` loads without throwing.

Notes
-----
- Secrets are expected in `.env` (not committed).
- Runtime artifacts: `data.sqlite3` (new), `data_memos.db`, `data_prefs.db` (legacy), plus `supersnail-costs.js.bak.*` snapshots.
- See `AGENTS.md` for coding guidelines, deployment steps, and security considerations.
