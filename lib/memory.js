// lib/memory.js — zero-dep JSON store (stable on Pterodactyl + local)
// Exports: consent + memo helpers, plus channel/category mode management

const fs = require("fs");
const path = require("path");
const FILE = path.join(process.cwd(), "data_store.json");

const MODE_KEYS = ["admin", "personality", "no_personality", "super_snail"];

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, "utf8"));
    db.prefs ||= [];
    db.memos ||= [];
    db.channelModes ||= [];
    return db;
  } catch {
    return { prefs: [], memos: [], channelModes: [] };
  }
}
function save(db) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("[memory] save error:", e);
  }
}
function prefKey(userId, guildId, key) {
  return { userId, guildId: guildId || null, key };
}

async function setConsent({ userId, guildId, allowed }) {
  const db = load();
  const k = prefKey(userId, guildId, "consent");
  const i = db.prefs.findIndex(
    (p) =>
      p.userId === k.userId && p.guildId === k.guildId && p.key === "consent",
  );
  if (i >= 0) db.prefs[i].value = allowed ? "1" : "0";
  else db.prefs.push({ ...k, value: allowed ? "1" : "0" });
  save(db);
}
async function getConsent({ userId, guildId }) {
  const db = load();
  const k = prefKey(userId, guildId, "consent");
  const r = db.prefs.find(
    (p) =>
      p.userId === k.userId && p.guildId === k.guildId && p.key === "consent",
  );
  return r?.value === "1";
}

function emptyModeState() {
  return MODE_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
}

function normalizeModeRecord(record) {
  return {
    guildId: record.guildId,
    targetId: record.targetId,
    targetType: record.targetType,
    modes: { ...emptyModeState(), ...(record.modes || {}) },
    updatedAt: record.updatedAt || Date.now(),
  };
}

async function setChannelMode({ guildId, targetId, targetType, mode, enabled }) {
  if (!guildId || !targetId || !targetType) {
    throw new Error("setChannelMode requires guildId, targetId, targetType");
  }
  if (!MODE_KEYS.includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const db = load();
  db.channelModes ||= [];
  const idx = db.channelModes.findIndex(
    (entry) =>
      entry.guildId === guildId &&
      entry.targetId === targetId &&
      entry.targetType === targetType,
  );

  if (idx === -1) {
    if (!enabled) return; // nothing to disable
    const modes = emptyModeState();
    modes[mode] = true;
    db.channelModes.push({
      guildId,
      targetId,
      targetType,
      modes,
      updatedAt: Date.now(),
    });
  } else {
    const entry = normalizeModeRecord(db.channelModes[idx]);
    entry.modes[mode] = !!enabled;
    entry.updatedAt = Date.now();
    if (MODE_KEYS.every((key) => entry.modes[key] === false)) {
      db.channelModes.splice(idx, 1);
    } else {
      db.channelModes[idx] = entry;
    }
  }

  save(db);
}

async function getChannelModes({ guildId, targetId, targetType }) {
  if (!guildId || !targetId) return emptyModeState();
  const db = load();
  db.channelModes ||= [];
  const entry = db.channelModes.find(
    (record) =>
      record.guildId === guildId &&
      record.targetId === targetId &&
      (!targetType || record.targetType === targetType),
  );
  return entry ? normalizeModeRecord(entry).modes : emptyModeState();
}

async function listChannelModes({ guildId }) {
  const db = load();
  db.channelModes ||= [];
  return db.channelModes
    .filter((entry) => entry.guildId === guildId)
    .map((entry) => normalizeModeRecord(entry));
}

async function addMemo({ userId, guildId, content }) {
  const db = load();
  db.memos.push({
    _id: String(Date.now()) + Math.random().toString(36).slice(2),
    userId,
    guildId: guildId || null,
    content,
    createdAt: Date.now(),
  });
  save(db);
}
async function listMemos({ userId, guildId, limit = 25 }) {
  const db = load();
  const rows = db.memos.filter(
    (m) =>
      m.userId === userId && (!m.guildId || m.guildId === (guildId || null)),
  );
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows.slice(0, limit);
}
async function deleteMemo({ id, userId }) {
  const db = load();
  db.memos = db.memos.filter((m) => !(m._id === id && m.userId === userId));
  save(db);
}

console.log("[memory] json-store ready:", FILE);
module.exports = {
  setConsent,
  getConsent,
  setChannelMode,
  getChannelModes,
  listChannelModes,
  addMemo,
  listMemos,
  deleteMemo,
};
