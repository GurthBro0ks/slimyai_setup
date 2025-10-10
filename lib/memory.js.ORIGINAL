// lib/memory.js — zero-dep JSON store (stable on Pterodactyl + local)
// Exports: consent + memo helpers, plus channel/category mode management

const fs = require("fs");
const path = require("path");
const FILE = path.join(process.cwd(), "data_store.json");

const MODE_KEYS = [
  "admin",
  "chat",
  "personality",
  "no_personality",
  "super_snail",
];
const MODE_SET = new Set(MODE_KEYS);

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
/**
 * Atomic save using temp file + rename to prevent corruption
 * If process crashes during write, original file remains intact
 */
function save(db) {
  const tempFile = FILE + '.tmp';
  try {
    // Write to temp file first
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
    // Atomic rename (POSIX guarantees atomicity)
    fs.renameSync(tempFile, FILE);
  } catch (e) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    console.error("[memory] save error:", e);
    throw e; // Propagate error to caller
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

function findModeIndex(db, guildId, targetId, targetType) {
  return db.channelModes.findIndex(
    (entry) =>
      entry.guildId === guildId &&
      entry.targetId === targetId &&
      entry.targetType === targetType,
  );
}

function sanitizeModes(modes = []) {
  if (Array.isArray(modes)) {
    const seen = new Set();
    return modes
      .map((m) => String(m || '').toLowerCase().trim())
      .filter((m) => {
        if (!m || !MODE_SET.has(m) || seen.has(m)) return false;
        seen.add(m);
        return true;
      });
  }
  if (typeof modes === 'string') {
    return sanitizeModes(modes.split(/[,\s]+/));
  }
  return [];
}

function applyOperation(entry, modes, operation) {
  const record = normalizeModeRecord(entry || {});
  const modeList = sanitizeModes(modes);
  if (!operation || operation === 'merge') {
    for (const mode of modeList) record.modes[mode] = true;
    return record;
  }
  if (operation === 'remove') {
    for (const mode of modeList) record.modes[mode] = false;
    return record;
  }
  if (operation === 'replace') {
    const blank = emptyModeState();
    for (const mode of modeList) blank[mode] = true;
    return { ...record, modes: blank };
  }
  throw new Error(`Unknown operation: ${operation}`);
}

async function patchChannelModes({
  guildId,
  targetId,
  targetType,
  modes,
  operation = 'merge',
}) {
  if (!guildId || !targetId || !targetType) {
    throw new Error('patchChannelModes requires guildId, targetId, targetType');
  }

  const db = load();
  db.channelModes ||= [];
  const idx = findModeIndex(db, guildId, targetId, targetType);
  const modeList = sanitizeModes(modes);

  if (!modeList.length && operation !== 'replace') {
    return getChannelModes({ guildId, targetId, targetType });
  }

  if (idx === -1) {
    const entry = applyOperation(
      {
        guildId,
        targetId,
        targetType,
        modes: emptyModeState(),
      },
      modeList,
      operation,
    );
    if (MODE_KEYS.every((key) => entry.modes[key] === false)) {
      save(db);
      return emptyModeState();
    }
    entry.updatedAt = Date.now();
    db.channelModes.push(entry);
    save(db);
    return entry.modes;
  }

  const entry = applyOperation(db.channelModes[idx], modeList, operation);
  entry.updatedAt = Date.now();
  if (MODE_KEYS.every((key) => entry.modes[key] === false)) {
    db.channelModes.splice(idx, 1);
  } else {
    db.channelModes[idx] = entry;
  }
  save(db);
  return entry.modes;
}

async function setChannelMode({ guildId, targetId, targetType, mode, enabled }) {
  console.warn('[memory] setChannelMode is deprecated; use patchChannelModes instead.');
  const operation = enabled ? 'merge' : 'remove';
  return patchChannelModes({ guildId, targetId, targetType, modes: [mode], operation });
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

async function clearChannelModes({ guildId, targetId, targetType }) {
  return patchChannelModes({ guildId, targetId, targetType, modes: [], operation: 'replace' });
}

async function listChannelModes({ guildId }) {
  const db = load();
  db.channelModes ||= [];
  return db.channelModes
    .filter((entry) => entry.guildId === guildId)
    .map((entry) => normalizeModeRecord(entry));
}

async function getEffectiveModes({ guildId, channelId, parentId }) {
  if (!guildId) return emptyModeState();
  const db = load();
  db.channelModes ||= [];
  const result = emptyModeState();

  const apply = (entry) => {
    if (!entry) return;
    const normalized = normalizeModeRecord(entry);
    for (const key of MODE_KEYS) {
      if (normalized.modes[key]) result[key] = true;
    }
  };

  if (parentId) {
    const categoryEntry = db.channelModes.find(
      (record) =>
        record.guildId === guildId &&
        record.targetId === parentId &&
        record.targetType === 'category',
    );
    apply(categoryEntry);
  }

  if (channelId) {
    const channelEntry = db.channelModes.find(
      (record) =>
        record.guildId === guildId &&
        record.targetId === channelId &&
        record.targetType === 'channel',
    );
    apply(channelEntry);
  }

  return result;
}

/**
 * Add a memo and return the created object
 * @returns {Object} The created memo with _id, userId, guildId, content, createdAt
 * @throws {Error} If save fails
 */
async function addMemo({ userId, guildId, content }) {
  const db = load();
  const memo = {
    _id: String(Date.now()) + Math.random().toString(36).slice(2),
    userId,
    guildId: guildId || null,
    content,
    createdAt: Date.now(),
  };
  db.memos.push(memo);
  save(db); // Will throw on failure

  // Validate the memo was actually saved
  const reloaded = load();
  const found = reloaded.memos.find(m => m._id === memo._id);
  if (!found) {
    throw new Error('Memo was not persisted correctly');
  }

  return memo;
}
async function listMemos({ userId, guildId, limit = 25 }) {
  const db = load();
  const rows = db.memos.filter(
    (m) =>
      m.userId === userId && m.guildId === (guildId || null),
  );
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows.slice(0, limit);
}
/**
 * Delete a memo by ID (must match userId for security)
 * @returns {boolean} True if memo was found and deleted, false otherwise
 * @throws {Error} If save fails
 */
async function deleteMemo({ id, userId }) {
  const db = load();
  const initialCount = db.memos.length;
  db.memos = db.memos.filter((m) => !(m._id === id && m.userId === userId));
  const deleted = db.memos.length < initialCount;

  if (deleted) {
    save(db); // Will throw on failure

    // Validate the memo was actually deleted
    const reloaded = load();
    const stillExists = reloaded.memos.find(m => m._id === id);
    if (stillExists) {
      throw new Error('Memo was not deleted correctly');
    }
  }

  return deleted;
}

console.log("[memory] json-store ready:", FILE);
module.exports = {
  setConsent,
  getConsent,
  setChannelMode,
  patchChannelModes,
  getChannelModes,
  clearChannelModes,
  listChannelModes,
  getEffectiveModes,
  addMemo,
  listMemos,
  deleteMemo,
};
