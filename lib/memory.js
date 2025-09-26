// lib/memory.js
const Datastore = require('@seald-io/nedb');
const path = require('path');

const prefs = new Datastore({
  filename: path.join(__dirname, '..', 'data_prefs.db'),
  autoload: true,
});

// Small helper promises; don't monkey-patch Datastore methods.
function findOneAsync(q) {
  return new Promise((res, rej) => prefs.findOne(q, (e, d) => e ? rej(e) : res(d)));
}
function updateAsync(q, u, o) {
  return new Promise((res, rej) =>
    prefs.update(q, u, { upsert: true, ...(o || {}) }, (e, num, docs) => e ? rej(e) : res({ num, docs }))
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
  const doc = await findOneAsync({ _id: key(guildId, channelId) });
  return doc?.value || null;
}

async function setMode(guildId, channelId, value) {
  if (!VALID_MODES.includes(value)) throw new Error(`invalid mode: ${value}`);
  await updateAsync(
    { _id: key(guildId, channelId) },
    { $set: { value, updatedAt: Date.now() } }
  );
  return value;
}

module.exports = { getMode, setMode, VALID_MODES };

