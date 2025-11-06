const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    if (!this.isConfigured()) {
      console.warn('[database] Skipping initialization: missing DB configuration.');
      return false;
    }

    try {
      this.getPool();
      await this.createTables();
      return true;
    } catch (err) {
      console.error('[database] Initialization failed:', err.message || err);
      return false;
    }
  }

  isConfigured() {
    return Boolean(
      process.env.DB_HOST &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD &&
      process.env.DB_NAME
    );
  }

  getPool() {
    if (this.pool) return this.pool;
    if (!this.isConfigured()) {
      throw new Error('Database not configured. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    }

    this.pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
      queueLimit: 0
    });

    console.log('[database] Connection pool initialized');
    return this.pool;
  }

  async query(sql, params = []) {
    const pool = this.getPool();
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (err) {
      console.error('[database] Query failed:', err.message);
      console.error('[database] SQL:', sql);
      throw err;
    }
  }

  async testConnection() {
    const pool = this.getPool();
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  // Chat-related methods
  async createChatConversation(userId, title = null, personalityMode = 'helpful') {
    const conversationId = uuidv4();
    await this.ensureUserRecord(userId);

    await this.query(
      `INSERT INTO chat_conversations (id, user_id, title, personality_mode)
       VALUES (?, ?, ?, ?)`,
      [conversationId, userId, title, personalityMode]
    );

    return conversationId;
  }

  async saveChatMessage(conversationId, userId, role, content, personalityMode = null) {
    const messageId = uuidv4();
    await this.ensureUserRecord(userId);

    await this.query(
      `INSERT INTO chat_messages (id, conversation_id, user_id, role, content, personality_mode)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [messageId, conversationId, userId, role, content, personalityMode]
    );

    // Update conversation timestamp
    await this.query(
      `UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [conversationId]
    );

    return messageId;
  }

  async getChatConversations(userId, limit = 20) {
    const conversations = await this.query(
      `SELECT id, title, personality_mode, created_at, updated_at
       FROM chat_conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    return conversations;
  }

  async getChatMessages(conversationId, limit = 100) {
    const messages = await this.query(
      `SELECT id, role, content, personality_mode, created_at
       FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT ?`,
      [conversationId, limit]
    );

    return messages;
  }

  async deleteChatConversation(conversationId, userId) {
    // Verify ownership before deletion
    const [conversation] = await this.query(
      `SELECT user_id FROM chat_conversations WHERE id = ?`,
      [conversationId]
    );

    if (!conversation || conversation.user_id !== userId) {
      throw new Error('Conversation not found or access denied');
    }

    // Messages will be deleted automatically due to CASCADE constraint
    await this.query(
      `DELETE FROM chat_conversations WHERE id = ?`,
      [conversationId]
    );

    return true;
  }

  async updateConversationTitle(conversationId, userId, title) {
    // Verify ownership before update
    const [conversation] = await this.query(
      `SELECT user_id FROM chat_conversations WHERE id = ?`,
      [conversationId]
    );

    if (!conversation || conversation.user_id !== userId) {
      throw new Error('Conversation not found or access denied');
    }

    await this.query(
      `UPDATE chat_conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title, conversationId]
    );

    return true;
  }

  async ensureGuildRecord(guildId, guildName = null) {
    if (!guildId) return;
    await this.query(
      `INSERT INTO guilds (guild_id, guild_name)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name)`,
      [guildId, guildName]
    );
  }

  async ensureUserRecord(userId, username = null) {
    if (!userId) return;
    await this.query(
      `INSERT INTO users (user_id, username)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE username = VALUES(username)`,
      [userId, username]
    );
  }

  async getUserConsent(userId, guildId = null) { // guildId kept for API parity
    const rows = await this.query(
      'SELECT global_consent FROM users WHERE user_id = ?',
      [userId]
    );
    return Boolean(rows[0]?.global_consent);
  }

  async setUserConsent(userId, guildIdOrConsent, maybeConsent) {
    const consent = typeof maybeConsent === 'undefined'
      ? guildIdOrConsent
      : maybeConsent;

    await this.query(
      `INSERT INTO users (user_id, global_consent, consent_granted_at)
       VALUES (?, ?, IF(? = TRUE, NOW(), NULL))
       ON DUPLICATE KEY UPDATE
         global_consent = VALUES(global_consent),
         consent_granted_at = IF(VALUES(global_consent) = TRUE, NOW(), consent_granted_at),
         updated_at = NOW()`,
      [userId, consent ? 1 : 0, consent ? 1 : 0]
    );
  }

  async getSheetsConsent(userId, guildId) {
    const rows = await this.query(
      `SELECT sheets_consent, sheet_id
       FROM user_guilds
       WHERE user_id = ? AND guild_id = ?`,
      [userId, guildId]
    );

    if (rows.length === 0) {
      return { sheets_consent: false, sheet_id: null };
    }

    return {
      sheets_consent: Boolean(rows[0].sheets_consent),
      sheet_id: rows[0].sheet_id
    };
  }

  async setSheetsConsent(userId, guildId, consent, sheetId = null) {
    await this.ensureUserRecord(userId);
    await this.ensureGuildRecord(guildId);

    await this.query(
      `INSERT INTO user_guilds (user_id, guild_id, sheets_consent, sheet_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         sheets_consent = VALUES(sheets_consent),
         sheet_id = VALUES(sheet_id)`,
      [userId, guildId, consent ? 1 : 0, sheetId]
    );
  }

  async saveMemory(userId, guildId, note, tags = [], context = {}) {
    await this.ensureUserRecord(userId);
    if (guildId) await this.ensureGuildRecord(guildId);

    const id = uuidv4();
    await this.query(
      `INSERT INTO memories (id, user_id, guild_id, note, tags, context)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, guildId || null, note, JSON.stringify(tags), JSON.stringify(context)]
    );

    return {
      id,
      userId,
      guildId,
      note,
      tags,
      context,
      createdAt: new Date().toISOString()
    };
  }

  async getMemories(userId, guildId, limit = 25) {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 25;
    const rows = await this.query(
      `SELECT id, note, tags, context, created_at
       FROM memories
       WHERE user_id = ? AND guild_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, guildId || null, safeLimit]
    );

    return rows.map(row => ({
      id: row.id,
      note: row.note,
      tags: row.tags ? JSON.parse(row.tags) : [],
      context: row.context ? JSON.parse(row.context) : {},
      createdAt: row.created_at
    }));
  }

  async deleteMemory(userId, guildId, memoryId) {
    const result = await this.query(
      `DELETE FROM memories WHERE id = ? AND user_id = ? AND guild_id = ?`,
      [memoryId, userId, guildId || null]
    );
    return result.affectedRows > 0;
  }

  async deleteAllMemories(userId, guildId) {
    const result = await this.query(
      `DELETE FROM memories WHERE user_id = ? AND guild_id = ?`,
      [userId, guildId || null]
    );
    return result.affectedRows;
  }

  async logImageGeneration({
    userId,
    guildId = null,
    channelId = null,
    prompt,
    enhancedPrompt = null,
    style = 'standard',
    rating = 'default',
    success = true,
    errorMessage = null,
    imageUrl = null
  }) {
    await this.ensureUserRecord(userId);
    if (guildId) await this.ensureGuildRecord(guildId);

    await this.query(
      `INSERT INTO image_generation_log
       (user_id, guild_id, channel_id, prompt, enhanced_prompt, style, rating, success, error_message, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        guildId || null,
        channelId || null,
        prompt,
        enhancedPrompt,
        style,
        rating,
        success ? 1 : 0,
        errorMessage,
        imageUrl
      ]
    );
  }

  async getImageStats(userId) {
    const [totals] = await this.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
         COUNT(DISTINCT style) AS unique_styles
       FROM image_generation_log
       WHERE user_id = ?`,
      [userId]
    );

    return {
      total: totals?.total || 0,
      successful: totals?.successful || 0,
      unique_styles: totals?.unique_styles || 0
    };
  }

  // Stats tracking methods
  async recordStatsEvent({
    eventType,
    eventCategory,
    userId = null,
    guildId = null,
    channelId = null,
    sessionId = null,
    eventData = {},
    metadata = {}
  }) {
    await this.ensureUserRecord(userId);
    if (guildId) await this.ensureGuildRecord(guildId);

    await this.query(
      `INSERT INTO stats_events
       (event_type, event_category, user_id, guild_id, channel_id, session_id, event_data, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        eventCategory,
        userId || null,
        guildId || null,
        channelId || null,
        sessionId || null,
        JSON.stringify(eventData),
        JSON.stringify(metadata)
      ]
    );
  }

  async getStatsEvents({
    eventType = null,
    eventCategory = null,
    userId = null,
    guildId = null,
    startDate = null,
    endDate = null,
    limit = 1000,
    offset = 0
  }) {
    let conditions = [];
    let params = [];

    if (eventType) {
      conditions.push('event_type = ?');
      params.push(eventType);
    }

    if (eventCategory) {
      conditions.push('event_category = ?');
      params.push(eventCategory);
    }

    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    if (guildId) {
      conditions.push('guild_id = ?');
      params.push(guildId);
    }

    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const events = await this.query(
      `SELECT id, event_type, event_category, user_id, guild_id, channel_id, session_id,
              event_data, metadata, timestamp
       FROM stats_events
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return events.map(event => ({
      ...event,
      eventData: event.event_data ? JSON.parse(event.event_data) : {},
      metadata: event.metadata ? JSON.parse(event.metadata) : {}
    }));
  }

  async getStatsAggregates({
    eventType = null,
    eventCategory = null,
    userId = null,
    guildId = null,
    startDate = null,
    endDate = null,
    groupBy = 'day' // 'day', 'week', 'month'
  }) {
    let conditions = [];
    let params = [];
    let groupByClause = '';
    let selectFields = '';

    if (eventType) {
      conditions.push('event_type = ?');
      params.push(eventType);
    }

    if (eventCategory) {
      conditions.push('event_category = ?');
      params.push(eventCategory);
    }

    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    if (guildId) {
      conditions.push('guild_id = ?');
      params.push(guildId);
    }

    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    switch (groupBy) {
      case 'week':
        groupByClause = 'GROUP BY YEAR(timestamp), WEEK(timestamp)';
        selectFields = `DATE_FORMAT(timestamp, '%Y-%u') as period,
                        MIN(timestamp) as period_start,
                        MAX(timestamp) as period_end`;
        break;
      case 'month':
        groupByClause = 'GROUP BY YEAR(timestamp), MONTH(timestamp)';
        selectFields = `DATE_FORMAT(timestamp, '%Y-%m') as period,
                        MIN(timestamp) as period_start,
                        MAX(timestamp) as period_end`;
        break;
      default: // 'day'
        groupByClause = 'GROUP BY DATE(timestamp)';
        selectFields = `DATE(timestamp) as period,
                        MIN(timestamp) as period_start,
                        MAX(timestamp) as period_end`;
    }

    const aggregates = await this.query(
      `SELECT
         ${selectFields},
         event_type,
         event_category,
         COUNT(*) as count,
         COUNT(DISTINCT user_id) as unique_users,
         COUNT(DISTINCT guild_id) as unique_guilds,
         JSON_EXTRACT(event_data, '$.value') as value
       FROM stats_events
       ${whereClause}
       ${groupByClause}
       ORDER BY period DESC`,
      params
    );

    return aggregates.map(agg => ({
      ...agg,
      value: agg.value ? parseFloat(agg.value) : null
    }));
  }

  async getStatsSummary({
    startDate = null,
    endDate = null,
    userId = null,
    guildId = null
  }) {
    let conditions = [];
    let params = [];

    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    if (guildId) {
      conditions.push('guild_id = ?');
      params.push(guildId);
    }

    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get top event types
    const topEventTypes = await this.query(
      `SELECT event_type, COUNT(*) as count
       FROM stats_events
       ${whereClause}
       GROUP BY event_type
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    // Get top categories
    const topCategories = await this.query(
      `SELECT event_category, COUNT(*) as count
       FROM stats_events
       ${whereClause}
       GROUP BY event_category
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    // Get total events
    const [totalEvents] = await this.query(
      `SELECT COUNT(*) as total_events, COUNT(DISTINCT user_id) as unique_users
       FROM stats_events
       ${whereClause}`,
      params
    );

    return {
      totalEvents: totalEvents?.total_events || 0,
      uniqueUsers: totalEvents?.unique_users || 0,
      topEventTypes,
      topCategories
    };
  }

  async updateDailyAggregates(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Clear existing aggregates for the date
    await this.query('DELETE FROM stats_daily_aggregates WHERE date = ?', [targetDate]);

    // Insert new aggregates
    await this.query(`
      INSERT INTO stats_daily_aggregates
      (date, event_type, event_category, user_id, guild_id, count, unique_users, unique_guilds, metadata)
      SELECT
        DATE(timestamp) as date,
        event_type,
        event_category,
        user_id,
        guild_id,
        COUNT(*) as count,
        COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) as unique_users,
        COUNT(DISTINCT CASE WHEN guild_id IS NOT NULL THEN guild_id END) as unique_guilds,
        JSON_OBJECT('last_updated', NOW())
      FROM stats_events
      WHERE DATE(timestamp) = ?
      GROUP BY DATE(timestamp), event_type, event_category, user_id, guild_id
    `, [targetDate]);
  }

  async saveSnailStat(entry) {
    await this.ensureUserRecord(entry.userId, entry.username);
    if (entry.guildId) await this.ensureGuildRecord(entry.guildId, entry.guildName);

    const result = await this.query(
      `INSERT INTO snail_stats
       (user_id, guild_id, screenshot_url, hp, atk, def, rush, fame, tech, art, civ, fth, confidence, analysis_text, saved_to_sheet)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.userId,
        entry.guildId || null,
        entry.screenshotUrl || null,
        entry.stats?.hp || null,
        entry.stats?.atk || null,
        entry.stats?.def || null,
        entry.stats?.rush || null,
        entry.stats?.fame || null,
        entry.stats?.tech || null,
        entry.stats?.art || null,
        entry.stats?.civ || null,
        entry.stats?.fth || null,
        JSON.stringify(entry.confidence || {}),
        entry.analysisText || null,
        entry.savedToSheet ? 1 : 0
      ]
    );

    return result.insertId;
  }

  async getRecentSnailStats(userId, guildId, limit = 5) {
    const rows = await this.query(
      `SELECT * FROM snail_stats
       WHERE user_id = ? AND (? IS NULL OR guild_id = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, guildId || null, guildId || null, limit]
    );

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      guildId: row.guild_id,
      screenshotUrl: row.screenshot_url,
      stats: {
        hp: row.hp,
        atk: row.atk,
        def: row.def,
        rush: row.rush,
        fame: row.fame,
        tech: row.tech,
        art: row.art,
        civ: row.civ,
        fth: row.fth
      },
      confidence: row.confidence ? JSON.parse(row.confidence) : {},
      analysisText: row.analysis_text,
      savedToSheet: Boolean(row.saved_to_sheet),
      createdAt: row.created_at
    }));
  }

  async markSnailStatSaved(statId) {
    await this.query(
      `UPDATE snail_stats SET saved_to_sheet = 1 WHERE id = ?`,
      [statId]
    );
  }

  async recordPersonalityMetric({ userId, guildId = null, metricType, metricValue }) {
    await this.ensureUserRecord(userId);
    if (guildId) await this.ensureGuildRecord(guildId);

    await this.query(
      `INSERT INTO personality_metrics (user_id, guild_id, metric_type, metric_value)
       VALUES (?, ?, ?, ?)`,
      [userId, guildId || null, metricType, JSON.stringify(metricValue || {})]
    );
  }

  async trackPersonalityUsage(userId, mode, catchphrase = null) {
    await this.recordPersonalityMetric({
      userId,
      metricType: 'response',
      metricValue: { mode, catchphrase }
    });
  }

  async createTables() {
    const pool = this.getPool();

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(20) PRIMARY KEY,
        username VARCHAR(100),
        global_consent TINYINT(1) DEFAULT 0,
        consent_granted_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS guilds (
        guild_id VARCHAR(20) PRIMARY KEY,
        guild_name VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_guilds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        sheets_consent TINYINT(1) DEFAULT 0,
        sheet_id VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_guild (user_id, guild_id),
        CONSTRAINT fk_user_guild_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_user_guild_guild FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20),
        note TEXT NOT NULL,
        tags JSON,
        context JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_memories_user_guild (user_id, guild_id),
        INDEX idx_memories_created (created_at),
        CONSTRAINT fk_memories_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_memories_guild FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS mode_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(20),
        channel_id VARCHAR(20),
        category_id VARCHAR(20),
        thread_id VARCHAR(20),
        config JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_location (guild_id, channel_id, category_id, thread_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS snail_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20),
        screenshot_url VARCHAR(500),
        hp INT,
        atk INT,
        def INT,
        rush INT,
        fame INT,
        tech INT,
        art INT,
        civ INT,
        fth INT,
        confidence JSON,
        analysis_text TEXT,
        saved_to_sheet TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_snail_user (user_id),
        INDEX idx_snail_guild (guild_id),
        CONSTRAINT fk_snail_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_snail_guild FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS personality_metrics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(20),
        guild_id VARCHAR(20),
        metric_type VARCHAR(50),
        metric_value JSON,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_personality_user (user_id),
        CONSTRAINT fk_personality_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_personality_guild FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        title VARCHAR(255),
        personality_mode VARCHAR(50) DEFAULT 'helpful',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_chat_user (user_id),
        INDEX idx_chat_created (created_at),
        CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        conversation_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(20) NOT NULL,
        role ENUM('user', 'assistant', 'system') NOT NULL,
        content TEXT NOT NULL,
        personality_mode VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_message_conversation (conversation_id),
        INDEX idx_message_user (user_id),
        INDEX idx_message_created (created_at),
        CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_message_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS image_generation_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20),
        channel_id VARCHAR(20),
        prompt TEXT NOT NULL,
        enhanced_prompt TEXT,
        style VARCHAR(50),
        rating VARCHAR(20),
        success TINYINT(1) DEFAULT 1,
        error_message TEXT,
        image_url VARCHAR(500),
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_image_user (user_id),
        INDEX idx_image_guild (guild_id),
        INDEX idx_image_success (success),
        CONSTRAINT fk_image_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_image_guild FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Stats tracking system - unified events table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stats_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        event_category VARCHAR(50) NOT NULL,
        user_id VARCHAR(20),
        guild_id VARCHAR(20),
        channel_id VARCHAR(20),
        session_id VARCHAR(36),
        event_data JSON,
        metadata JSON,
        timestamp DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_stats_event_type (event_type, timestamp),
        INDEX idx_stats_category (event_category, timestamp),
        INDEX idx_stats_user (user_id, timestamp),
        INDEX idx_stats_guild (guild_id, timestamp),
        INDEX idx_stats_session (session_id),
        INDEX idx_stats_timestamp (timestamp),
        CONSTRAINT fk_stats_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_stats_guild FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Daily aggregations table for performance
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stats_daily_aggregates (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        event_category VARCHAR(50) NOT NULL,
        user_id VARCHAR(20),
        guild_id VARCHAR(20),
        count INT DEFAULT 0,
        sum_value DECIMAL(10,2) DEFAULT 0,
        avg_value DECIMAL(10,2) DEFAULT 0,
        min_value DECIMAL(10,2) DEFAULT NULL,
        max_value DECIMAL(10,2) DEFAULT NULL,
        unique_users INT DEFAULT 0,
        unique_guilds INT DEFAULT 0,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_daily_aggregate (date, event_type, event_category, user_id, guild_id),
        INDEX idx_daily_date (date),
        INDEX idx_daily_type (event_type),
        INDEX idx_daily_category (event_category),
        INDEX idx_daily_user (user_id),
        INDEX idx_daily_guild (guild_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Add indexes to existing tables for better stats performance
    try {
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages (created_at)`);
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_personality_metrics_timestamp ON personality_metrics (recorded_at)`);
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_snail_stats_timestamp ON snail_stats (created_at)`);
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_image_log_timestamp ON image_generation_log (generated_at)`);
      await pool.execute(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories (created_at)`);
    } catch (err) {
      // Indexes might already exist, continue
      console.log('[database] Some indexes may already exist, continuing...');
    }
  }
}

module.exports = new Database();
