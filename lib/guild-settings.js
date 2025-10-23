const database = require("./database");
const logger = require("./logger");

function ensureDatabaseConfigured() {
  if (!database.isConfigured()) {
    throw new Error("Database is not configured for guild settings");
  }
}

function sanitizeKey(key) {
  return String(key || "").trim().toLowerCase();
}

function extractSheetId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const gidMatch = raw.match(/^docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (gidMatch?.[1]) {
    return gidMatch[1];
  }

  const simpleMatch = raw.match(/^([a-zA-Z0-9-_]{20,})$/);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  return null;
}

function normalizeSheetInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return { sheetId: null, url: null };
  }

  let sheetId = extractSheetId(trimmed);
  let url = null;

  if (/^https?:\/\//i.test(trimmed)) {
    url = trimmed;
  } else if (sheetId) {
    url = `https://docs.google.com/spreadsheets/d/${sheetId}`;
  }

  if (!sheetId && url) {
    sheetId = extractSheetId(url);
  }

  return { sheetId, url };
}

async function getGuildSettings(guildId) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const rows = await database.query(
    `SELECT key_name, value
       FROM guild_settings
       WHERE guild_id = ?`,
    [guildId],
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.key_name, row.value);
  }
  return map;
}

async function getGuildSetting(guildId, key) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const normalized = sanitizeKey(key);
  if (!normalized) throw new Error("key is required");
  const rows = await database.query(
    `SELECT value
       FROM guild_settings
       WHERE guild_id = ? AND key_name = ?
       LIMIT 1`,
    [guildId, normalized],
  );
  return rows[0]?.value ?? null;
}

async function setGuildSetting(guildId, key, value) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const normalized = sanitizeKey(key);
  if (!normalized) throw new Error("key is required");

  if (value === null || typeof value === "undefined" || value === "") {
    return clearGuildSetting(guildId, normalized);
  }

  await database.query(
    `INSERT INTO guild_settings (guild_id, key_name, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [guildId, normalized, String(value)],
  );
}

async function clearGuildSetting(guildId, key) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const normalized = sanitizeKey(key);
  if (!normalized) throw new Error("key is required");

  await database.query(
    `DELETE FROM guild_settings
       WHERE guild_id = ? AND key_name = ?`,
    [guildId, normalized],
  );
}

async function getSheetConfig(guildId) {
  const settings = await getGuildSettings(guildId);
  const storedUrl = settings.get("club_sheet_url") || null;
  const storedId = settings.get("club_sheet_id") || null;

  const envUrl = process.env.CLUB_SHEET_URL || null;
  const envId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.SHEETS_SPREADSHEET_ID ||
    null;

  let url = storedUrl || envUrl || null;
  let sheetId = storedId || envId || null;

  if (!sheetId && url) {
    sheetId = extractSheetId(url);
  }
  if (!url && sheetId) {
    url = `https://docs.google.com/spreadsheets/d/${sheetId}`;
  }

  logger.debug("[guild-settings] Resolved sheet config", {
    guildId,
    source: {
      stored: Boolean(storedId || storedUrl),
      env: Boolean(envId || envUrl),
    },
    sheetId: sheetId || null,
    url: url || null,
  });

  return { url: url || null, sheetId: sheetId || null };
}

async function setSheetConfig(guildId, { url, sheetId }) {
  await setGuildSetting(guildId, "club_sheet_url", url || "");
  if (sheetId) {
    await setGuildSetting(guildId, "club_sheet_id", sheetId);
  } else {
    await clearGuildSetting(guildId, "club_sheet_id");
  }
}

async function clearSheetConfig(guildId) {
  await clearGuildSetting(guildId, "club_sheet_url");
  await clearGuildSetting(guildId, "club_sheet_id");
}

module.exports = {
  extractSheetId,
  normalizeSheetInput,
  getGuildSetting,
  getGuildSettings,
  setGuildSetting,
  clearGuildSetting,
  getSheetConfig,
  setSheetConfig,
  clearSheetConfig,
};
