# Repository Guidelines

## Project Structure & Module Organization
`index.js` loads `.env`, registers every slash command from `commands/`, and wires the mention handler. Each module in `commands/` should export `{ data, execute }` so `deploy-commands.js` and the loader stay in sync. Shared Discord listeners belong in `handlers/`, while persistence helpers such as `memory.js` and API adapters like `openai.js` live under `lib/`. Deployment and setup chores use the root ops scripts (`run_slimy.sh`, `setup_roles_and_structure.js`, `perms_*.js`, `seed_*.js`). Treat NeDB stores (`data_memos.db`, `data_prefs.db`) and `supersnail-costs*.js` backups as runtime artefacts: back them up locally before touching prod files.

## Build, Test, and Development Commands
- `npm install` installs dependencies (Node 18+); prefer `npm ci` in automation.
- `npm run start` boots the bot with the current `.env` for local validation.
- `npm run deploy` re-registers slash metadata for `DISCORD_CLIENT_ID`/`DISCORD_GUILD_ID`; run after editing anything in `commands/`.
- `npm run preflight` checks for merge markers and smoke-tests `supersnail-costs.js`.
- `./run_slimy.sh` validates sheet secrets, installs deps, redeploys, and restarts PM2 in production.

## Coding Style & Naming Conventions
Stick to CommonJS modules, two-space indentation, semicolons, and `const` unless mutation is required. Name command files after the slash trigger (`commands/snail.js`), move reusable helpers into `lib/`, and default interaction replies involving user details to `flags: 64` with the established `✅/❌` tone. No linter is bundled—format manually and keep files UTF-8 with LF endings.

## Testing Guidelines
There is no automated suite beyond `npm run preflight`; supplement it with manual slash command drills in a staging guild. Extend `/snail test` fixtures when changing calculators, and confirm `/chat` responses retain the “Where we left off → Next step.” suffix. When altering persistence, duplicate or reset `data_*.db`, validate `/export` and `/forget`, and document the path taken.

## Commit & Pull Request Guidelines
Write imperative, scoped commits (e.g., `Adjust snail tier caps`) and keep secrets or artefacts out of diffs. In pull requests, link the relevant Discord thread or ticket, call out schema, permission, or env changes, and include a Testing section listing commands run (`npm run preflight`, `/snail test`, `./run_slimy.sh`).

## Security & Configuration Tips
`.env` must provide `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `OPENAI_API_KEY`, plus the snail sheet IDs used by `supersnail-sheets.js`. Keep `tokens.txt`, `google-service-account.json`, NeDB databases, and `.bak` snapshots out of git; extend `.gitignore` for any new secrets. Scrub user IDs before sharing logs and prune obsolete `supersnail-costs.js.bak.*` files after confirming latest changes.
