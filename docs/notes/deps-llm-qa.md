# Dependency Audit (axios / sharp / imghash)

Date: 2026-01-27

## Decision
Keep these dependencies in `/opt/slimy/app/package.json`.

## Why
- `axios` is required by `services/mcp-client.js` for MCP RPC calls.
- `sharp` is required by `/snail` and image utilities (`commands/snail.js`, `lib/*-extractor.js`).
- `imghash` is required by `lib/icon-hash.js` for perceptual hashing.

These are runtime dependencies for the bot features (not test-only).
