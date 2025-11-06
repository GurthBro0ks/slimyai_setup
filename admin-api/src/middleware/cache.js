"use strict";

const { getCache, CacheUtils } = require("../../lib/cache/redis");

/**
 * API response caching middleware
 */
class APICache {
  constructor() {
    this.cache = getCache({
      keyPrefix: 'api:',
      ttl: 300, // 5 minutes default
    });
  }

  /**
   * Initialize cache connection
   */
  async init() {
    await this.cache.connect();
  }

  /**
   * Middleware to cache API responses
   */
  cache(options = {}) {
    const {
      ttl = 300, // 5 minutes
      staleTtl = 600, // 10 minutes (stale-while-revalidate)
      keyFn = (req) => CacheUtils.apiKey(req.originalUrl, req.query),
      condition = () => true, // Function to determine if response should be cached
      varyByUser = false, // Include user ID in cache key
      varyByGuild = false, // Include guild ID in cache key
      useStaleWhileRevalidate = true, // Enable stale-while-revalidate
    } = options;

    return async (req, res, next) => {
      try {
        // Check if caching is enabled for this request
        if (!condition(req, res)) {
          return next();
        }

        // Build cache key
        let cacheKey = keyFn(req);
        if (varyByUser && req.user?.id) {
          cacheKey = `${cacheKey}:user_${req.user.id}`;
        }
        if (varyByGuild && req.params?.guildId) {
          cacheKey = `${cacheKey}:guild_${req.params.guildId}`;
        }

        // Try to get cached response
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          // Return cached response
          const cacheStatus = cached.isStale ? 'STALE' : 'HIT';
          res.set('X-Cache-Status', cacheStatus);

          // Set cache control headers
          const maxAge = cached.isStale ? 0 : Math.max(0, Math.floor((cached.metadata.expiresAt - Date.now()) / 1000));
          res.set('Cache-Control', `private, max-age=${maxAge}`);

          return res.json(cached.data);
        }

        // Store original json method
        const originalJson = res.json;

        // Override json method to cache the response
        res.json = function(data) {
          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.cache.set(cacheKey, data, ttl, staleTtl).catch(err => {
              console.warn('Failed to cache API response:', err);
            });
          }

          res.set('X-Cache-Status', 'MISS');
          res.set('Cache-Control', 'private, max-age=0'); // Don't cache at browser level for fresh responses
          return originalJson.call(this, data);
        }.bind(this);

        next();
      } catch (error) {
        console.warn('API cache middleware error:', error);
        next();
      }
    }.bind(this);
  }

  /**
   * Stale-while-revalidate middleware for background refresh
   */
  staleWhileRevalidate(options = {}) {
    const {
      ttl = 300, // 5 minutes
      staleTtl = 600, // 10 minutes
      keyFn = (req) => CacheUtils.apiKey(req.originalUrl, req.query),
      condition = () => true,
      varyByUser = false,
      varyByGuild = false,
      fetcher, // Required: function to fetch fresh data
    } = options;

    return async (req, res, next) => {
      try {
        if (!condition(req, res) || !fetcher) {
          return next();
        }

        // Build cache key
        let cacheKey = keyFn(req);
        if (varyByUser && req.user?.id) {
          cacheKey = `${cacheKey}:user_${req.user.id}`;
        }
        if (varyByGuild && req.params?.guildId) {
          cacheKey = `${cacheKey}:guild_${req.params.guildId}`;
        }

        // Use stale-while-revalidate pattern
        const data = await this.cache.staleWhileRevalidate(
          cacheKey,
          () => fetcher(req),
          ttl,
          staleTtl
        );

        // Determine cache status for headers
        const cached = await this.cache.get(cacheKey);
        const cacheStatus = cached && cached.isStale ? 'STALE' : 'HIT';
        res.set('X-Cache-Status', cacheStatus);

        // Set appropriate cache control headers
        if (cached) {
          const maxAge = cached.isStale ? 0 : Math.max(0, Math.floor((cached.metadata.expiresAt - Date.now()) / 1000));
          res.set('Cache-Control', `private, max-age=${maxAge}`);
        }

        return res.json(data);
      } catch (error) {
        console.warn('Stale-while-revalidate middleware error:', error);
        next();
      }
    }.bind(this);
  }

  /**
   * Invalidate cache keys matching a pattern
   */
  async invalidate(pattern) {
    try {
      await this.cache.invalidatePattern(pattern);
    } catch (error) {
      console.warn('Failed to invalidate cache pattern:', error);
    }
  }

  /**
   * Clear all API cache
   */
  async clear() {
    try {
      await this.cache.clear();
    } catch (error) {
      console.warn('Failed to clear API cache:', error);
    }
  }

  /**
   * Cache key generators for common patterns
   */
  static keys = {
    /**
     * Guild-specific data
     */
    guild: (guildId, type) => `guild_${guildId}_${type}`,

    /**
     * User-specific data
     */
    user: (userId, type) => `user_${userId}_${type}`,

    /**
     * Stats data
     */
    stats: (type, params = {}) => {
      const paramStr = Object.keys(params).length > 0 ? `_${JSON.stringify(params)}` : '';
      return `stats_${type}${paramStr}`;
    },

    /**
     * Chat history
     */
    chatHistory: (guildId, options = {}) => {
      const { limit = 50, before, after } = options;
      return `chat_history_${guildId}_limit_${limit}_before_${before || 'none'}_after_${after || 'none'}`;
    },
  };
}

// Singleton instance
let apiCacheInstance = null;

/**
 * Get API cache instance
 */
function getAPICache() {
  if (!apiCacheInstance) {
    apiCacheInstance = new APICache();
  }
  return apiCacheInstance;
}

/**
 * Initialize API cache
 */
async function initAPICache() {
  const cache = getAPICache();
  await cache.init();
  return cache;
}

/**
 * Cache middleware factory functions
 */

// Cache user data for 5 minutes with stale-while-revalidate
const cacheUserData = (ttl = 300, staleTtl = 600) => getAPICache().cache({
  ttl,
  staleTtl,
  varyByUser: true,
  condition: (req) => req.method === 'GET',
});

// Cache guild data for 2 minutes with stale-while-revalidate
const cacheGuildData = (ttl = 120, staleTtl = 300) => getAPICache().cache({
  ttl,
  staleTtl,
  varyByGuild: true,
  condition: (req) => req.method === 'GET',
});

// Cache public stats for 10 minutes with stale-while-revalidate
const cacheStats = (ttl = 600, staleTtl = 1200) => getAPICache().cache({
  ttl,
  staleTtl,
  condition: (req) => req.method === 'GET',
});

// Cache chat history for 1 minute with stale-while-revalidate
const cacheChatHistory = (ttl = 60, staleTtl = 180) => getAPICache().cache({
  ttl,
  staleTtl,
  varyByGuild: true,
  condition: (req) => req.method === 'GET',
});

// Stale-while-revalidate for guild data
const swrGuildData = (fetcher, ttl = 120, staleTtl = 300) => getAPICache().staleWhileRevalidate({
  ttl,
  staleTtl,
  varyByGuild: true,
  condition: (req) => req.method === 'GET',
  fetcher,
});

// Stale-while-revalidate for stats
const swrStats = (fetcher, ttl = 600, staleTtl = 1200) => getAPICache().staleWhileRevalidate({
  ttl,
  staleTtl,
  condition: (req) => req.method === 'GET',
  fetcher,
});

module.exports = {
  APICache,
  getAPICache,
  initAPICache,
  cacheUserData,
  cacheGuildData,
  cacheStats,
  cacheChatHistory,
  swrGuildData,
  swrStats,
};
