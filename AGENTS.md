# Repository Guidelines

## Project Structure & Module Organization
- `index.js` loads `.env`, registers slash commands from `commands/`, and wires the mention handler.
- `commands/` contains one CommonJS module per slash command (`chat`, `snail`, `consent`, etc.), each exporting `{ data, execute }` for the loader and `deploy-commands.js`.
- Shared listeners live in `handlers/`, while `lib/` carries persistence (`memory.js`) and API helpers (`openai.js`).
- Ops scripts (`run_slimy.sh`, `setup_roles_and_structure.js`, `perms_*.js`, `seed_*.js`) manage guild setup and deployment chores.
- NeDB state (`data_memos.db`, `data_prefs.db`) and `supersnail-costs*.js` backups are runtime artefacts—keep them local and back up before edits.

## Build, Test, and Development Commands
- `npm install` (Node 18+) installs deps; use `npm ci` for automation.
- `npm run start` launches the bot locally with your `.env`.
- `npm run deploy` re-registers slash metadata for `DISCORD_CLIENT_ID`/`DISCORD_GUILD_ID`; run after command changes.
- `npm run preflight` aborts on merge markers and smoke-tests `supersnail-costs.js`.
- `./run_slimy.sh` checks secrets (`SNAIL_SHEET_ID`, `SNAIL_GID`), installs deps, redeploys commands, and restarts PM2 for production.

## Coding Style & Naming Conventions
- CommonJS, two-space indentation, semicolons, and `const` by default; rely on `async`/`await` around Discord or OpenAI calls.
- Command filenames mirror the slash name (`chat.js`, `snail.js`); move reusable helpers into `lib/`.
- Default to ephemeral replies (`flags: 64`) when user data is involved and reuse the `✅`/`❌` feedback tone.
- No auto-linter runs; keep UTF-8/LF files and self-check formatting.

## Testing Guidelines
- No automated suite: run `npm run preflight` and manual drills in a staging guild.
- Extend `/snail test`-style fixtures for new calculators and confirm `/chat` keeps the “Where we left off → Next step.” suffix.
- When persistence changes, copy or reset `data_*.db`, validate `/export` and `/forget`, and capture the steps in your PR.

## Commit & Pull Request Guidelines
- Write imperative, scoped commits (e.g., `Adjust snail tier caps`) and keep secrets or artefacts out of diffs.
- Reference Discord threads or tickets when helpful, and highlight schema, permission, or env changes in the PR body.
- Include a Testing section listing commands or scripts executed (`npm run preflight`, `/snail test`, `./run_slimy.sh`).

## Security & Configuration Tips
- `.env` must provide `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `OPENAI_API_KEY`, plus snail sheet IDs for calculator sync.
- Keep `tokens.txt`, `google-service-account.json`, NeDB databases, and `.bak` snapshots out of git; extend `.gitignore` for new secrets.
- Scrub user IDs and memo contents before sharing logs, and delete stale `supersnail-costs.js.bak.*` copies after validation.
