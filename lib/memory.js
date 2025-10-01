// lib/memory.js — zero-dep JSON store (stable on Pterodactyl + local)
// Exports: setConsent, getConsent, setMode, getMode, addMemo, listMemos, deleteMemo

const fs = require("fs");
const path = require("path");
const FILE = path.join(process.cwd(), "data_store.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { prefs: [], memos: [] };
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
async function setMode({ userId, guildId, mode }) {
  const db = load();
  const k = prefKey(userId, guildId, "mode");
  const i = db.prefs.findIndex(
    (p) => p.userId === k.userId && p.guildId === k.guildId && p.key === "mode",
  );
  if (i >= 0) db.prefs[i].value = mode;
  else db.prefs.push({ ...k, value: mode });
  save(db);
}
async function getMode({ userId, guildId }) {
  const db = load();
  const k = prefKey(userId, guildId, "mode");
  const r = db.prefs.find(
    (p) => p.userId === k.userId && p.guildId === k.guildId && p.key === "mode",
  );
  return r?.value || null;
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
  setMode,
  getMode,
  addMemo,
  listMemos,
  deleteMemo,
};
