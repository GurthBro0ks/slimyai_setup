/**
 * Environment variable validation for SlimyAI Discord Bot
 * Ensures all required environment variables are present and valid
 */

const { logger } = require('./logger');

/**
 * Required environment variables for the Discord Bot
 */
const REQUIRED_ENV_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID'
];

/**
 * Optional but recommended environment variables
 */
const RECOMMENDED_ENV_VARS = [
  'OPENAI_API_KEY',
  'DB_HOST',
  'DB_PASSWORD',
  'DB_USER',
  'DB_NAME',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'SHEETS_PARENT_FOLDER_ID'
];

/**
 * Environment variable validation rules
 */
const VALIDATION_RULES = {
  DISCORD_TOKEN: (value) => {
    if (value.length < 50) {
      throw new Error('DISCORD_TOKEN appears to be invalid (too short)');
    }
    if (!value.startsWith('Bot ') && !value.startsWith('M')) {
      console.warn('DISCORD_TOKEN should typically start with "Bot " or "M"');
    }
  },
  DISCORD_CLIENT_ID: (value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error('DISCORD_CLIENT_ID must be a valid Discord application ID (numeric)');
    }
  },
  DISCORD_GUILD_ID: (value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error('DISCORD_GUILD_ID must be a valid Discord guild ID (numeric)');
    }
  },
  DB_PORT: (value) => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('DB_PORT must be a valid port number between 1 and 65535');
    }
  },
  SHEETS_PARENT_FOLDER_ID: (value) => {
    if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
      console.warn('SHEETS_PARENT_FOLDER_ID should be a valid Google Drive folder ID');
    }
  },
  OPENAI_API_KEY: (value) => {
    if (!value.startsWith('sk-')) {
      throw new Error('OPENAI_API_KEY should start with "sk-"');
    }
    if (value.length < 50) {
      throw new Error('OPENAI_API_KEY appears to be invalid (too short)');
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
      throw new Error(`${name} is required but not set`);
    }
    return; // Optional variable not set, skip validation
  }

  const validator = VALIDATION_RULES[name];
  if (validator) {
    try {
      validator(value);
    } catch (error) {
      throw new Error(`${name}: ${error.message}`);
    }
  }
}

/**
 * Validate all environment variables
 * @throws {Error} If validation fails
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
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
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
    DISCORD_TOKEN: process.env.DISCORD_TOKEN ? '[SET]' : '[NOT SET]',
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ? '[SET]' : '[NOT SET]',
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID ? '[SET]' : '[NOT SET]',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]',
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]',
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    SHEETS_PARENT_FOLDER_ID: process.env.SHEETS_PARENT_FOLDER_ID ? '[SET]' : '[NOT SET]',
    LOG_LEVEL: process.env.LOG_LEVEL
  };

  return summary;
}

module.exports = {
  validateEnvironment,
  getEnvironmentSummary,
  REQUIRED_ENV_VARS,
  RECOMMENDED_ENV_VARS
};
