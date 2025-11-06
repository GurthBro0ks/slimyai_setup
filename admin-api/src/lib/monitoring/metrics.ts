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
  snapshot,
  metricsMiddleware,
};
