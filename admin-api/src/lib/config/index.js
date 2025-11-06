"use strict";

/**
 * Centralized Configuration Module
 * 
 * Loads and validates all environment variables in a single place.
 * Provides type-safe access to configuration with defaults.
 * 
 * Usage:
 *   const config = require('./lib/config');
 *   const clientId = config.discord.clientId;
 */

const { ConfigurationError } = require('../errors');
const { logger } = require('../logger');

/**
 * Parse comma-separated list from environment variable
 */
function parseList(value, defaults = []) {
  const list = (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length ? list : defaults;
}

/**
 * Parse comma-separated ID list from environment variable
 */
function parseIdList(value) {
  return parseList(value, []);
}

/**
 * Validate configuration values
 */
function validateConfig(rawConfig) {
  const errors = [];
  const warnings = [];

  // Required validations
  if (!rawConfig.discord.clientId) {
    errors.push('DISCORD_CLIENT_ID is required');
  } else if (!/^\d+$/.test(rawConfig.discord.clientId)) {
    errors.push('DISCORD_CLIENT_ID must be a valid Discord application ID (numeric)');
  }

  if (!rawConfig.discord.clientSecret) {
    errors.push('DISCORD_CLIENT_SECRET is required');
  }

  if (!rawConfig.session.secret) {
    errors.push('SESSION_SECRET is required');
  } else if (rawConfig.session.secret.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters long');
  }

  // JWT_SECRET can fall back to SESSION_SECRET, so check if either is set
  if (!rawConfig.jwt.secret) {
    errors.push('JWT_SECRET or SESSION_SECRET is required');
  } else if (rawConfig.jwt.secret.length < 32) {
    errors.push('JWT_SECRET (or SESSION_SECRET if JWT_SECRET not set) must be at least 32 characters long');
  }

  if (!rawConfig.database.url) {
    errors.push('DATABASE_URL is required');
  } else if (!rawConfig.database.url.startsWith('postgresql://') && 
             !rawConfig.database.url.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
  }

  // Port validation
  if (rawConfig.server.port < 1 || rawConfig.server.port > 65535) {
    errors.push('PORT must be a valid port number between 1 and 65535');
  }

  // CORS origins validation
  if (rawConfig.server.corsOrigins.length > 0) {
    for (const origin of rawConfig.server.corsOrigins) {
      if (!origin.startsWith('http://') && 
          !origin.startsWith('https://') && 
          origin !== '*') {
        warnings.push(`CORS_ALLOW_ORIGIN contains potentially invalid origin: ${origin}`);
      }
    }
  }

  // OpenAI API key validation (optional but warn if format looks wrong)
  if (rawConfig.openai.apiKey && !rawConfig.openai.apiKey.startsWith('sk-')) {
    warnings.push('OPENAI_API_KEY should start with "sk-"');
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Configuration warnings:', { warnings });
  }

  // Throw error if there are critical issues
  if (errors.length > 0) {
    logger.error('Configuration validation failed:', { errors });
    throw new ConfigurationError(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  logger.info('Configuration validated successfully');
  return rawConfig;
}

/**
 * Load and validate configuration from environment variables
 */
function loadConfig() {
  const DEFAULT_ALLOWED_ORIGINS = [
    "https://admin.slimyai.xyz",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ];

  const DEFAULT_REDIRECT_URI = "https://admin.slimyai.xyz/api/auth/callback";
  const DEFAULT_SCOPES = "identify guilds";

  const rawConfig = {
    // Server configuration
    server: {
      port: Number(process.env.PORT || 3080),
      serviceName: process.env.ADMIN_API_SERVICE_NAME || "slimy-admin-api",
      version: process.env.ADMIN_API_VERSION || "dev",
      nodeEnv: process.env.NODE_ENV || "development",
      corsOrigins: parseList(process.env.CORS_ALLOW_ORIGIN, DEFAULT_ALLOWED_ORIGINS),
    },

    // Session configuration
    session: {
      secret: (process.env.SESSION_SECRET || "").trim(),
      cookieDomain: (process.env.COOKIE_DOMAIN || ".slimyai.xyz").trim(),
      cookieName: "slimy_admin",
      maxAgeSec: 60 * 60 * 2, // 2 hours
    },

    // JWT configuration
    jwt: {
      secret: (process.env.JWT_SECRET || process.env.SESSION_SECRET || "").trim(),
    },

    // Discord OAuth configuration
    discord: {
      clientId: (process.env.DISCORD_CLIENT_ID || "").trim(),
      clientSecret: (process.env.DISCORD_CLIENT_SECRET || "").trim(),
      botToken: (process.env.DISCORD_BOT_TOKEN || "").trim(),
      redirectUri: (process.env.DISCORD_REDIRECT_URI || "").trim() || DEFAULT_REDIRECT_URI,
      scopes: (process.env.DISCORD_OAUTH_SCOPES || "").trim() || DEFAULT_SCOPES,
      apiBaseUrl: "https://discord.com/api/v10",
      tokenUrl: "https://discord.com/api/oauth2/token",
    },

    // Database configuration
    database: {
      url: (process.env.DATABASE_URL || "").trim(),
      logLevel: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    },

    // OpenAI configuration
    openai: {
      apiKey: (process.env.OPENAI_API_KEY || "").trim(),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },

    // Google Sheets configuration
    google: {
      credentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      sheetsScopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      statsSheetId: (process.env.STATS_SHEET_ID || "").trim(),
      statsBaselineTitle: process.env.STATS_BASELINE_TITLE || "Baseline (10-24-25)",
    },

    // Redis/Cache configuration
    cache: {
      redisUrl: (process.env.REDIS_URL || "").trim(),
      enabled: Boolean(process.env.REDIS_URL),
      ttl: 300, // 5 minutes
      staleTtl: 600, // 10 minutes
      keyPrefix: "admin:",
      retryAttempts: 3,
      retryDelay: 1000,
    },

    // Redis/Queue configuration
    redis: {
      url: (process.env.REDIS_URL || "").trim(),
      enabled: Boolean(process.env.REDIS_URL),
    },

    // CDN/Static Assets configuration
    cdn: {
      enabled: Boolean(process.env.CDN_ENABLED || process.env.CDN_URL),
      url: (process.env.CDN_URL || "").trim(),
      staticMaxAge: process.env.STATIC_MAX_AGE || 31536000, // 1 year in seconds
      uploadsMaxAge: process.env.UPLOADS_MAX_AGE || 86400, // 1 day for uploads
    },

    // Sentry configuration
    sentry: {
      dsn: (process.env.SENTRY_DSN || "").trim(),
      enabled: Boolean(process.env.SENTRY_DSN),
      environment: process.env.NODE_ENV || "development",
      release: process.env.ADMIN_API_VERSION || "dev",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    },

    // User role configuration
    roles: {
      adminUserIds: parseIdList(process.env.ADMIN_USER_IDS),
      clubUserIds: parseIdList(process.env.CLUB_USER_IDS),
    },

    // Permission flags
    permissions: {
      administrator: 0x8n,
      manageGuild: 0x20n,
    },
  };

  return validateConfig(rawConfig);
}

// Load and export configuration
const config = loadConfig();

module.exports = config;

