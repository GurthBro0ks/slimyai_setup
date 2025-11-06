const { PrismaClient } = require('@prisma/client');
const metrics = require('./monitoring/metrics');
const config = require('./config');

class Database {
  constructor() {
    this.prisma = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      this.prisma = new PrismaClient({
        log: config.database.logLevel,
      });

      // Add metrics middleware
      this.prisma.$use(async (params, next) => {
        const startTime = Date.now();
        try {
          const result = await next(params);
          const duration = Date.now() - startTime;
          metrics.recordDatabaseQuery(duration);
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          metrics.recordDatabaseQuery(duration);
          // Record database errors as application errors
          metrics.recordError();
          throw error;
        }
      });

      // Test the connection
      await this.prisma.$connect();
      metrics.recordDatabaseConnection(1); // Increment connection count
      this.isInitialized = true;

      console.log('[database] Connected to PostgreSQL database');
      return true;
    } catch (err) {
      console.error('[database] Initialization failed:', err.message || err);
      return false;
    }
  }

  isConfigured() {
    return Boolean(config.database.url);
  }

  getClient() {
    if (!this.isInitialized || !this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.prisma;
  }

  async close() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      metrics.recordDatabaseConnection(-1); // Decrement connection count
      this.prisma = null;
      this.isInitialized = false;
    }
  }

  // Audit logging methods
  async createAuditLog({
    userId,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress,
    userAgent,
    sessionId,
    requestId,
    success = true,
    errorMessage,
  }) {
    const prisma = this.getClient();

    return await prisma.auditLog.create({
      data: {
        userId,
        action,
        resourceType,
        resourceId,
        details: details || {},
        ipAddress,
        userAgent,
        sessionId,
        requestId,
        success,
        errorMessage,
      },
    });
  }

  async getAuditLogs(filters = {}, options = {}) {
    const prisma = this.getClient();

    const {
      userId,
      action,
      resourceType,
      resourceId,
      success,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = filters;

    const where = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;
    if (success !== undefined) where.success = success;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    return await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            globalName: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  async getAuditLogStats(filters = {}) {
    const prisma = this.getClient();

    const {
      userId,
      action,
      resourceType,
      startDate,
      endDate,
    } = filters;

    const where = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const [totalLogs, successfulLogs, failedLogs, actionStats] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, success: true } }),
      prisma.auditLog.count({ where: { ...where, success: false } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      }),
    ]);

    return {
      total: totalLogs,
      successful: successfulLogs,
      failed: failedLogs,
      successRate: totalLogs > 0 ? (successfulLogs / totalLogs) * 100 : 0,
      actionBreakdown: actionStats.map(stat => ({
        action: stat.action,
        count: stat._count.id,
      })),
    };
  }

  // User management methods
  async findOrCreateUser(discordUser) {
    const prisma = this.getClient();

    return await prisma.user.upsert({
      where: { discordId: discordUser.id },
      update: {
        username: discordUser.username,
        globalName: discordUser.global_name || discordUser.username,
        avatar: discordUser.avatar,
      },
      create: {
        discordId: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.global_name || discordUser.username,
        avatar: discordUser.avatar,
      },
    });
  }

  async findUserByDiscordId(discordId) {
    const prisma = this.getClient();

    return await prisma.user.findUnique({
      where: { discordId },
    });
  }

  async findUserById(id) {
    const prisma = this.getClient();

    return await prisma.user.findUnique({
      where: { id },
    });
  }

  // Session management methods
  async createSession(userId, token, expiresAt) {
    const prisma = this.getClient();

    return await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt: new Date(expiresAt),
      },
    });
  }

  async findSessionByToken(token) {
    const prisma = this.getClient();

    return await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async deleteSession(token) {
    const prisma = this.getClient();

    return await prisma.session.delete({
      where: { token },
    });
  }

  async deleteExpiredSessions() {
    const prisma = this.getClient();
    const now = new Date();

    return await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
  }

  async deleteUserSessions(userId) {
    const prisma = this.getClient();

    return await prisma.session.deleteMany({
      where: { userId },
    });
  }

  // Guild management methods
  async findOrCreateGuild(discordGuild) {
    const prisma = this.getClient();

    return await prisma.guild.upsert({
      where: { discordId: discordGuild.id },
      update: {
        name: discordGuild.name,
      },
      create: {
        discordId: discordGuild.id,
        name: discordGuild.name,
      },
    });
  }

  async findGuildByDiscordId(discordId) {
    const prisma = this.getClient();

    return await prisma.guild.findUnique({
      where: { discordId },
    });
  }

  async findGuildById(id) {
    const prisma = this.getClient();

    return await prisma.guild.findUnique({
      where: { id },
    });
  }

  async listGuilds(options = {}) {
    const prisma = this.getClient();
    const { limit = 50, offset = 0, search } = options;

    const where = {};
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    return await prisma.guild.findMany({
      where,
      take: Math.min(limit, 100),
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countGuilds(search) {
    const prisma = this.getClient();

    const where = {};
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    return await prisma.guild.count({ where });
  }

  async createGuild(guildData) {
    const prisma = this.getClient();
    const { discordId, name, settings = {} } = guildData;

    return await prisma.guild.create({
      data: {
        discordId,
        name,
        settings,
      },
    });
  }

  async updateGuild(id, updates) {
    const prisma = this.getClient();

    return await prisma.guild.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });
  }

  async deleteGuild(id) {
    const prisma = this.getClient();

    return await prisma.guild.delete({
      where: { id },
    });
  }

  async updateGuildSettings(guildId, settings) {
    const prisma = this.getClient();

    return await prisma.guild.update({
      where: { id: guildId },
      data: { settings },
    });
  }

  // User-Guild relationships
  async addUserToGuild(userId, guildId, roles = []) {
    const prisma = this.getClient();

    return await prisma.userGuild.upsert({
      where: {
        userId_guildId: {
          userId,
          guildId,
        },
      },
      update: { roles },
      create: {
        userId,
        guildId,
        roles,
      },
    });
  }

  async removeUserFromGuild(userId, guildId) {
    const prisma = this.getClient();

    return await prisma.userGuild.delete({
      where: {
        userId_guildId: {
          userId,
          guildId,
        },
      },
    });
  }

  async getUserGuilds(userId) {
    const prisma = this.getClient();

    return await prisma.userGuild.findMany({
      where: { userId },
      include: {
        guild: true,
      },
    });
  }

  async getGuildMembers(guildId, options = {}) {
    const prisma = this.getClient();
    const { limit = 50, offset = 0, search } = options;

    const where = { guildId };
    if (search) {
      where.user = {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { globalName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    return await prisma.userGuild.findMany({
      where,
      take: Math.min(limit, 200),
      skip: offset,
      orderBy: { user: { username: 'asc' } },
      include: {
        user: {
          select: {
            id: true,
            discordId: true,
            username: true,
            globalName: true,
            avatar: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async countGuildMembers(guildId, search) {
    const prisma = this.getClient();

    const where = { guildId };
    if (search) {
      where.user = {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { globalName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    return await prisma.userGuild.count({ where });
  }

  async updateUserGuildRoles(userId, guildId, roles) {
    const prisma = this.getClient();

    return await prisma.userGuild.update({
      where: {
        userId_guildId: {
          userId,
          guildId,
        },
      },
      data: { roles },
    });
  }

  // Chat message methods (for the chat history API)
  async createChatMessage({ conversationId, userId, guildId, text, adminOnly = false }) {
    const prisma = this.getClient();

    return await prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        guildId,
        text,
        adminOnly,
      },
      include: {
        user: true,
        guild: true,
      },
    });
  }

  async getChatMessages(guildId, limit = 50, includeAdminOnly = false) {
    const prisma = this.getClient();

    const where = {
      guildId,
    };

    if (!includeAdminOnly) {
      where.adminOnly = false;
    }

    return await prisma.chatMessage.findMany({
      where,
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(limit, 200), // Max 200 messages
    });
  }

  // Conversation methods
  async createConversation(userId, title = null) {
    const prisma = this.getClient();

    return await prisma.conversation.create({
      data: {
        userId,
        title,
      },
    });
  }

  async getUserConversations(userId, limit = 10) {
    const prisma = this.getClient();

    return await prisma.conversation.findMany({
      where: { userId },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
    });
  }

  // Statistics methods
  async recordStat({ userId, guildId, type, value, timestamp }) {
    const prisma = this.getClient();

    return await prisma.stat.create({
      data: {
        userId,
        guildId,
        type,
        value,
        timestamp: timestamp ? new Date(timestamp) : undefined,
      },
    });
  }

  async getStats({ userId, guildId, type, limit = 100 }) {
    const prisma = this.getClient();

    const where = {};
    if (userId) where.userId = userId;
    if (guildId) where.guildId = guildId;
    if (type) where.type = type;

    return await prisma.stat.findMany({
      where,
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });
  }

  async getStatsAggregate({ userId, guildId, type, startDate, endDate }) {
    const prisma = this.getClient();

    const where = {};
    if (userId) where.userId = userId;
    if (guildId) where.guildId = guildId;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    return await prisma.stat.groupBy({
      by: ['type'],
      where,
      _count: true,
      _sum: {
        value: true, // This might need adjustment based on value types
      },
    });
  }

  // Legacy methods for backward compatibility (these can be migrated over time)
  async ensureGuildRecord(guildId, guildName = null) {
    return await this.findOrCreateGuild({ id: guildId, name: guildName });
  }

  async ensureUserRecord(userId, username = null) {
    // This is a simplified version - in practice you'd want more user data
    const existingUser = await this.findUserByDiscordId(userId);
    if (existingUser) {
      if (username && existingUser.username !== username) {
        return await this.getClient().user.update({
          where: { discordId: userId },
          data: { username },
        });
      }
      return existingUser;
    }

    return await this.getClient().user.create({
      data: {
        discordId: userId,
        username,
      },
    });
  }
}

module.exports = new Database();
