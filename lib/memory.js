// lib/memory.js
// SQLite-backed persistence for user prefs and memos.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const DB_PATH = path.join(process.cwd(), 'data.sqlite3');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS prefs (
  userId TEXT NOT NULL,
  guildId TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (userId, guildId, key)
);

CREATE TABLE IF NOT EXISTS memos (
  _id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  guildId TEXT,
  content TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memos_user ON memos(userId, guildId, createdAt DESC);
`);

const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
const setMeta = db.prepare(`INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
const MIGRATION_KEY = 'nedb_migrated_v1';

function parseNeDb(filePath) {
  const docs = [];
  if (!fs.existsSync(filePath)) return docs;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      docs.push(JSON.parse(trimmed));
    } catch (err) {
      console.warn(`[memory] Failed to parse ${filePath} line:`, err.message);
    }
  }
  return docs;
}

function migrateFromNeDb() {
  try {
    const already = getMeta.get(MIGRATION_KEY)?.value === '1';
    if (already) return;

    const prefsPath = path.join(process.cwd(), 'data_prefs.db');
    const memosPath = path.join(process.cwd(), 'data_memos.db');
    const prefDocs = parseNeDb(prefsPath);
    const memoDocs = parseNeDb(memosPath);

    if (prefDocs.length) {
      const insertPref = db.prepare(`
        INSERT INTO prefs(userId, guildId, key, value)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(userId, guildId, key) DO UPDATE SET value = excluded.value
      `);
      const insertPrefTx = db.transaction((rows) => {
        for (const doc of rows) {
          if (!doc) continue;
          const { userId, guildId = null, key, value } = doc;
          if (!userId || !key) continue;
          insertPref.run(String(userId), guildId == null ? null : String(guildId), String(key), value == null ? '' : String(value));
        }
      });
      insertPrefTx(prefDocs);
    }

    if (memoDocs.length) {
      const insertMemo = db.prepare(`
        INSERT OR IGNORE INTO memos(_id, userId, guildId, content, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertMemoTx = db.transaction((rows) => {
        for (const doc of rows) {
          if (!doc) continue;
          const { _id, userId, guildId = null, content, createdAt } = doc;
          if (!userId || !content) continue;
          const id = _id ? String(_id) : crypto.randomUUID();
          const ts = Number.isFinite(createdAt) ? createdAt : Date.now();
          insertMemo.run(id, String(userId), guildId == null ? null : String(guildId), String(content), ts);
        }
      });
      insertMemoTx(memoDocs);
    }

    setMeta.run(MIGRATION_KEY, '1');
  } catch (err) {
    console.warn('[memory] NeDB migration skipped:', err.message);
  }
}

migrateFromNeDb();

const normalizeGuildId = (guildId) => (guildId ? String(guildId) : null);

const setPrefStmt = db.prepare(`
  INSERT INTO prefs(userId, guildId, key, value)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(userId, guildId, key) DO UPDATE SET value = excluded.value
`);
const getPrefGlobalStmt = db.prepare('SELECT value FROM prefs WHERE userId = ? AND guildId IS NULL AND key = ?');
const getPrefGuildStmt = db.prepare('SELECT value FROM prefs WHERE userId = ? AND guildId = ? AND key = ?');
const insertMemoStmt = db.prepare(`
  INSERT INTO memos(_id, userId, guildId, content, createdAt)
  VALUES (?, ?, ?, ?, ?)
`);
const listMemosStmt = db.prepare(`
  SELECT _id, userId, guildId, content, createdAt
  FROM memos
  WHERE userId = ? AND (guildId IS NULL OR guildId = ?)
  ORDER BY createdAt DESC
  LIMIT ?
`);
const deleteMemoStmt = db.prepare('DELETE FROM memos WHERE _id = ? AND userId = ?');

module.exports = {
  async setConsent({ userId, guildId, allowed }) {
    const gid = normalizeGuildId(guildId);
    setPrefStmt.run(String(userId), gid, 'consent', allowed ? '1' : '0');
  },
  async getConsent({ userId, guildId }) {
    const gid = normalizeGuildId(guildId);
    const row = gid === null
      ? getPrefGlobalStmt.get(String(userId), 'consent')
      : getPrefGuildStmt.get(String(userId), gid, 'consent');
    if (row && row.value != null) return row.value === '1';
    return false;
  },
  async setMode({ userId, guildId, mode }) {
    const gid = normalizeGuildId(guildId);
    setPrefStmt.run(String(userId), gid, 'mode', mode);
  },
  async getMode({ userId, guildId }) {
    const gid = normalizeGuildId(guildId);
    const row = gid === null
      ? getPrefGlobalStmt.get(String(userId), 'mode')
      : getPrefGuildStmt.get(String(userId), gid, 'mode');
    return row?.value || null;
  },
  async addMemo({ userId, guildId, content }) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const gid = normalizeGuildId(guildId);
    insertMemoStmt.run(id, String(userId), gid, String(content), now);
  },
  async listMemos({ userId, guildId, limit = 25 }) {
    const gid = normalizeGuildId(guildId);
    const rows = listMemosStmt.all(String(userId), gid, Math.max(1, limit));
    return rows.map((row) => ({
      _id: row._id,
      userId: row.userId,
      guildId: row.guildId ?? null,
      content: row.content,
      createdAt: row.createdAt,
    }));
  },
  async deleteMemo({ id, userId }) {
    deleteMemoStmt.run(String(id), String(userId));
  }
};
