/**
 * Guild settings for admin-api
 * Works with key-value schema: (guild_id, key_name, value)
 */
const { query, one } = require('./database');

const LOW_DEF  = Number(process.env.VERIFY_WARN_LOW_DEFAULT  || 1e9);
const HIGH_DEF = Number(process.env.VERIFY_WARN_HIGH_DEFAULT || 5e10);

function envGuild(key, guildId, fallback) {
  const v = process.env[`${key}_${guildId}`];
  return (v !== undefined && v !== '') ? Number(v) : fallback;
}

async function getGuildSettings(guildId) {
  try {
    const rows = await query(
      'SELECT key_name, value FROM guild_settings WHERE guild_id = ?',
      [guildId]
    );
    const map = {};
    for (const row of rows) {
      map[row.key_name] = row.value;
    }
    return map;
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || /doesn.t exist/i.test(String(e.message)))) {
      return {};
    }
    throw e;
  }
}

async function upsertGuildSettings(guildId, patch = {}) {
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') {
        // Delete the key
        await query(
          'DELETE FROM guild_settings WHERE guild_id = ? AND key_name = ?',
          [guildId, key]
        );
      } else {
        // Upsert the key-value
        await query(
          `INSERT INTO guild_settings (guild_id, key_name, value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [guildId, key, String(value)]
        );
      }
    }
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || /doesn.t exist/i.test(String(e.message)))) {
      throw new Error('guild_settings table missing. Apply migrations first.');
    }
    throw e;
  }
}

async function getWarnThresholds(guildId) {
  const settings = await getGuildSettings(guildId);
  const envLow  = envGuild('VERIFY_WARN_LOW',  guildId, undefined);
  const envHigh = envGuild('VERIFY_WARN_HIGH', guildId, undefined);

  const dbLow = settings.warn_total_low ? Number(settings.warn_total_low) : null;
  const dbHigh = settings.warn_total_high ? Number(settings.warn_total_high) : null;

  return {
    low:  dbLow || envLow  || LOW_DEF,
    high: dbHigh || envHigh || HIGH_DEF
  };
}

async function getWeekAnchor(guildId) {
  const settings = await getGuildSettings(guildId);
  const day  = settings.week_anchor_day  || process.env.CLUB_WEEK_ANCHOR_DAY || 'FRI';
  const time = settings.week_anchor_time || process.env.CLUB_WEEK_ANCHOR_TIME || '04:30';
  const tz   = settings.week_anchor_tz   || process.env.CLUB_WEEK_ANCHOR_TZ   || 'America/Los_Angeles';
  return { day, time, tz };
}

module.exports = {
  getGuildSettings,
  upsertGuildSettings,
  getWarnThresholds,
  getWeekAnchor
};
