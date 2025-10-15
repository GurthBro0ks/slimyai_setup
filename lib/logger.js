// lib/logger.js - Structured JSON logging system
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

class Logger {
  constructor() {
    this.logFile = path.join(logsDir, 'combined.log');
    this.errorFile = path.join(logsDir, 'error.log');
  }

  _write(level, message, data = {}) {
    if (LOG_LEVELS[level] < LOG_LEVEL) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    // Write to appropriate files
    try {
      fs.appendFileSync(this.logFile, logLine);
      if (level === 'ERROR' || level === 'CRITICAL') {
        fs.appendFileSync(this.errorFile, logLine);
      }
    } catch (err) {
      // If file writing fails, at least log to console
      console.error('[logger] Failed to write to log file:', err.message);
    }

    // Console output with colors
    const colors = {
      DEBUG: '\x1b[36m',   // Cyan
      INFO: '\x1b[32m',    // Green
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      CRITICAL: '\x1b[35m' // Magenta
    };

    const color = colors[level] || '\x1b[0m';
    const reset = '\x1b[0m';

    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    console.log(`${color}[${timestamp}] ${level}:${reset} ${message}${dataStr}`);
  }

  debug(message, data) { this._write('DEBUG', message, data); }
  info(message, data) { this._write('INFO', message, data); }
  warn(message, data) { this._write('WARN', message, data); }
  error(message, data) { this._write('ERROR', message, data); }
  critical(message, data) { this._write('CRITICAL', message, data); }
}

module.exports = new Logger();
