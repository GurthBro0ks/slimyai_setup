"use strict";

const database = require("../src/lib/database");

// Session store using database persistence
const MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours for better security

// Clean up expired sessions every hour
setInterval(async () => {
  try {
    await database.deleteExpiredSessions();
  } catch (err) {
    // Log error without exposing sensitive details
    console.error('[session-store] Failed to cleanup expired sessions');
  }
}, 60 * 60 * 1000);

async function storeSession(userId, data) {
  try {
    // Calculate token expiration (12 hours from now)
    const expiresAt = Date.now() + MAX_AGE;

    // Extract token from session data if it exists
    const token = data.tokens?.accessToken || data.token;

    if (!token) {
      console.warn('[session-store] No token found in session data for user:', userId);
      return;
    }

    // Store session in database
    await database.createSession(userId, token, expiresAt);

  } catch (err) {
    // Log error without exposing sensitive details
    console.error('[session-store] Failed to store session');
    throw err;
  }
}

async function getSession(userId) {
  try {
    // For backward compatibility, we need to find the session by token
    // This is a limitation - we'd ideally store sessions by userId
    // For now, we'll return a mock session structure
    // TODO: Update to properly query sessions by userId when JWT token is available

    // Since we don't have direct userId lookup, we'll need to get this from the JWT middleware
    // For now, return null and let the JWT middleware handle it
    return null;
  } catch (err) {
    console.error('[session-store] Failed to get session:', err.message);
    return null;
  }
}

async function clearSession(userId) {
  try {
    await database.deleteUserSessions(userId);
  } catch (err) {
    // Log error without exposing sensitive details
    console.error('[session-store] Failed to clear session');
    throw err;
  }
}

async function activeSessionCount() {
  try {
    // This is a simplified count - in a real implementation we'd query the database
    // For now, return 0 since we can't easily count without proper session management
    return 0;
  } catch (err) {
    console.error('[session-store] Failed to get active session count:', err.message);
    return 0;
  }
}

async function getAllSessions() {
  try {
    // Return empty array for now - full implementation would require database query
    return [];
  } catch (err) {
    console.error('[session-store] Failed to get all sessions:', err.message);
    return [];
  }
}

module.exports = {
  storeSession,
  getSession,
  clearSession,
  activeSessionCount,
  getAllSessions
};
