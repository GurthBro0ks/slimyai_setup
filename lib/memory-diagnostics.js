// lib/memory-diagnostics.js
// Enhanced logging and diagnostics wrapper for memory.js
// DO NOT MODIFY CORE MEMORY.JS - This is a diagnostic overlay

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'memory-diagnostics.log');
const DEBUG_MODE = process.env.MEMORY_DEBUG === '1';

// Log levels
const LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

class DiagnosticLogger {
  constructor() {
    this.operations = [];
    this.startTime = Date.now();
  }

  log(level, operation, data) {
    const timestamp = new Date().toISOString();
    const duration = data.duration ? `${data.duration}ms` : '-';

    const entry = {
      timestamp,
      level,
      operation,
      duration,
      ...data
    };

    this.operations.push(entry);

    // Console output if debug mode
    if (DEBUG_MODE) {
      const color = {
        DEBUG: '\x1b[36m',  // Cyan
        INFO: '\x1b[32m',   // Green
        WARN: '\x1b[33m',   // Yellow
        ERROR: '\x1b[31m'   // Red
      }[level] || '';

      console.log(`${color}[memory-diag ${level}]${'\x1b[0m'} ${operation} (${duration})`, data.details || '');
    }

    // Write to file
    const logLine = `${timestamp} [${level}] ${operation} (${duration}) ${JSON.stringify(data.details || {})}\n`;
    try {
      fs.appendFileSync(LOG_FILE, logLine);
    } catch (err) {
      // Silent fail on log write errors
    }
  }

  debug(operation, details) {
    this.log(LEVELS.DEBUG, operation, { details });
  }

  info(operation, details) {
    this.log(LEVELS.INFO, operation, { details });
  }

  warn(operation, details) {
    this.log(LEVELS.WARN, operation, { details });
  }

  error(operation, details, error) {
    this.log(LEVELS.ERROR, operation, {
      details,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  // Performance tracking
  startTimer() {
    return Date.now();
  }

  endTimer(start) {
    return Date.now() - start;
  }

  // Statistics
  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;

    const byOperation = {};
    const byLevel = {};

    this.operations.forEach(op => {
      // Count by operation type
      byOperation[op.operation] = (byOperation[op.operation] || 0) + 1;

      // Count by level
      byLevel[op.level] = (byLevel[op.level] || 0) + 1;
    });

    // Calculate average duration per operation
    const avgDuration = {};
    const durations = {};

    this.operations.forEach(op => {
      if (op.duration && op.duration !== '-') {
        const ms = parseFloat(op.duration);
        if (!durations[op.operation]) {
          durations[op.operation] = [];
        }
        durations[op.operation].push(ms);
      }
    });

    Object.keys(durations).forEach(operation => {
      const arr = durations[operation];
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      avgDuration[operation] = avg.toFixed(2) + 'ms';
    });

    return {
      uptime: `${(uptime / 1000).toFixed(1)}s`,
      totalOperations: this.operations.length,
      byOperation,
      byLevel,
      avgDuration,
      errors: this.operations.filter(op => op.level === LEVELS.ERROR).length
    };
  }

  // Export diagnostics report
  exportReport() {
    const stats = this.getStats();
    const recentOps = this.operations.slice(-50);  // Last 50 operations

    const report = {
      generated: new Date().toISOString(),
      stats,
      recentOperations: recentOps,
      logFile: LOG_FILE
    };

    const reportFile = path.join(process.cwd(), 'memory-diagnostics-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    return reportFile;
  }
}

// Singleton instance
const logger = new DiagnosticLogger();

// Export wrapped memory functions with diagnostics
function wrapMemoryModule(memModule) {
  const wrapped = {};

  Object.keys(memModule).forEach(key => {
    if (typeof memModule[key] === 'function') {
      wrapped[key] = async function(...args) {
        const start = logger.startTimer();
        const operation = key;

        try {
          logger.debug(operation, { args: JSON.stringify(args).slice(0, 200) });

          const result = await memModule[key](...args);

          const duration = logger.endTimer(start);
          logger.info(operation, {
            duration,
            success: true,
            resultType: typeof result
          });

          return result;
        } catch (error) {
          const duration = logger.endTimer(start);
          logger.error(operation, {
            duration,
            args: JSON.stringify(args).slice(0, 200)
          }, error);

          throw error;  // Re-throw to maintain original behavior
        }
      };
    } else {
      wrapped[key] = memModule[key];
    }
  });

  // Add diagnostic methods
  wrapped._diagnostics = {
    getStats: () => logger.getStats(),
    exportReport: () => logger.exportReport(),
    clearLog: () => {
      try {
        fs.writeFileSync(LOG_FILE, '');
        logger.operations = [];
      } catch (err) {
        // Silent fail
      }
    }
  };

  return wrapped;
}

module.exports = {
  wrapMemoryModule,
  logger
};
