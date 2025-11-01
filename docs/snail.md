# Snail Tools

- Uploads allow up to **8 images per run**, **10 MB** each.
- Analyze saves per-user results at `data/snail/<guildId>/<userId>/latest.json`.
- Analyze response now includes `results[].file.url`, `results[].uploadedBy`, and the normalized stats.
- Codes tab proxies to `SNELP_CODES_URL` with `scope=active|past7|all`, falling back to `data/codes/<guildId>.json`.
- Help tab focuses on screenshot best practices; Stats tab shows your latest personal snapshot.
- Snail API requires at least `member` role **and** guild membership (`requireGuildMember`).
