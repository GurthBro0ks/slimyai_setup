// lib/rate-limiter.js - Rate limiting system for command cooldowns
const cooldowns = new Map();
const logger = require('./logger');

// Cleanup old cooldowns every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of cooldowns.entries()) {
    if (now > expiry) {
      cooldowns.delete(key);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  /**
   * Check if user is on cooldown for a specific command
   * @param {string} userId - Discord user ID
   * @param {string} commandName - Command name
   * @param {number} cooldownSeconds - Cooldown duration in seconds
   * @returns {{limited: boolean, remaining?: number}} - Whether user is rate limited and remaining seconds
   */
  checkCooldown(userId, commandName, cooldownSeconds = 3) {
    const key = `${userId}-${commandName}`;
    const now = Date.now();
    const cooldownEnd = cooldowns.get(key);

    if (cooldownEnd && now < cooldownEnd) {
      const remaining = ((cooldownEnd - now) / 1000).toFixed(1);
      logger.debug('Rate limit hit', { userId, commandName, remaining });
      return { limited: true, remaining };
    }

    cooldowns.set(key, now + (cooldownSeconds * 1000));
    return { limited: false };
  },

  /**
   * Global rate limiter (per-user across all commands)
   * @param {string} userId - Discord user ID
   * @param {number} cooldownSeconds - Cooldown duration in seconds
   * @returns {{limited: boolean, remaining?: number}} - Whether user is rate limited
   */
  checkGlobalCooldown(userId, cooldownSeconds = 1) {
    return this.checkCooldown(userId, '__global__', cooldownSeconds);
  },

  /**
   * Reset cooldown for a specific user/command (for testing or admin overrides)
   * @param {string} userId - Discord user ID
   * @param {string} commandName - Command name (optional, clears all if omitted)
   */
  resetCooldown(userId, commandName = null) {
    if (commandName) {
      const key = `${userId}-${commandName}`;
      cooldowns.delete(key);
    } else {
      // Clear all cooldowns for this user
      for (const key of cooldowns.keys()) {
        if (key.startsWith(`${userId}-`)) {
          cooldowns.delete(key);
        }
      }
    }
  }
};
