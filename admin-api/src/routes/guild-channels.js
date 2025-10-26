"use strict";
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const DISCORD_API = "https://discord.com/api/v10";

const router = express.Router();
router.use(requireAuth);

function overridesFile(gid){
  const dir = path.join(process.cwd(), "data", "channel-overrides");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${gid}.json`);
}

/** GET live channels from Discord (requires bot token) */
router.get("/:guildId/channels/live", async (req, res) => {
  try {
    const { guildId } = req.params;
    const bot = process.env.DISCORD_BOT_TOKEN;
    if (!bot) return res.status(200).json({ channels: [], note: "bot_token_missing" });

    const r = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${bot}` }
    });
    if (!r.ok) {
      const text = await r.text();
      console.warn("[channels/live] non-200:", r.status, text);
      return res.json({ channels: [], error: "discord_error" });
    }
    const data = await r.json();
    const channels = (data || [])
      .filter(c => c.type === 0) // text channels
      .map(c => ({ id: c.id, name: c.name }));
    res.json({ channels });
  } catch (err) {
    console.error("[channels/live] error", err);
    res.status(500).json({ error: "server_error" });
  }
});

/** GET overrides (manual list stored) */
router.get("/:guildId/channels", (req, res) => {
  const { guildId } = req.params;
  const f = overridesFile(guildId);
  if (!fs.existsSync(f)) return res.json({ overrides: [] });
  const overrides = JSON.parse(fs.readFileSync(f, "utf-8"));
  res.json({ overrides });
});

/** POST overrides (manual save) */
router.post("/:guildId/channels", express.json(), (req, res) => {
  const { guildId } = req.params;
  const items = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
  const cleaned = items.map(x => ({ id: String(x.id || ""), name: String(x.name || "") }))
                       .filter(x => x.id && x.name);
  fs.writeFileSync(overridesFile(guildId), JSON.stringify(cleaned, null, 2));
  res.json({ ok: true, overrides: cleaned });
});

module.exports = router;
