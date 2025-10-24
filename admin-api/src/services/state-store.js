"use strict";

const { nanoid } = require("nanoid");

const STATE_TTL_MS = 5 * 60 * 1000;
const stateStore = new Map();

function prune() {
  const now = Date.now();
  for (const [key, entry] of stateStore.entries()) {
    if (!entry || now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(key);
    }
  }
}

function createState(metadata = {}) {
  prune();
  const state = nanoid(32);
  stateStore.set(state, { ...metadata, createdAt: Date.now() });
  return state;
}

function consumeState(state) {
  if (!stateStore.has(state)) return null;
  const entry = stateStore.get(state);
  stateStore.delete(state);
  return entry;
}

module.exports = {
  createState,
  consumeState,
};
