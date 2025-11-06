/**
 * Thresholds wrapper for admin-api
 * Uses admin-api database instead of main lib database
 */
const database = require('./database');

const FALLBACK_LOW = 1e9; // 1B
const FALLBACK_HIGH = 5e10; // 50B

/**
 * Get warning thresholds for a guild.
 * Priority:
 * 1. Database guild_settings (warn_total_low, warn_total_high)
 * 2. Per-guild environment variables
 * 3. Default environment variables
 * 4. Hardcoded fallbacks
 */
async function getWarnThresholds(guildId) {
  let low = null;
  let high = null;

  // 1. Check database overrides
  try {
    const row = await database.one(
      `SELECT warn_total_low, warn_total_high FROM guild_settings WHERE guild_id = ?`,
      [guildId]
    );
    if (row) {
      if (row.warn_total_low !== null) low = Number(row.warn_total_low);
      if (row.warn_total_high !== null) high = Number(row.warn_total_high);
    }
  } catch (err) {
    // Ignore DB errors (table might not exist), fall through to env
  }

  // 2. Per-guild environment variables
  if (low === null) {
    const envKey = `VERIFY_WARN_LOW_${guildId}`;
    if (process.env[envKey]) {
      low = Number(process.env[envKey]);
    }
  }
  if (high === null) {
    const envKey = `VERIFY_WARN_HIGH_${guildId}`;
    if (process.env[envKey]) {
      high = Number(process.env[envKey]);
    }
  }

  // 3. Default environment variables
  if (low === null && process.env.VERIFY_WARN_LOW_DEFAULT) {
    low = Number(process.env.VERIFY_WARN_LOW_DEFAULT);
  }
  if (high === null && process.env.VERIFY_WARN_HIGH_DEFAULT) {
    high = Number(process.env.VERIFY_WARN_HIGH_DEFAULT);
  }

  // 4. Hardcoded fallbacks
  if (low === null || !Number.isFinite(low)) {
    low = FALLBACK_LOW;
  }
  if (high === null || !Number.isFinite(high)) {
    high = FALLBACK_HIGH;
  }

  return { low, high };
}

/**
 * Format number in compact notation (K/M/B).
 */
function formatCompact(value) {
  if (value === null || typeof value === 'undefined') return '0';
  const num = Number(value);

  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(2)}B`;
  }
  if (num >= 1e6) {
    return `${(num / 1e6).toFixed(2)}M`;
  }
  if (num >= 1e3) {
    return `${(num / 1e3).toFixed(2)}K`;
  }
  return num.toString();
}

/**
 * Format number with full locale string (commas).
 */
function formatNumber(value, digits = 0) {
  if (value === null || typeof value === 'undefined') return '0';
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

module.exports = {
  getWarnThresholds,
  formatCompact,
  formatNumber,
};
