"use strict";
const path = require("path");
const fs = require("fs");
const { query, getPool } = require("./database");

async function ensureTable() {
  const sql = fs.readFileSync(path.join(__dirname, "guild-settings.sql"), "utf8");
  await query(sql);
}

const DEFAULTS = (guildId) => ({
  guild_id: guildId,
  sheet_id: process.env.STATS_SHEET_ID || null,
  sheet_tab: process.env.STATS_BASELINE_TITLE || "Baseline (10-24-25)",
  view_mode: "baseline",
  allow_public: 0,
  screenshot_channel_id: null,
  uploads_enabled: 1,
  notes: null,
});

async function getGuildSettings(guildId) {
  await ensureTable();
  const rows = await query("SELECT * FROM guild_settings WHERE guild_id = ? LIMIT 1", [guildId]);
  if (!rows.length) return DEFAULTS(guildId);
  // Normalize types
  const r = rows[0];
  r.allow_public = Number(r.allow_public) ? 1 : 0;
  r.uploads_enabled = Number(r.uploads_enabled) ? 1 : 0;
  return r;
}

async function upsertGuildSettings(guildId, patch) {
  await ensureTable();
  const curr = await getGuildSettings(guildId);
  const next = {
    ...curr,
    ...patch,
    guild_id: guildId,
  };
  const sql = `
    INSERT INTO guild_settings (guild_id, sheet_id, sheet_tab, view_mode, allow_public, screenshot_channel_id, uploads_enabled, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      sheet_id = VALUES(sheet_id),
      sheet_tab = VALUES(sheet_tab),
      view_mode = VALUES(view_mode),
      allow_public = VALUES(allow_public),
      screenshot_channel_id = VALUES(screenshot_channel_id),
      uploads_enabled = VALUES(uploads_enabled),
      notes = VALUES(notes)
  `;
  await query(sql, [
    next.guild_id,
    next.sheet_id || null,
    next.sheet_tab || null,
    next.view_mode || "baseline",
    Number(next.allow_public) ? 1 : 0,
    next.screenshot_channel_id || null,
    Number(next.uploads_enabled) ? 1 : 0,
    next.notes || null,
  ]);
  return next;
}

module.exports = { getGuildSettings, upsertGuildSettings, DEFAULTS };
