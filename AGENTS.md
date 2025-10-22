# Repository Guidelines

## Project Structure & Module Organization
- `index.js` boots the Discord client, health probes, and global schedulers. Treat it as the integration layer and keep it lean.
- `lib/` hosts core services (databases, logging, persona engine, vision utilities); mirror existing file boundaries when adding new capabilities.
- `handlers/` contains mention and vision entry points, while slash command payloads live under `commands/`.
- `scripts/` holds operational helpers (deploy, system-check, backups) and SQL migrations; use these for manual maintenance work.
- Assets are under `icons/` and long-term data sits in `backups/` and `var/`. Automated and manual specs reside in `tests/`.

## Build, Test, and Development Commands
- `npm install` — install Node 18+ dependencies; rerun after touching `package.json`.
- `npm start` — run the bot locally with the current `.env` configuration.
- `npm run deploy` — register slash commands (required whenever command definitions change).
- `npm run test:memory` — executes `tests/memory-simple.test.js` for regression coverage of the memory pipeline.
- `node scripts/system-check.sh` (bash) and `node scripts/db-test.js` help validate infrastructure dependencies before production pushes.
- `npm run analyze-test` — smoke-checks critical flows using `scripts/analyze-smoke.js`.

## Coding Style & Naming Conventions
- CommonJS modules, 2-space indentation, semicolons, and single quotes are standard; follow existing imports/exports and logging patterns.
- Use `camelCase` for functions/variables, `PascalCase` for classes, and `UPPER_SNAKE_CASE` for constants (see `lib/logger.js`).
- Keep configuration and persona schemas aligned with `config/slimy_ai.persona.json`; document any new mode keys in both JS and TS helpers.
- Prefer small, composable helpers within `lib/` and surface them through explicit exports to ease reuse.

## Testing Guidelines
- Place automated specs in `tests/` using the `*.test.js` suffix so they can be invoked directly with `node`.
- Mirror the structure of `memory-simple.test.js` when adding harness code; keep assertions isolated and reset in-memory caches between cases.
- Update `test-memory-flow.js` or related smoke runners when altering long-running workflows, and capture manual steps in `test-memory-manual.md`.
- Aim to cover new data stores or schedulers with deterministic fixtures; include sample payloads under `test_imgs/` if vision parsing is involved.

## Commit & Pull Request Guidelines
- Follow the existing git style: `feat: ...`, `fix: ...`, `chore: ...`, etc., using short imperative subjects plus optional scoped prefixes.
- Reference relevant scripts or configs in the body (e.g., “touches `lib/logger.js` logging levels”).
- PRs should outline the change, the validation (tests or manual runs), linked issues, and screenshots/log excerpts for user-facing updates.
- Flag breaking config changes prominently and note required environment variable or database migrations.

## Configuration & Operational Notes
- Secrets live in `.env` / `.env.db`; never commit real keys. Point contributors to the templates and list new variables there first.
- `docker-compose.yml` and `ecosystem.config.js` describe production process managers—keep them synchronized with new services.
- Any new external integration should ship with an update to `scripts/system-check.sh` or a comparable diagnostic to preserve operability.
