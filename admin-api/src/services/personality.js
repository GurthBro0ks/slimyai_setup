"use strict";

const database = require("../../lib/database");

function parseJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function getPersonality(guildId) {
  if (!database.isConfigured()) {
    return { profile: {}, updatedAt: null, updatedBy: null };
  }

  const rows = await database.query(
    `SELECT profile_json, updated_at, updated_by
     FROM guild_personality
     WHERE guild_id = ?
     LIMIT 1`,
    [guildId],
  );

  if (!rows.length) {
    return { profile: {}, updatedAt: null, updatedBy: null };
  }

  const record = rows[0];
  return {
    profile: parseJson(record.profile_json),
    updatedAt: record.updated_at,
    updatedBy: record.updated_by,
  };
}

async function updatePersonality(guildId, profile, { userId = null } = {}) {
  if (!database.isConfigured()) {
    throw new Error("Database not configured");
  }

  await database.query(
    `INSERT INTO guild_personality (guild_id, profile_json, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       profile_json = VALUES(profile_json),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [guildId, JSON.stringify(profile || {}), userId || null],
  );

  return getPersonality(guildId);
}

module.exports = {
  getPersonality,
  updatePersonality,
};
