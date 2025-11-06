// lib/memory.js
const Datastore = require('@seald-io/nedb');
const path = require('path');

const prefs = new Datastore({
  filename: path.join(__dirname, '..', 'data_prefs.db'),
  autoload: true,
});

const memos = new Datastore({
  filename: path.join(__dirname, '..', 'data_memos.db'),
  autoload: true,
});

// Small helper promises; don't monkey-patch Datastore methods.
function findOneAsync(db, q) {
  return new Promise((res, rej) => db.findOne(q, (e, d) => e ? rej(e) : res(d)));
}
function updateAsync(db, q, u, o) {
  return new Promise((res, rej) =>
    db.update(q, u, { upsert: true, ...(o || {}) }, (e, num, docs) => e ? rej(e) : res({ num, docs }))
  );
}
function findAsync(db, q, opts) {
  return new Promise((res, rej) => {
    let cursor = db.find(q);
    if (opts?.sort) cursor = cursor.sort(opts.sort);
    if (opts?.limit) cursor = cursor.limit(opts.limit);
    cursor.exec((e, d) => e ? rej(e) : res(d));
  });
}
function removeAsync(db, q, opts) {
  return new Promise((res, rej) =>
    db.remove(q, opts || {}, (e, num) => e ? rej(e) : res(num))
  );
}

// Accept both the Phase-1 voice modes and the ops/admin style from earlier notes.
const VALID_MODES = [
  'mentor', 'partner', 'mirror', 'operator',
  'admin', 'personality', 'no_personality', 'super_snail'
];

function key(guildId, channelId) {
  return `mode:${guildId}:${channelId}`;
}

async function getMode(guildId, channelId) {
  const doc = await findOneAsync(prefs, { _id: key(guildId, channelId) });
  return doc?.value || null;
}

async function setMode(guildId, channelId, value) {
  if (!VALID_MODES.includes(value)) throw new Error(`invalid mode: ${value}`);
  await updateAsync(
    prefs,
    { _id: key(guildId, channelId) },
    { $set: { value, updatedAt: Date.now() } }
  );
  return value;
}

// Consent functions
function consentKey(userId, guildId) {
  return `consent:${userId}:${guildId || 'dm'}`;
}

async function getConsent({ userId, guildId }) {
  const doc = await findOneAsync(prefs, { _id: consentKey(userId, guildId) });
  return doc?.allowed || false;
}

async function setConsent({ userId, guildId, allowed }) {
  await updateAsync(
    prefs,
    { _id: consentKey(userId, guildId) },
    { $set: { allowed, updatedAt: Date.now() } }
  );
  return allowed;
}

// Memo functions
async function addMemo({ userId, guildId, content }) {
  const doc = {
    userId,
    guildId: guildId || null,
    content,
    createdAt: Date.now(),
  };
  return new Promise((res, rej) => {
    memos.insert(doc, (e, d) => e ? rej(e) : res(d));
  });
}

async function listMemos({ userId, guildId, limit = 25 }) {
  const query = {
    userId,
    guildId: guildId || null,
  };
  return findAsync(memos, query, { sort: { createdAt: -1 }, limit });
}

async function deleteMemo({ id, userId }) {
  const removed = await removeAsync(memos, { _id: id, userId }, {});
  return removed;
}

module.exports = {
  getMode,
  setMode,
  VALID_MODES,
  getConsent,
  setConsent,
  addMemo,
  listMemos,
  deleteMemo,
};

