// lib/memory.js
// Minimal, safe promise helpers for prefs/modes (no monkey-patching)

const Datastore = require('@seald-io/nedb');
const path = require('path');

// one small DB for prefs/modes
const prefs = new Datastore({
  filename: path.join(__dirname, '..', 'data_prefs.db'),
  autoload: true,
});

// Promise helpers (note: do NOT assign onto prefs; keep functions separate)
const findOne = (q) =>
  new Promise((resolve, reject) =>
    prefs.findOne(q, (err, doc) => (err ? reject(err) : resolve(doc)))
  );

const update = (q, u, o = {}) =>
  new Promise((resolve, reject) =>
    prefs.update(q, u, o, (err, n) => (err ? reject(err) : resolve(n)))
  );

// Mode API
const MODE_KEY = (channelId) => `mode:${channelId}`;
const ALLOWED_MODES = new Set(['mentor', 'partner', 'mirror', 'operator']); // Phase-1

async function getMode(channelId) {
  const doc = await findOne({ _id: MODE_KEY(channelId) });
  return doc?.value ?? null;
}

async function setMode(channelId, value) {
  if (!ALLOWED_MODES.has(value)) {
    throw new Error(`invalid mode: ${value}`);
  }
  await update(
    { _id: MODE_KEY(channelId) },
    { $set: { value, updatedAt: Date.now() } },
    { upsert: true, multi: false }
  );
  return value;
}

module.exports = {
  getMode,
  setMode,
  // exposed for diagnostics/tests if needed
  _db: prefs,
  _allowed: [...ALLOWED_MODES],
};

