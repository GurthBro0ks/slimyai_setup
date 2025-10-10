const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor() {
    this.pool = null;
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

  async getUserConsent(userId) {
    const rows = await this.query(
      'SELECT global_consent FROM users WHERE user_id = ?',
      [userId]
    );
    return Boolean(rows[0]?.global_consent);
  }

  async setUserConsent(userId, consent) {
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
    const rows = await this.query(
      `SELECT id, note, tags, context, created_at
       FROM memories
       WHERE user_id = ? AND guild_id = ?
       ORDER BY created_at DESC
    LIMIT ${lim}`,
      [userId, guildId || null, limit]
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
  }
}

module.exports = new Database();
