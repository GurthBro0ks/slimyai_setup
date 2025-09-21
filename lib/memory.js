// lib/memory.js
const Datastore = require('@seald-io/nedb');
const path = require('path');

const prefs = new Datastore({ filename: path.join(process.cwd(), 'data_prefs.db'), autoload: true });
const memos = new Datastore({ filename: path.join(process.cwd(), 'data_memos.db'), autoload: true });

// promise helpers
for (const ds of [prefs, memos]) {
  ds.findAsync = (q) => new Promise((res, rej) => ds.find(q, (e, d) => e ? rej(e) : res(d)));
  ds.findOneAsync = (q) => new Promise((res, rej) => ds.findOne(q, (e, d) => e ? rej(e) : res(d)));
  ds.updateAsync = (q, u, o) => new Promise((res, rej) => ds.update(q, u, o || {}, (e, n) => e ? rej(e) : res(n)));
  ds.insertAsync = (doc) => new Promise((res, rej) => ds.insert(doc, (e, d) => e ? rej(e) : res(d)));
  ds.removeAsync = (q, o) => new Promise((res, rej) => ds.remove(q, o || {}, (e, n) => e ? rej(e) : res(n)));
}

const key = (userId, guildId, k) => ({ userId, guildId: guildId || null, key: k });

module.exports = {
  async setConsent({ userId, guildId, allowed }) {
    await prefs.updateAsync(key(userId, guildId, 'consent'), { $set: { value: allowed ? '1' : '0' } }, { upsert: true });
  },
  async getConsent({ userId, guildId }) {
    const r = await prefs.findOneAsync(key(userId, guildId, 'consent'));
    return r?.value === '1';
  },
  async setMode({ userId, guildId, mode }) {
    await prefs.updateAsync(key(userId, guildId, 'mode'), { $set: { value: mode } }, { upsert: true });
  },
  async getMode({ userId, guildId }) {
    const r = await prefs.findOneAsync(key(userId, guildId, 'mode'));
    return r?.value || null;
  },
  async addMemo({ userId, guildId, content }) {
    await memos.insertAsync({ userId, guildId: guildId || null, content, createdAt: Date.now() });
  },
  async listMemos({ userId, guildId, limit = 25 }) {
    const rows = await memos.findAsync({ userId, $or: [{ guildId: null }, { guildId: guildId || null }] });
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return rows.slice(0, limit);
  },
  async deleteMemo({ id, userId }) {
    await memos.removeAsync({ _id: id, userId }, {});
  }
};

