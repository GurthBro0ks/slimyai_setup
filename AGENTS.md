# Repository Guidelines

## Project Structure & Module Organization
`index.js` boots the Discord client, enforces singleton startup, and wires global utilities. Slash command handlers live in `commands/*.js` (e.g., `commands/snail.js`), while reactive listeners are in `handlers/` for mention and auto-detect flows. Shared services and integrations sit in `lib/`, including memory persistence (`lib/memory.js`), Google Sheets helpers, and OpenAI adapters. Operational scripts reside in `scripts/` for database migrations and sheet seeding, and persona configuration is versioned under `config/`. Tests, fixtures, and manual checklists are grouped in `tests/` alongside validation docs.

## Build, Test, and Development Commands
- `npm start` loads `.env`, connects to Discord, and starts the production bot.
- `npm run deploy` refreshes slash command definitions via `deploy-commands.js`.
- `npm run test:memory` exercises `tests/memory-simple.test.js` for datastore regressions.
- `npm run test:integration[:verbose|:force]` runs the Discord integration smoke test; provide valid tokens before use.
- `npm run test:personality` executes Node’s built-in test runner for persona scenarios.
For local DB validation or sheet seeding, run `node scripts/migrate-to-database.js` or `node scripts/seed-sheets.js` with the required `.env` values.

## Coding Style & Naming Conventions
Use Node.js ≥18 and CommonJS modules. Follow the prevailing two-space indentation, trailing semicolons, and single quotes in string literals. Prefer `camelCase` for functions and variables, `SCREAMING_SNAKE_CASE` for environment keys, and kebab-case filenames inside `handlers/` when the module encapsulates a feature (e.g., `snail-auto-detect`). Keep command exports consistent with Discord.js expectations (`data`, `execute`).

## Testing Guidelines
Place automated tests in `tests/` and name them `*.test.js` or `*-test.js` to match existing patterns. Fast feedback should come from `npm run test:memory`; run integration tests only after confirming Discord credentials in `.env`. When adding new flows, include harness helpers from `tests/test-helpers.js` and document manual scenarios in the adjacent markdown checklists. Capture command output for any non-trivial test run when sharing results.

## Commit & Pull Request Guidelines
Follow the repository’s history by writing imperative, topic-prefixed commit subjects (e.g., `Fix: reconcile duplicate command loads`, `Phase 2: expand vision coverage`). Limit body text to problem, approach, and test notes. Pull requests should summarize behavior changes, link associated issues or Trello cards, list relevant test commands, and attach screenshots or logs for Discord-facing features. Mention configuration updates (e.g., `.env` keys or Google service accounts) so deployers can replicate the setup.
