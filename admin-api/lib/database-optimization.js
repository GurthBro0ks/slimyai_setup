const { PrismaClient } = require('@prisma/client');
const { getCache } = require('./cache/redis');

/**
 * Database optimization utilities
 */
class DatabaseOptimizer {
  constructor() {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    this.cache = getCache({
      keyPrefix: 'db_opt:',
      ttl: 300, // 5 minutes for optimization data
    });
  }

  /**
   * Analyze slow queries and provide optimization suggestions
   */
  async analyzeQueryPerformance(queryName, queryFn, options = {}) {
    const startTime = Date.now();
    let result;
    let error;

    try {
      result = await queryFn();
    } catch (err) {
      error = err;
    }

    const duration = Date.now() - startTime;
    const threshold = options.threshold || 100; // ms

    if (duration > threshold) {
      console.warn(`Slow query detected: ${queryName} took ${duration}ms`);

      // Log slow query for monitoring
      await this.logSlowQuery({
        name: queryName,
        duration,
        threshold,
        timestamp: new Date(),
        error: error?.message,
      });
    }

    if (error) throw error;
    return result;
  }

  /**
   * Log slow query for monitoring
   */
  async logSlowQuery(queryData) {
    try {
      // You could store this in a monitoring table or external service
      console.log('Slow query logged:', queryData);
    } catch (error) {
      console.error('Failed to log slow query:', error);
    }
  }

  /**
   * Optimize common query patterns with caching
   */
  async getUserWithGuilds(userId, options = {}) {
    const cacheKey = `user_guilds:${userId}`;
    const cached = await this.cache.get(cacheKey);

    if (cached && !options.skipCache) {
      return cached;
    }

    const result = await this.analyzeQueryPerformance(
      `getUserWithGuilds(${userId})`,
      () => this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userGuilds: {
            include: {
              guild: true,
            },
          },
          _count: {
            select: {
              chatMessages: true,
              conversations: true,
            },
          },
        },
      })
    );

    if (result) {
      await this.cache.set(cacheKey, result, 300); // 5 minutes
    }

    return result;
  }

  /**
   * Optimize guild analytics queries
   */
  async getGuildAnalytics(guildId, options = {}) {
    const cacheKey = `guild_analytics:${guildId}:${JSON.stringify(options)}`;
    const cached = await this.cache.get(cacheKey);

    if (cached && !options.skipCache) {
      return cached;
    }

    const result = await this.analyzeQueryPerformance(
      `getGuildAnalytics(${guildId})`,
      async () => {
        const [guild, stats, messages, analyses] = await Promise.all([
          this.prisma.guild.findUnique({
            where: { id: guildId },
            include: {
              _count: {
                select: {
                  userGuilds: true,
                  chatMessages: true,
                  clubAnalyses: true,
                },
              },
            },
          }),
          this.prisma.stat.findMany({
            where: { guildId },
            orderBy: { timestamp: 'desc' },
            take: 100,
          }),
          this.prisma.chatMessage.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
              user: {
                select: { username: true, globalName: true },
              },
            },
          }),
          this.prisma.clubAnalysis.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              user: {
                select: { username: true, globalName: true },
              },
              _count: {
                select: { metrics: true, images: true },
              },
            },
          }),
        ]);

        return { guild, stats, messages, analyses };
      }
    );

    if (result) {
      await this.cache.set(cacheKey, result, 180); // 3 minutes
    }

    return result;
  }

  /**
   * Bulk insert optimization for stats
   */
  async bulkInsertStats(statsData) {
    const BATCH_SIZE = 100;

    for (let i = 0; i < statsData.length; i += BATCH_SIZE) {
      const batch = statsData.slice(i, i + BATCH_SIZE);

      await this.analyzeQueryPerformance(
        `bulkInsertStats(batch ${Math.floor(i / BATCH_SIZE) + 1})`,
        () => this.prisma.stat.createMany({
          data: batch,
          skipDuplicates: true,
        })
      );
    }
  }

  /**
   * Optimized pagination for large datasets
   */
  async getPaginatedChatMessages(guildId, options = {}) {
    const {
      page = 1,
      limit = 50,
      before,
      after,
      userId,
      adminOnly,
    } = options;

    const cacheKey = `chat_messages:${guildId}:${page}:${limit}:${before || 'none'}:${after || 'none'}:${userId || 'all'}:${adminOnly || 'all'}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const where = {
      guildId,
      ...(userId && { userId }),
      ...(adminOnly !== undefined && { adminOnly }),
      ...(before && { createdAt: { lt: new Date(before) } }),
      ...(after && { createdAt: { gt: new Date(after) } }),
    };

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, globalName: true, avatar: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatMessage.count({ where }),
    ]);

    const result = {
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };

    await this.cache.set(cacheKey, result, 60); // 1 minute cache
    return result;
  }

  /**
   * Get database performance metrics
   */
  async getPerformanceMetrics() {
    try {
      // Get connection pool stats
      const poolStats = await this.prisma.$queryRaw`
        SELECT
          count(*) as active_connections,
          sum(extract(epoch from (now() - query_start))) as total_query_time
        FROM pg_stat_activity
        WHERE state = 'active' AND datname = current_database()
      `;

      // Get table sizes
      const tableSizes = await this.prisma.$queryRaw`
        SELECT
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `;

      // Get index usage
      const indexUsage = await this.prisma.$queryRaw`
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_scan as scans,
          pg_size_pretty(pg_relation_size(indexrelid)) as size
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
        LIMIT 20
      `;

      return {
        poolStats: poolStats[0] || {},
        tableSizes,
        indexUsage,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return null;
    }
  }

  /**
   * Clean up old cached data
   */
  async cleanup() {
    try {
      await this.cache.clear();
      console.log('Database optimization cache cleared');
    } catch (error) {
      console.error('Failed to cleanup optimization cache:', error);
    }
  }

  /**
   * Initialize the optimizer
   */
  async init() {
    await this.cache.connect();
    console.log('Database optimizer initialized');
  }

  /**
   * Close connections
   */
  async close() {
    await this.cache.disconnect();
    await this.prisma.$disconnect();
  }
}

// Singleton instance
let optimizerInstance = null;

/**
 * Get the database optimizer instance
 */
function getDatabaseOptimizer() {
  if (!optimizerInstance) {
    optimizerInstance = new DatabaseOptimizer();
  }
  return optimizerInstance;
}

module.exports = {
  DatabaseOptimizer,
  getDatabaseOptimizer,
};
