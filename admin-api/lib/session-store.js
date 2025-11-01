"use strict";

// Simple in-memory session store
// TODO: Replace with Redis or database for production
const sessions = new Map();

// Clean up expired sessions every hour
const MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (now - session.createdAt > MAX_AGE) {
      sessions.delete(userId);
    }
  }
}, 60 * 60 * 1000);

function storeSession(userId, data) {
  sessions.set(userId, {
    ...data,
    createdAt: Date.now()
  });
  console.log('[session-store] Stored session for user:', userId);
}

function getSession(userId) {
  const session = sessions.get(userId);
  if (!session) return null;

  // Check if expired
  if (Date.now() - session.createdAt > MAX_AGE) {
    sessions.delete(userId);
    return null;
  }

  return session;
}

function clearSession(userId) {
  sessions.delete(userId);
  console.log('[session-store] Cleared session for user:', userId);
}

module.exports = {
  storeSession,
  getSession,
  clearSession
};
