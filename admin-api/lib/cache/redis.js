const { createClient } = require("redis");
const config = require("../../src/lib/config");

/**
 * Generic cache configuration
 */
const DEFAULT_CONFIG = {
  enabled: config.cache.enabled,
  url: config.cache.redisUrl,
  ttl: config.cache.ttl,
  staleTtl: config.cache.staleTtl,
  keyPrefix: config.cache.keyPrefix,
  retryAttempts: config.cache.retryAttempts,
  retryDelay: config.cache.retryDelay,
};

/**
 * Cached data with metadata
 */
class CachedData {
  constructor(data, ttl = DEFAULT_CONFIG.ttl, staleTtl = DEFAULT_CONFIG.staleTtl) {
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.ttl = ttl;
    this.staleTtl = staleTtl;
    this.expiresAt = Date.now() + (ttl * 1000);
    this.staleAt = Date.now() + (staleTtl * 1000);
    this.source = "cache";
  }
}

/**
 * Generic Redis-based cache
 */
class RedisCache {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = null;
    this.connected = false;
  }

  /**
   * Initialize the Redis connection
   */
  async connect() {
    if (!this.config.enabled || !this.config.url) {
      console.info("Redis cache disabled or no URL configured");
      return;
    }

    if (this.client && this.connected) {
      return; // Already connected
    }

    try {
      this.client = createClient({
        url: this.config.url,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
        },
      });

      this.client.on("error", (err) => {
        console.error("Redis client error:", err);
        this.connected = false;
      });

      this.client.on("connect", () => {
        console.info("Redis cache connected");
        this.connected = true;
      });

      this.client.on("disconnect", () => {
        console.info("Redis cache disconnected");
        this.connected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        console.error("Error disconnecting from Redis:", error);
      } finally {
        this.client = null;
        this.connected = false;
      }
    }
  }

  /**
   * Check if cache is available
   */
  isAvailable() {
    return this.config.enabled && this.connected && !!this.client;
  }

  /**
   * Get cached data with retry logic
   * Returns object with { data, isStale, metadata } or null if not found
   */
  async get(key) {
    if (!this.isAvailable()) {
      return null;
    }

    const fullKey = this.getFullKey(key);

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const data = await this.client.get(fullKey);
        if (data) {
          const parsed = JSON.parse(data);
          const now = Date.now();
          const isStale = now > parsed.staleAt;

          return {
            data: parsed.data,
            isStale,
            metadata: {
              timestamp: parsed.timestamp,
              expiresAt: parsed.expiresAt,
              staleAt: parsed.staleAt,
              ttl: parsed.ttl,
              staleTtl: parsed.staleTtl,
            }
          };
        }
        return null;
      } catch (error) {
        console.warn(`Cache get attempt ${attempt} failed:`, error);

        if (attempt === this.config.retryAttempts) {
          console.error(`Cache get failed after ${this.config.retryAttempts} attempts`);
          return null;
        }

        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }

    return null;
  }

  /**
   * Get cached data (legacy method for backward compatibility)
   * Returns raw data or null
   */
  async getData(key) {
    const result = await this.get(key);
    return result ? result.data : null;
  }

  /**
   * Set cached data with retry logic
   */
  async set(key, data, ttl, staleTtl) {
    if (!this.isAvailable()) {
      return false;
    }

    const fullKey = this.getFullKey(key);
    const cacheData = new CachedData(data, ttl || this.config.ttl, staleTtl || this.config.staleTtl);

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        await this.client.setEx(fullKey, (staleTtl || this.config.staleTtl), JSON.stringify(cacheData));
        return true;
      } catch (error) {
        console.warn(`Cache set attempt ${attempt} failed:`, error);

        if (attempt === this.config.retryAttempts) {
          console.error(`Cache set failed after ${this.config.retryAttempts} attempts`);
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }

    return false;
  }

  /**
   * Delete cached data
   */
  async delete(key) {
    if (!this.isAvailable()) {
      return false;
    }

    const fullKey = this.getFullKey(key);

    try {
      await this.client.del(fullKey);
      return true;
    } catch (error) {
      console.error("Cache delete failed:", error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isAvailable()) {
      return false;
    }

    const fullKey = this.getFullKey(key);

    try {
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error("Cache exists check failed:", error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      available: this.isAvailable(),
      connected: this.connected,
      enabled: this.config.enabled,
    };

    if (this.isAvailable()) {
      try {
        const keys = await this.client.keys(`${this.config.keyPrefix}*`);
        return { ...stats, keys: keys.length };
      } catch (error) {
        console.error("Failed to get cache stats:", error);
      }
    }

    return stats;
  }

  /**
   * Clear all cached data
   */
  async clear() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const keys = await this.client.keys(`${this.config.keyPrefix}*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error("Cache clear failed:", error);
      return false;
    }
  }

  /**
   * Get full key with prefix
   */
  getFullKey(key) {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Get or set pattern - fetch from cache, or compute and cache
   */
  async getOrSet(key, fetcher, ttl, staleTtl) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached && !cached.isStale) {
      return cached.data;
    }

    // If we have stale data, serve it immediately and refresh in background
    if (cached && cached.isStale) {
      // Refresh in background (fire and forget)
      fetcher().then(data => {
        this.set(key, data, ttl, staleTtl).catch(error => {
          console.warn(`Failed to refresh cache for key ${key}:`, error);
        });
      }).catch(error => {
        console.warn(`Failed to fetch fresh data for key ${key}:`, error);
      });

      // Return stale data immediately
      return cached.data;
    }

    // No cached data, fetch fresh
    const data = await fetcher();

    // Cache the result (fire and forget)
    this.set(key, data, ttl, staleTtl).catch(error => {
      console.warn(`Failed to cache data for key ${key}:`, error);
    });

    return data;
  }

  /**
   * Stale-while-revalidate wrapper
   * Always returns data (stale or fresh), refreshing stale data in background
   */
  async staleWhileRevalidate(key, fetcher, ttl, staleTtl) {
    return this.getOrSet(key, fetcher, ttl, staleTtl);
  }

  /**
   * Invalidate multiple keys matching a pattern
   */
  async invalidatePattern(pattern) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const keys = await this.client.keys(`${this.config.keyPrefix}${pattern}`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error("Cache pattern invalidation failed:", error);
      return false;
    }
  }
}

/**
 * Singleton cache instance
 */
let cacheInstance = null;

/**
 * Get the global cache instance
 */
function getCache(config) {
  if (!cacheInstance) {
    cacheInstance = new RedisCache(config);
  }
  return cacheInstance;
}

/**
 * Initialize global cache connection
 */
async function initCache() {
  const cache = getCache();
  await cache.connect();
}

/**
 * Cache utility functions for common patterns
 */
const CacheUtils = {
  /**
   * Cache key for API responses
   */
  apiKey: (endpoint, params) => {
    const paramStr = params ? `:${JSON.stringify(params)}` : "";
    return `api:${endpoint}${paramStr}`;
  },

  /**
   * Cache key for database queries
   */
  dbKey: (table, query, params) => {
    const paramStr = params ? `:${JSON.stringify(params)}` : "";
    return `db:${table}:${query}${paramStr}`;
  },

  /**
   * Cache key for user data
   */
  userKey: (userId, type) => {
    return `user:${userId}:${type}`;
  },

  /**
   * Cache key for guild data
   */
  guildKey: (guildId, type) => {
    return `guild:${guildId}:${type}`;
  },
};

module.exports = {
  RedisCache,
  getCache,
  initCache,
  CacheUtils,
  DEFAULT_CONFIG,
};
