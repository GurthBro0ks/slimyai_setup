/**
 * Environment variable validation for Admin API
 * Ensures all required environment variables are present and valid
 */

const { ConfigurationError } = require('./errors');
const { logger } = require('./logger');

/**
 * Required environment variables for the Admin API
 */
const REQUIRED_ENV_VARS = [
  'SESSION_SECRET',
  'JWT_SECRET',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DATABASE_URL'
];

/**
 * Optional but recommended environment variables
 */
const RECOMMENDED_ENV_VARS = [
  'DISCORD_BOT_TOKEN',
  'OPENAI_API_KEY',
  'ADMIN_USER_IDS',
  'CLUB_USER_IDS'
];

/**
 * Environment variable validation rules
 */
const VALIDATION_RULES = {
  SESSION_SECRET: (value) => {
    if (value.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters long');
    }
  },
  JWT_SECRET: (value) => {
    if (value.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
  },
  DISCORD_CLIENT_ID: (value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error('DISCORD_CLIENT_ID must be a valid Discord application ID (numeric)');
    }
  },
  DATABASE_URL: (value) => {
    if (!value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
    }
  },
  PORT: (value) => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be a valid port number between 1 and 65535');
    }
  },
  CORS_ALLOW_ORIGIN: (value) => {
    // Allow comma-separated list of origins
    const origins = value.split(',').map(origin => origin.trim());
    for (const origin of origins) {
      if (!origin.startsWith('http://') && !origin.startsWith('https://') && origin !== '*') {
        throw new Error(`CORS_ALLOW_ORIGIN contains invalid origin: ${origin}`);
      }
    }
  }
};

/**
 * Validate a single environment variable
 * @param {string} name - Environment variable name
 * @param {string} value - Environment variable value
 * @param {boolean} required - Whether the variable is required
 */
function validateEnvVar(name, value, required = false) {
  if (!value || value.trim() === '') {
    if (required) {
      throw new ConfigurationError(`${name} is required but not set`);
    }
    return; // Optional variable not set, skip validation
  }

  const validator = VALIDATION_RULES[name];
  if (validator) {
    try {
      validator(value);
    } catch (error) {
      throw new ConfigurationError(`${name}: ${error.message}`);
    }
  }
}

/**
 * Validate all environment variables
 * @throws {ConfigurationError} If validation fails
 */
function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // Check required variables
  for (const envVar of REQUIRED_ENV_VARS) {
    try {
      validateEnvVar(envVar, process.env[envVar], true);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Check recommended variables
  for (const envVar of RECOMMENDED_ENV_VARS) {
    try {
      validateEnvVar(envVar, process.env[envVar], false);
    } catch (error) {
      warnings.push(error.message);
    }
  }

  // Check optional variables with validation rules
  for (const [envVar, validator] of Object.entries(VALIDATION_RULES)) {
    if (!REQUIRED_ENV_VARS.includes(envVar) && process.env[envVar]) {
      try {
        validateEnvVar(envVar, process.env[envVar], false);
      } catch (error) {
        warnings.push(error.message);
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Environment validation warnings:', { warnings });
  }

  // Throw error if there are critical issues
  if (errors.length > 0) {
    logger.error('Environment validation failed:', { errors });
    throw new ConfigurationError(`Environment validation failed:\n${errors.join('\n')}`);
  }

  logger.info('Environment validation passed');
}

/**
 * Get environment summary for debugging
 * @returns {object} Environment summary (without sensitive values)
 */
function getEnvironmentSummary() {
  const summary = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    ADMIN_API_SERVICE_NAME: process.env.ADMIN_API_SERVICE_NAME,
    ADMIN_API_VERSION: process.env.ADMIN_API_VERSION,
    DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]',
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ? '[SET]' : '[NOT SET]',
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ? '[SET]' : '[NOT SET]',
    SESSION_SECRET: process.env.SESSION_SECRET ? '[SET]' : '[NOT SET]',
    JWT_SECRET: process.env.JWT_SECRET ? '[SET]' : '[NOT SET]',
    CORS_ALLOW_ORIGIN: process.env.CORS_ALLOW_ORIGIN,
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS ? '[SET]' : '[NOT SET]',
    CLUB_USER_IDS: process.env.CLUB_USER_IDS ? '[SET]' : '[NOT SET]',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]',
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN ? '[SET]' : '[NOT SET]'
  };

  return summary;
}

module.exports = {
  validateEnvironment,
  getEnvironmentSummary,
  REQUIRED_ENV_VARS,
  RECOMMENDED_ENV_VARS
};
