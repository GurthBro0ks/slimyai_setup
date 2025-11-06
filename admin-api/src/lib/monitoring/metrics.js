"use strict";

const startedAt = new Date();

// Basic counters
let requestCount = 0;
let imagesProcessed = 0;
let chatMessages = 0;
let errorCount = 0;

// Response time tracking (sliding window of last 1000 requests)
const responseTimes = [];
const RESPONSE_TIME_WINDOW = 1000;

// HTTP status code distribution
const statusCodes = {};

// Database query metrics
let dbQueryCount = 0;
let dbQueryTotalTime = 0;
let dbConnectionCount = 0;

// Performance metrics
let activeConnections = 0;

// Job queue metrics
const jobMetrics = {
  chat: {
    queued: 0,
    completed: 0,
    failed: 0,
    totalDuration: 0,
    active: 0,
  },
  database: {
    queued: 0,
    completed: 0,
    failed: 0,
    totalDuration: 0,
    active: 0,
  },
  audit: {
    queued: 0,
    completed: 0,
    failed: 0,
    totalDuration: 0,
    active: 0,
  },
};

// Audit event metrics
let auditEventsLogged = 0;
let auditEventsFailed = 0;

function recordRequest() {
  requestCount += 1;
}

function recordImages(count = 1) {
  imagesProcessed += Number(count) || 0;
}

function recordChatMessage() {
  chatMessages += 1;
}

function recordResponseTime(durationMs) {
  responseTimes.push({
    timestamp: Date.now(),
    duration: durationMs
  });

  // Keep only recent responses
  if (responseTimes.length > RESPONSE_TIME_WINDOW) {
    responseTimes.shift();
  }
}

function recordStatusCode(statusCode) {
  statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
}

function recordError() {
  errorCount += 1;
}

function recordDatabaseQuery(durationMs) {
  dbQueryCount += 1;
  dbQueryTotalTime += durationMs;
}

function recordDatabaseConnection(delta) {
  dbConnectionCount += delta;
}

function recordActiveConnection(delta) {
  activeConnections += delta;
}

function recordApiCall(operation) {
  // For now, just record a general request. Could be extended to track specific operations
  recordRequest();
}

// Job queue metrics
function recordJobQueued(queueName) {
  if (jobMetrics[queueName]) {
    jobMetrics[queueName].queued += 1;
  }
}

function recordJobCompleted(queueName) {
  if (jobMetrics[queueName]) {
    jobMetrics[queueName].completed += 1;
  }
}

function recordJobFailed(queueName) {
  if (jobMetrics[queueName]) {
    jobMetrics[queueName].failed += 1;
  }
}

function recordJobDuration(queueName, durationMs) {
  if (jobMetrics[queueName]) {
    jobMetrics[queueName].totalDuration += durationMs;
  }
}

function recordJobActive(queueName, delta = 1) {
  if (jobMetrics[queueName]) {
    jobMetrics[queueName].active += delta;
  }
}

// Chat bot interaction metrics
function recordChatBotInteraction({ success, responseLength, usedFallback }) {
  // Additional chat bot specific metrics could be added here
  if (!success) {
    recordError();
  }
}

// Audit event metrics
function recordAuditEvent({ action, resourceType, success }) {
  if (success) {
    auditEventsLogged += 1;
  } else {
    auditEventsFailed += 1;
  }
}

function getAverageResponseTime() {
  if (responseTimes.length === 0) return 0;
  const sum = responseTimes.reduce((acc, rt) => acc + rt.duration, 0);
  return Math.round(sum / responseTimes.length);
}

function getResponseTimePercentile(percentile) {
  if (responseTimes.length === 0) return 0;

  const sorted = [...responseTimes].sort((a, b) => a.duration - b.duration);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)].duration;
}

function getAverageDatabaseQueryTime() {
  if (dbQueryCount === 0) return 0;
  return Math.round(dbQueryTotalTime / dbQueryCount);
}

function getErrorRate() {
  if (requestCount === 0) return 0;
  return (errorCount / requestCount) * 100;
}

// Job metrics helpers
function getJobSuccessRate(queueName) {
  const metrics = jobMetrics[queueName];
  if (!metrics) return 0;

  const total = metrics.completed + metrics.failed;
  if (total === 0) return 0;

  return (metrics.completed / total) * 100;
}

function getAverageJobDuration(queueName) {
  const metrics = jobMetrics[queueName];
  if (!metrics || metrics.completed === 0) return 0;

  return Math.round(metrics.totalDuration / metrics.completed);
}

function getJobThroughput(queueName) {
  const metrics = jobMetrics[queueName];
  if (!metrics) return 0;

  const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  if (uptimeSec === 0) return 0;

  return Math.round((metrics.completed + metrics.failed) / uptimeSec * 60); // jobs per minute
}

function getMemoryUsage() {
  const memUsage = process.memoryUsage();
  return {
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024), // MB
  };
}

function getCpuUsage() {
  const cpuUsage = process.cpuUsage();
  return {
    user: Math.round(cpuUsage.user / 1000), // ms
    system: Math.round(cpuUsage.system / 1000), // ms
  };
}

function snapshot() {
  return {
    // Basic info
    startedAt: startedAt.toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),

    // Request metrics
    requests: requestCount,
    activeConnections,
    imagesProcessed,
    chatMessages,

    // Performance metrics
    responseTime: {
      average: getAverageResponseTime(),
      p50: getResponseTimePercentile(50),
      p95: getResponseTimePercentile(95),
      p99: getResponseTimePercentile(99),
    },

    // Error metrics
    errors: errorCount,
    errorRatePercent: getErrorRate(),

    // HTTP status distribution
    statusCodes: { ...statusCodes },

    // Database metrics
    database: {
      connections: dbConnectionCount,
      queries: dbQueryCount,
      averageQueryTime: getAverageDatabaseQueryTime(),
    },

    // Job queue metrics
    jobs: {
      chat: {
        queued: jobMetrics.chat.queued,
        active: jobMetrics.chat.active,
        completed: jobMetrics.chat.completed,
        failed: jobMetrics.chat.failed,
        successRate: getJobSuccessRate('chat'),
        averageDuration: getAverageJobDuration('chat'),
        throughput: getJobThroughput('chat'),
      },
      database: {
        queued: jobMetrics.database.queued,
        active: jobMetrics.database.active,
        completed: jobMetrics.database.completed,
        failed: jobMetrics.database.failed,
        successRate: getJobSuccessRate('database'),
        averageDuration: getAverageJobDuration('database'),
        throughput: getJobThroughput('database'),
      },
      audit: {
        queued: jobMetrics.audit.queued,
        active: jobMetrics.audit.active,
        completed: jobMetrics.audit.completed,
        failed: jobMetrics.audit.failed,
        successRate: getJobSuccessRate('audit'),
        averageDuration: getAverageJobDuration('audit'),
        throughput: getJobThroughput('audit'),
      },
    },

    // Audit metrics
    audit: {
      eventsLogged: auditEventsLogged,
      eventsFailed: auditEventsFailed,
      successRate: auditEventsLogged + auditEventsFailed > 0
        ? (auditEventsLogged / (auditEventsLogged + auditEventsFailed)) * 100
        : 0,
    },

    // System metrics
    memory: getMemoryUsage(),
    cpu: getCpuUsage(),

    // Recent activity (last 5 minutes)
    recentRequests: responseTimes.filter(rt =>
      Date.now() - rt.timestamp < 5 * 60 * 1000
    ).length,
  };
}

// Middleware for tracking HTTP metrics
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Record active connection
  recordActiveConnection(1);

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    recordResponseTime(duration);
    recordStatusCode(res.statusCode);

    // Record error if status >= 500
    if (res.statusCode >= 500) {
      recordError();
    }

    // Release active connection
    recordActiveConnection(-1);
  });

  next();
}

module.exports = {
  recordRequest,
  recordImages,
  recordChatMessage,
  recordResponseTime,
  recordStatusCode,
  recordError,
  recordDatabaseQuery,
  recordDatabaseConnection,
  recordActiveConnection,
  recordApiCall,
  recordJobQueued,
  recordJobCompleted,
  recordJobFailed,
  recordJobDuration,
  recordJobActive,
  recordChatBotInteraction,
  recordAuditEvent,
  getJobSuccessRate,
  getAverageJobDuration,
  getJobThroughput,
  snapshot,
  metricsMiddleware,
};
