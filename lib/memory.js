// lib/memory.js
// Robust memory layer: prefers NeDB; falls back to a JSON file if NeDB isn't available.
// Works on Pterodactyl and local dev.

const path = require("path");
const fs = require("fs");

let Datastore = null;
try {
  Datastore = require("@seald-io/nedb");
  console.log("[memory] using NeDB");
} catch (e) {
  console.warn(
    "[memory] @seald-io/nedb not found, falling back to JSON file store",
  );
}

const FILE = path.join(process.cwd(), "data_store.json");

function loadFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { prefs: [], memos: [] };
  }
}
function saveFile(db) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("[memory] save error:", e);
  }
}

if (Datastore) {
  // --- NeDB implementation ---
  const prefs = new Datastore({
    filename: path.join(process.cwd(), "data_prefs.db"),
    autoload: true,
  });
  const memos = new Datastore({
    filename: path.join(process.cwd(), "data_memos.db"),
    autoload: true,
  });

  for (const ds of [prefs, memos]) {
    ds.findAsync = (q) =>
      new Promise((res, rej) => ds.find(q, (e, d) => (e ? rej(e) : res(d))));
    ds.findOneAsync = (q) =>
      new Promise((res, rej) => ds.findOne(q, (e, d) => (e ? rej(e) : res(d))));
    ds.updateAsync = (q, u, o) =>
      new Promise((res, rej) =>
        ds.update(q, u, o || {}, (e, n) => (e ? rej(e) : res(n))),
      );
    ds.insertAsync = (doc) =>
      new Promise((res, rej) =>
        ds.insert(doc, (e, d) => (e ? rej(e) : res(d))),
      );
    ds.removeAsync = (q, o) =>
      new Promise((res, rej) =>
        ds.remove(q, o || {}, (e, n) => (e ? rej(e) : res(n))),
      );
  }

  const key = (userId, guildId, k) => ({
    userId,
    guildId: guildId || null,
    key: k,
  });

  module.exports = {
    async setConsent({ userId, guildId, allowed }) {
      await prefs.updateAsync(
        key(userId, guildId, "consent"),
        { $set: { value: allowed ? "1" : "0" } },
        { upsert: true },
      );
    },
    async getConsent({ userId, guildId }) {
      const r = await prefs.findOneAsync(key(userId, guildId, "consent"));
      return r?.value === "1";
    },
    async setMode({ userId, guildId, mode }) {
      await prefs.updateAsync(
        key(userId, guildId, "mode"),
        { $set: { value: mode } },
        { upsert: true },
      );
    },
    async getMode({ userId, guildId }) {
      const r = await prefs.findOneAsync(key(userId, guildId, "mode"));
      return r?.value || null;
    },
    async addMemo({ userId, guildId, content }) {
      await memos.insertAsync({
        userId,
        guildId: guildId || null,
        content,
        createdAt: Date.now(),
      });
    },
    async listMemos({ userId, guildId, limit = 25 }) {
      const rows = await memos.findAsync({
        userId,
        $or: [{ guildId: null }, { guildId: guildId || null }],
      });
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return rows.slice(0, limit);
    },
    async deleteMemo({ id, userId }) {
      await memos.removeAsync({ _id: id, userId }, {});
    },
  };
} else {
  // --- JSON file fallback (no external deps) ---
  const idx = (arr, pred) => arr.findIndex(pred);
  const key = (userId, guildId, k) => ({
    userId,
    guildId: guildId || null,
    key: k,
  });

  module.exports = {
    async setConsent({ userId, guildId, allowed }) {
      const db = loadFile();
      const k = key(userId, guildId, "consent");
      const i = idx(
        db.prefs,
        (p) =>
          p.userId === k.userId &&
          p.guildId === k.guildId &&
          p.key === "consent",
      );
      if (i >= 0) db.prefs[i].value = allowed ? "1" : "0";
      else db.prefs.push({ ...k, value: allowed ? "1" : "0" });
      saveFile(db);
    },
    async getConsent({ userId, guildId }) {
      const db = loadFile();
      const k = key(userId, guildId, "consent");
      const r = db.prefs.find(
        (p) =>
          p.userId === k.userId &&
          p.guildId === k.guildId &&
          p.key === "consent",
      );
      return r?.value === "1";
    },
    async setMode({ userId, guildId, mode }) {
      const db = loadFile();
      const k = key(userId, guildId, "mode");
      const i = idx(
        db.prefs,
        (p) =>
          p.userId === k.userId && p.guildId === k.guildId && p.key === "mode",
      );
      if (i >= 0) db.prefs[i].value = mode;
      else db.prefs.push({ ...k, value: mode });
      saveFile(db);
    },
    async getMode({ userId, guildId }) {
      const db = loadFile();
      const k = key(userId, guildId, "mode");
      const r = db.prefs.find(
        (p) =>
          p.userId === k.userId && p.guildId === k.guildId && p.key === "mode",
      );
      return r?.value || null;
    },
    async addMemo({ userId, guildId, content }) {
      const db = loadFile();
      db.memos.push({
        _id: String(Date.now()) + Math.random().toString(36).slice(2),
        userId,
        guildId: guildId || null,
        content,
        createdAt: Date.now(),
      });
      saveFile(db);
    },
    async listMemos({ userId, guildId, limit = 25 }) {
      const db = loadFile();
      const rows = db.memos.filter(
        (m) =>
          m.userId === userId &&
          (!m.guildId || m.guildId === (guildId || null)),
      );
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return rows.slice(0, limit);
    },
    async deleteMemo({ id, userId }) {
      const db = loadFile();
      db.memos = db.memos.filter((m) => !(m._id === id && m.userId === userId));
      saveFile(db);
    },
  };
}
