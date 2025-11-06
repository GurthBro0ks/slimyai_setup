"use strict";

const { captureMessage, captureError } = require("./monitoring/sentry");
const logger = require("./logger");

// Alert thresholds and rules
const ALERT_THRESHOLDS = {
  // Error rate alerts
  errorRate: {
    warning: 5,    // 5% error rate
    critical: 10,  // 10% error rate
  },

  // Response time alerts (milliseconds)
  responseTime: {
    p95: {
      warning: 2000,   // 2 seconds
      critical: 5000,  // 5 seconds
    },
    p99: {
      warning: 5000,   // 5 seconds
      critical: 10000, // 10 seconds
    },
  },

  // Memory usage alerts (percentage)
  memoryUsage: {
    warning: 80,   // 80%
    critical: 90,  // 90%
  },

  // Database query time alerts (milliseconds)
  databaseQueryTime: {
    warning: 100,   // 100ms
    critical: 500,  // 500ms
  },

  // Health check failures
  healthCheckFailures: {
    consecutiveFailures: 3,
  },
};

// Alert state tracking
const alertStates = new Map();
const alertCooldowns = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function shouldTriggerAlert(alertKey, severity) {
  const now = Date.now();
  const cooldownKey = `${alertKey}_${severity}`;

  // Check if alert is in cooldown
  const lastTriggered = alertCooldowns.get(cooldownKey);
  if (lastTriggered && (now - lastTriggered) < ALERT_COOLDOWN_MS) {
    return false;
  }

  // Check if this is a new alert or severity escalation
  const currentState = alertStates.get(alertKey);
  if (!currentState || currentState.severity !== severity) {
    return true;
  }

  return false;
}

function triggerAlert(alertKey, severity, message, context = {}) {
  if (!shouldTriggerAlert(alertKey, severity)) {
    return;
  }

  // Update alert state
  alertStates.set(alertKey, {
    severity,
    triggeredAt: new Date(),
    message,
    context,
  });

  // Set cooldown
  alertCooldowns.set(`${alertKey}_${severity}`, Date.now());

  // Log alert
  logger[severity === "critical" ? "error" : "warn"]({
    alert: alertKey,
    severity,
    message,
    ...context,
  }, `ALERT: ${message}`);

  // Send to Sentry for tracking
  if (severity === "critical") {
    captureMessage(`CRITICAL ALERT: ${message}`, "error", {
      alert: alertKey,
      severity,
      ...context,
    });
  } else {
    captureMessage(`WARNING ALERT: ${message}`, "warning", {
      alert: alertKey,
      severity,
      ...context,
    });
  }

  // In a real implementation, this would also send to external alerting systems
  // like PagerDuty, Slack, email, etc.
}

function resolveAlert(alertKey) {
  const currentState = alertStates.get(alertKey);
  if (currentState) {
    logger.info({
      alert: alertKey,
      severity: currentState.severity,
      resolvedAfter: Date.now() - currentState.triggeredAt.getTime(),
    }, `ALERT RESOLVED: ${alertKey}`);

    alertStates.delete(alertKey);
  }
}

// Alert checkers
function checkErrorRate(metrics) {
  const errorRate = metrics.errorRatePercent;

  if (errorRate >= ALERT_THRESHOLDS.errorRate.critical) {
    triggerAlert("high_error_rate", "critical",
      `Critical error rate: ${errorRate.toFixed(2)}% (threshold: ${ALERT_THRESHOLDS.errorRate.critical}%)`,
      { errorRate, threshold: ALERT_THRESHOLDS.errorRate.critical }
    );
  } else if (errorRate >= ALERT_THRESHOLDS.errorRate.warning) {
    triggerAlert("high_error_rate", "warning",
      `High error rate: ${errorRate.toFixed(2)}% (threshold: ${ALERT_THRESHOLDS.errorRate.warning}%)`,
      { errorRate, threshold: ALERT_THRESHOLDS.errorRate.warning }
    );
  } else {
    resolveAlert("high_error_rate");
  }
}

function checkResponseTimes(metrics) {
  const p95 = metrics.responseTime.p95;
  const p99 = metrics.responseTime.p99;

  if (p99 >= ALERT_THRESHOLDS.responseTime.p99.critical) {
    triggerAlert("slow_response_time_p99", "critical",
      `Critical P99 response time: ${p99}ms (threshold: ${ALERT_THRESHOLDS.responseTime.p99.critical}ms)`,
      { p99, threshold: ALERT_THRESHOLDS.responseTime.p99.critical }
    );
  } else if (p99 >= ALERT_THRESHOLDS.responseTime.p99.warning) {
    triggerAlert("slow_response_time_p99", "warning",
      `Slow P99 response time: ${p99}ms (threshold: ${ALERT_THRESHOLDS.responseTime.p99.warning}ms)`,
      { p99, threshold: ALERT_THRESHOLDS.responseTime.p99.warning }
    );
  } else {
    resolveAlert("slow_response_time_p99");
  }

  if (p95 >= ALERT_THRESHOLDS.responseTime.p95.critical) {
    triggerAlert("slow_response_time_p95", "critical",
      `Critical P95 response time: ${p95}ms (threshold: ${ALERT_THRESHOLDS.responseTime.p95.critical}ms)`,
      { p95, threshold: ALERT_THRESHOLDS.responseTime.p95.critical }
    );
  } else if (p95 >= ALERT_THRESHOLDS.responseTime.p95.warning) {
    triggerAlert("slow_response_time_p95", "warning",
      `Slow P95 response time: ${p95}ms (threshold: ${ALERT_THRESHOLDS.responseTime.p95.warning}ms)`,
      { p95, threshold: ALERT_THRESHOLDS.responseTime.p95.warning }
    );
  } else {
    resolveAlert("slow_response_time_p95");
  }
}

function checkMemoryUsage(metrics) {
  const memoryUsagePercent = Math.round((metrics.memory.heapUsed / metrics.memory.heapTotal) * 100);

  if (memoryUsagePercent >= ALERT_THRESHOLDS.memoryUsage.critical) {
    triggerAlert("high_memory_usage", "critical",
      `Critical memory usage: ${memoryUsagePercent}% (threshold: ${ALERT_THRESHOLDS.memoryUsage.critical}%)`,
      {
        memoryUsagePercent,
        heapUsed: metrics.memory.heapUsed,
        heapTotal: metrics.memory.heapTotal,
        threshold: ALERT_THRESHOLDS.memoryUsage.critical
      }
    );
  } else if (memoryUsagePercent >= ALERT_THRESHOLDS.memoryUsage.warning) {
    triggerAlert("high_memory_usage", "warning",
      `High memory usage: ${memoryUsagePercent}% (threshold: ${ALERT_THRESHOLDS.memoryUsage.warning}%)`,
      {
        memoryUsagePercent,
        heapUsed: metrics.memory.heapUsed,
        heapTotal: metrics.memory.heapTotal,
        threshold: ALERT_THRESHOLDS.memoryUsage.warning
      }
    );
  } else {
    resolveAlert("high_memory_usage");
  }
}

function checkDatabasePerformance(metrics) {
  const avgQueryTime = metrics.database.averageQueryTime;

  if (avgQueryTime >= ALERT_THRESHOLDS.databaseQueryTime.critical) {
    triggerAlert("slow_database_queries", "critical",
      `Critical database query time: ${avgQueryTime}ms (threshold: ${ALERT_THRESHOLDS.databaseQueryTime.critical}ms)`,
      { avgQueryTime, threshold: ALERT_THRESHOLDS.databaseQueryTime.critical }
    );
  } else if (avgQueryTime >= ALERT_THRESHOLDS.databaseQueryTime.warning) {
    triggerAlert("slow_database_queries", "warning",
      `Slow database queries: ${avgQueryTime}ms (threshold: ${ALERT_THRESHOLDS.databaseQueryTime.warning}ms)`,
      { avgQueryTime, threshold: ALERT_THRESHOLDS.databaseQueryTime.warning }
    );
  } else {
    resolveAlert("slow_database_queries");
  }
}

function checkHealthStatus(healthStatus) {
  if (!healthStatus.ok) {
    triggerAlert("service_unhealthy", "critical",
      `Service health check failed: ${healthStatus.status}`,
      {
        overallStatus: healthStatus.status,
        checks: healthStatus.checks
      }
    );
  } else {
    resolveAlert("service_unhealthy");
  }
}

// Main alert checking function
function checkAlerts(metrics, healthStatus = null) {
  try {
    checkErrorRate(metrics);
    checkResponseTimes(metrics);
    checkMemoryUsage(metrics);
    checkDatabasePerformance(metrics);

    if (healthStatus) {
      checkHealthStatus(healthStatus);
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error checking alerts");
    captureError(error, { context: "alert_checking" });
  }
}

// Get current alert states
function getAlertStates() {
  return Array.from(alertStates.entries()).map(([key, state]) => ({
    alert: key,
    severity: state.severity,
    triggeredAt: state.triggeredAt,
    message: state.message,
    context: state.context,
  }));
}

// Prometheus alert rules (for external monitoring systems)
function generatePrometheusAlertRules() {
  const serviceName = (process.env.ADMIN_API_SERVICE_NAME || "slimy-admin-api").replace(/[^a-zA-Z0-9_]/g, "_");

  return {
    groups: [{
      name: `${serviceName}_alerts`,
      rules: [
        {
          alert: "HighErrorRate",
          expr: `${serviceName}_error_rate_percent > ${ALERT_THRESHOLDS.errorRate.warning}`,
          for: "5m",
          labels: {
            severity: "warning",
          },
          annotations: {
            summary: "High error rate detected",
            description: `Error rate is {{ $value }}% (threshold: ${ALERT_THRESHOLDS.errorRate.warning}%)`,
          },
        },
        {
          alert: "CriticalErrorRate",
          expr: `${serviceName}_error_rate_percent > ${ALERT_THRESHOLDS.errorRate.critical}`,
          for: "2m",
          labels: {
            severity: "critical",
          },
          annotations: {
            summary: "Critical error rate detected",
            description: `Error rate is {{ $value }}% (threshold: ${ALERT_THRESHOLDS.errorRate.critical}%)`,
          },
        },
        {
          alert: "SlowResponseTime",
          expr: `${serviceName}_response_time_p95_ms > ${ALERT_THRESHOLDS.responseTime.p95.warning}`,
          for: "5m",
          labels: {
            severity: "warning",
          },
          annotations: {
            summary: "Slow response times detected",
            description: `P95 response time is {{ $value }}ms (threshold: ${ALERT_THRESHOLDS.responseTime.p95.warning}ms)`,
          },
        },
        {
          alert: "HighMemoryUsage",
          expr: `(${serviceName}_memory_heap_used_mb / ${serviceName}_memory_heap_total_mb) * 100 > ${ALERT_THRESHOLDS.memoryUsage.warning}`,
          for: "5m",
          labels: {
            severity: "warning",
          },
          annotations: {
            summary: "High memory usage detected",
            description: `Memory usage is {{ $value }}% (threshold: ${ALERT_THRESHOLDS.memoryUsage.warning}%)`,
          },
        },
        {
          alert: "SlowDatabaseQueries",
          expr: `${serviceName}_database_query_time_average_ms > ${ALERT_THRESHOLDS.databaseQueryTime.warning}`,
          for: "5m",
          labels: {
            severity: "warning",
          },
          annotations: {
            summary: "Slow database queries detected",
            description: `Average query time is {{ $value }}ms (threshold: ${ALERT_THRESHOLDS.databaseQueryTime.warning}ms)`,
          },
        },
      ],
    }],
  };
}

module.exports = {
  checkAlerts,
  getAlertStates,
  generatePrometheusAlertRules,
  ALERT_THRESHOLDS,
};
