// lib/metrics.js - Metrics tracking system for commands and errors
const metrics = {
  commands: new Map(),
  errors: new Map(),
  startTime: Date.now()
};

module.exports = {
  // Track command execution
  trackCommand(commandName, duration, success = true) {
    if (!metrics.commands.has(commandName)) {
      metrics.commands.set(commandName, {
        count: 0,
        successCount: 0,
        failCount: 0,
        totalTime: 0
      });
    }

    const stats = metrics.commands.get(commandName);
    stats.count++;
    if (success) stats.successCount++;
    else stats.failCount++;
    stats.totalTime += duration;
  },

  // Track errors
  trackError(type, message) {
    if (!metrics.errors.has(type)) {
      metrics.errors.set(type, { count: 0, lastSeen: null, messages: [] });
    }

    const errorStats = metrics.errors.get(type);
    errorStats.count++;
    errorStats.lastSeen = new Date().toISOString();
    errorStats.messages.push({
      message,
      timestamp: new Date().toISOString()
    });

    // Keep only last 10 error messages
    if (errorStats.messages.length > 10) {
      errorStats.messages.shift();
    }
  },

  // Get all statistics
  getStats() {
    const stats = {
      uptime: Math.round((Date.now() - metrics.startTime) / 1000),
      commands: {},
      errors: {},
      summary: {
        totalCommands: 0,
        totalErrors: 0,
        successRate: 0
      }
    };

    // Process command stats
    let totalSuccess = 0;
    let totalFail = 0;

    for (const [cmd, data] of metrics.commands.entries()) {
      stats.commands[cmd] = {
        count: data.count,
        successCount: data.successCount,
        failCount: data.failCount,
        avgTime: Math.round(data.totalTime / data.count) + 'ms',
        successRate: Math.round((data.successCount / data.count) * 100) + '%'
      };
      totalSuccess += data.successCount;
      totalFail += data.failCount;
    }

    // Process error stats
    for (const [type, data] of metrics.errors.entries()) {
      stats.errors[type] = {
        count: data.count,
        lastSeen: data.lastSeen,
        recentMessages: data.messages.slice(-3)
      };
    }

    // Summary
    stats.summary.totalCommands = totalSuccess + totalFail;
    stats.summary.totalErrors = totalFail;
    stats.summary.successRate = totalSuccess + totalFail > 0
      ? Math.round((totalSuccess / (totalSuccess + totalFail)) * 100) + '%'
      : '100%';

    return stats;
  },

  // Reset all metrics
  reset() {
    metrics.commands.clear();
    metrics.errors.clear();
    metrics.startTime = Date.now();
  }
};
