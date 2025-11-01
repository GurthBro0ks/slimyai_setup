# Usage & Diagnostics

- `/api/diag` now returns request/image/chat counters and uptime (no secrets).
- `/api/diag/openai-usage` pings OpenAI `/usage` then `/models`, masking the key.
- The Usage page shows:
  - Quick metrics (requests, images, chat messages, uptime)
  - OpenAI diagnostics card (connectivity + masked key)
  - Cost charts from `/api/guilds/:guildId/usage`.
