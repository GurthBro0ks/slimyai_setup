"use strict";

const database = require("../../lib/database");

function normalizeChannelPayload(entry) {
  return {
    channelId: String(entry.channelId),
    channelName: entry.channelName || null,
    modes: entry.modes && typeof entry.modes === "object" ? entry.modes : {},
    allowlist: Array.isArray(entry.allowlist) ? entry.allowlist : [],
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function getChannelSettings(guildId) {
  if (!database.isConfigured()) return [];

  const rows = await database.query(
    `SELECT channel_id, channel_name, modes_json, allowlist_json, updated_at, updated_by
     FROM channel_settings
     WHERE guild_id = ?
     ORDER BY channel_id ASC`,
    [guildId],
  );

  return rows.map((row) => ({
    channelId: row.channel_id,
    channelName: row.channel_name,
    modes: parseJson(row.modes_json, {}),
    allowlist: parseJson(row.allowlist_json, []),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

async function replaceChannelSettings(guildId, entries, { userId = null } = {}) {
  if (!database.isConfigured()) {
    throw new Error("Database not configured");
  }

  const normalized = entries.map(normalizeChannelPayload);

  if (!normalized.length) {
    await database.query(
      `DELETE FROM channel_settings
       WHERE guild_id = ?`,
      [guildId],
    );
    return [];
  }

  const seenChannelIds = new Set(normalized.map((entry) => entry.channelId));

  await database.query(
    `DELETE FROM channel_settings
     WHERE guild_id = ?
       AND channel_id NOT IN (${Array.from(seenChannelIds)
         .map(() => "?")
         .join(",")})`,
    [guildId, ...Array.from(seenChannelIds)],
  );

  const values = normalized
    .map(
      () =>
        "(?, ?, ?, ?, ?, ?)", // guild, channel, name, modes_json, allowlist_json, updated_by
    )
    .join(", ");
  const params = [];

  for (const entry of normalized) {
    params.push(
      guildId,
      entry.channelId,
      entry.channelName,
      JSON.stringify(entry.modes || {}),
      JSON.stringify(entry.allowlist || []),
      userId,
    );
  }

  await database.query(
    `INSERT INTO channel_settings
       (guild_id, channel_id, channel_name, modes_json, allowlist_json, updated_by)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE
       channel_name = VALUES(channel_name),
       modes_json = VALUES(modes_json),
       allowlist_json = VALUES(allowlist_json),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    params,
  );

  return getChannelSettings(guildId);
}

module.exports = {
  getChannelSettings,
  replaceChannelSettings,
};
