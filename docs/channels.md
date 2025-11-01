# Channels & Personas

- `/api/guilds/:guildId/channels` returns structured `categories` + `channels` (cached 60s, bot token required).
- Settings are stored under `data/settings/<guildId>.json` with shape:
  ```json
  {
    "screenshot_channel_id": "123",
    "personality": { "channelId": { ... } },
    "overrides": { "category": {}, "channel": {} }
  }
  ```
- UI flow: select category → channel, set "Use for screenshots", edit persona in slide-over and save via `PUT /api/guilds/:guildId/settings`.
- Persona payload supports `prompt`, `tone`, `temperature`, `safety` and canned presets.
