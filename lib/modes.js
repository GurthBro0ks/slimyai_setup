const fs = require('fs');
const path = require('path');

const MODE_KEYS = [
  'admin',
  'chat',
  'personality',
  'no_personality',
  'super_snail',
  'rating_unrated',
  'rating_pg13',
];
const PRIMARY_MODES = ['admin', 'chat', 'super_snail'];
const OPTIONAL_MODES = ['personality', 'no_personality'];
const RATING_MODES = ['rating_unrated', 'rating_pg13'];

const STORE_PATH = path.join(process.cwd(), 'data_store.json');

const TARGET_TYPES = new Set(['category', 'channel', 'thread']);

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.channelModes ||= [];
    return parsed;
  } catch {
    return { channelModes: [] };
  }
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function emptyState() {
  const state = {};
  for (const key of MODE_KEYS) state[key] = false;
  return state;
}

function normalize(record) {
  if (!record) return null;
  return {
    guildId: record.guildId,
    targetId: record.targetId,
    targetType: record.targetType,
    modes: { ...emptyState(), ...(record.modes || {}) },
    updatedAt: record.updatedAt || Date.now(),
  };
}

function ensureAdmin(hasManageGuild) {
  if (!hasManageGuild) {
    throw new Error('Manage Guild permission required.');
  }
}

function uniqueModes(modes) {
  const seen = new Set();
  const result = [];
  for (const mode of modes || []) {
    if (MODE_KEYS.includes(mode) && !seen.has(mode)) {
      seen.add(mode);
      result.push(mode);
    }
  }
  return result;
}

function findRecord(store, guildId, targetId, targetType) {
  const index = store.channelModes.findIndex(
    (entry) => entry.guildId === guildId && entry.targetId === targetId && entry.targetType === targetType,
  );
  return { index, record: index >= 0 ? store.channelModes[index] : null };
}

function applyOperation(state, modes, operation) {
  const next = { ...state };
  if (operation === 'merge') {
    for (const mode of modes) next[mode] = true;
    return next;
  }
  if (operation === 'remove') {
    for (const mode of modes) next[mode] = false;
    return next;
  }
  if (operation === 'replace') {
    const cleared = emptyState();
    for (const mode of modes) cleared[mode] = true;
    return cleared;
  }
  return emptyState();
}

function isEmpty(state) {
  return MODE_KEYS.every((mode) => !state[mode]);
}

function sanitizeRatings(state, { ratingSelected, operation }) {
  const next = { ...state };
  const chatActive = !!next.chat;
  const personalityActive = !!next.personality;
  if (!chatActive || !personalityActive) {
    for (const mode of RATING_MODES) next[mode] = false;
    return next;
  }

  const selected = ratingSelected && RATING_MODES.includes(ratingSelected) ? ratingSelected : undefined;

  if (operation !== 'remove' && selected) {
    for (const rating of RATING_MODES) {
      next[rating] = rating === selected;
    }
  } else {
    const activeRatings = RATING_MODES.filter((rating) => next[rating]);
    if (activeRatings.length > 1) {
      const keep = activeRatings[0];
      for (const rating of RATING_MODES) next[rating] = rating === keep;
    }
  }
  return next;
}

function setModes({ guildId, targetId, targetType, modes, operation, actorHasManageGuild }) {
  if (!TARGET_TYPES.has(targetType)) {
    throw new Error(`Unsupported targetType: ${targetType}`);
  }
  ensureAdmin(actorHasManageGuild);

  let modeList = uniqueModes(modes);
  if (!modeList.length && operation !== 'clear') {
    throw new Error('Select at least one mode.');
  }

  const ratingSelected = modeList.find((mode) => RATING_MODES.includes(mode));
  if (ratingSelected && operation !== 'remove') {
    modeList = uniqueModes([...modeList, 'chat', 'personality']);
  }

  const store = loadStore();
  const { index, record } = findRecord(store, guildId, targetId, targetType);
  const normalized =
    normalize(record) || {
      guildId,
      targetId,
      targetType,
      modes: emptyState(),
      updatedAt: Date.now(),
    };

  let updatedModes;
  if (operation === 'clear') {
    updatedModes = emptyState();
  } else {
    updatedModes = applyOperation(normalized.modes, modeList, operation);
    updatedModes = sanitizeRatings(updatedModes, { ratingSelected, operation });
  }

  if (isEmpty(updatedModes)) {
    if (index >= 0) store.channelModes.splice(index, 1);
  } else {
    const entry = {
      guildId,
      targetId,
      targetType,
      modes: updatedModes,
      updatedAt: Date.now(),
    };
    if (index >= 0) store.channelModes[index] = entry;
    else store.channelModes.push(entry);
  }

  saveStore(store);

  return {
    modes: {
      label: `${targetType}:${targetId}`,
      modes: updatedModes,
      updatedAt: Date.now(),
    },
    operation,
  };
}

function resolveInherited(store, guildId, parents = []) {
  const results = [];
  for (const parent of parents) {
    if (!parent || !TARGET_TYPES.has(parent.targetType)) continue;
    const { record } = findRecord(store, guildId, parent.targetId, parent.targetType);
    const normalized = normalize(record);
    if (normalized) results.push(normalized);
  }
  return results;
}

function combineModes(...states) {
  const combined = emptyState();
  for (const state of states) {
    if (!state) continue;
    for (const mode of MODE_KEYS) {
      if (state[mode]) combined[mode] = true;
    }
  }
  return combined;
}

function viewModes({ guildId, targetId, targetType, parents }) {
  const store = loadStore();
  const inheritedRecords = resolveInherited(store, guildId, parents);
  const inheritedSummaries = inheritedRecords.map((record) => ({
    label: `${record.targetType}:${record.targetId}`,
    modes: record.modes,
    updatedAt: record.updatedAt,
  }));

  const { record } = findRecord(store, guildId, targetId, targetType);
  const directRecord = normalize(record);
  const directSummary = {
    label: `${targetType}:${targetId}`,
    modes: directRecord ? directRecord.modes : emptyState(),
    updatedAt: directRecord ? directRecord.updatedAt : Date.now(),
  };

  const effectiveState = combineModes(
    ...inheritedSummaries.map((entry) => entry.modes),
    directSummary.modes,
  );

  return {
    direct: directSummary,
    inherited: inheritedSummaries,
    effective: {
      label: 'effective',
      modes: effectiveState,
      updatedAt: Date.now(),
    },
  };
}

function listModes({ guildId, scope = 'guild', presenceFilter, presenceMode }) {
  const store = loadStore();
  return store.channelModes
    .filter((entry) => entry.guildId === guildId)
    .filter((entry) => {
      if (scope === 'category') return entry.targetType === 'category';
      if (scope === 'channel') return entry.targetType !== 'category';
      return true;
    })
    .filter((entry) => {
      if (!presenceMode || !presenceFilter) return true;
      const active = !!(entry.modes || {})[presenceMode];
      return presenceFilter === 'has' ? active : !active;
    })
    .map((entry) => ({
      label: `${entry.targetType}:${entry.targetId}`,
      modes: { ...emptyState(), ...(entry.modes || {}) },
      updatedAt: entry.updatedAt || Date.now(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function summarizeModes(summary) {
  const status = MODE_KEYS.map((mode) => `${mode}: ${summary.modes[mode] ? '✅' : '❌'}`).join(' | ');
  return `${summary.label} → ${status}`;
}

function summarizeList(entries) {
  if (!entries.length) return ['📭 No explicit overrides set.'];
  return entries.map((entry) => `• ${summarizeModes(entry)}`);
}

function summarizeView(result) {
  const inherited = result.inherited.length
    ? result.inherited.map((entry) => summarizeModes(entry)).join('\n')
    : 'None';
  return [
    `Direct: ${summarizeModes(result.direct)}`,
    `Effective: ${summarizeModes(result.effective)}`,
    `Inherited:\n${inherited}`,
  ].join('\n');
}

module.exports = {
  MODE_KEYS,
  PRIMARY_MODES,
  OPTIONAL_MODES,
  RATING_MODES,
  setModes,
  viewModes,
  listModes,
  summarizeModes,
  summarizeList,
  summarizeView,
  combineModes,
};
