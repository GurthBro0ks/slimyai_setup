const { getCache } = require("../../lib/cache/redis");

/**
 * API Performance monitoring utilities
 */
class APIPerformanceMonitor {
  constructor() {
    this.cache = getCache({
      keyPrefix: 'perf:',
      ttl: 3600, // 1 hour for performance data
    });
    this.metrics = [];
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
  }

  /**
   * Middleware to monitor API performance
   */
  middleware() {
    return (req, res, next) => {
      const startTime = process.hrtime.bigint();
      this.requestCount++;

      // Override res.end to capture response time
      const originalEnd = res.end;
      res.end = (...args) => {
        const endTime = process.hrtime.bigint();
        const responseTimeMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds

        this.recordRequest({
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          responseTime: responseTimeMs,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          timestamp: new Date(),
        });

        if (res.statusCode >= 400) {
          this.errorCount++;
        }

        return originalEnd.apply(res, args);
      };

      next();
    };
  }

  /**
   * Record API request metrics
   */
  recordRequest(requestData) {
    this.metrics.push(requestData);

    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Record response time for percentile calculations
    this.responseTimes.push(requestData.responseTime);
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
  }

  /**
   * Get performance statistics
   */
  getStatistics() {
    const sortedResponseTimes = [...this.responseTimes].sort((a, b) => a - b);

    return {
      timestamp: new Date(),
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      responseTimeStats: {
        average: this.calculateAverage(this.responseTimes),
        median: this.calculatePercentile(sortedResponseTimes, 50),
        p95: this.calculatePercentile(sortedResponseTimes, 95),
        p99: this.calculatePercentile(sortedResponseTimes, 99),
        min: Math.min(...this.responseTimes),
        max: Math.max(...this.responseTimes),
      },
      recentRequests: this.metrics.slice(-10), // Last 10 requests
    };
  }

  /**
   * Calculate average of array
   */
  calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * Calculate percentile from sorted array
   */
  calculatePercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;

    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
  }

  /**
   * Get endpoint-specific statistics
   */
  getEndpointStatistics() {
    const endpointStats = {};

    this.metrics.forEach(request => {
      const endpoint = `${request.method} ${request.url.split('?')[0]}`; // Remove query params

      if (!endpointStats[endpoint]) {
        endpointStats[endpoint] = {
          endpoint,
          totalRequests: 0,
          totalErrors: 0,
          responseTimes: [],
        };
      }

      const stats = endpointStats[endpoint];
      stats.totalRequests++;
      stats.responseTimes.push(request.responseTime);

      if (request.statusCode >= 400) {
        stats.totalErrors++;
      }
    });

    // Calculate aggregates for each endpoint
    Object.values(endpointStats).forEach(stats => {
      const sortedTimes = stats.responseTimes.sort((a, b) => a - b);
      stats.averageResponseTime = this.calculateAverage(stats.responseTimes);
      stats.medianResponseTime = this.calculatePercentile(sortedTimes, 50);
      stats.p95ResponseTime = this.calculatePercentile(sortedTimes, 95);
      stats.errorRate = (stats.totalErrors / stats.totalRequests) * 100;

      // Clean up response times array for memory efficiency
      delete stats.responseTimes;
    });

    return Object.values(endpointStats);
  }

  /**
   * Get database performance metrics
   */
  async getDatabaseMetrics() {
    try {
      const { getDatabaseOptimizer } = require("../../lib/database-optimization");

      if (getDatabaseOptimizer) {
        const optimizer = getDatabaseOptimizer();
        return await optimizer.getPerformanceMetrics();
      }

      return null;
    } catch (error) {
      console.warn('Failed to get database metrics:', error);
      return null;
    }
  }

  /**
   * Get cache performance metrics
   */
  async getCacheMetrics() {
    try {
      const stats = await this.cache.getStats();
      return {
        available: stats.available,
        connected: stats.connected,
        enabled: stats.enabled,
        keys: stats.keys || 0,
      };
    } catch (error) {
      console.warn('Failed to get cache metrics:', error);
      return null;
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport() {
    const [stats, endpointStats, dbMetrics, cacheMetrics] = await Promise.all([
      this.getStatistics(),
      this.getEndpointStatistics(),
      this.getDatabaseMetrics(),
      this.getCacheMetrics(),
    ]);

    return {
      summary: stats,
      endpoints: endpointStats,
      database: dbMetrics,
      cache: cacheMetrics,
      generatedAt: new Date(),
    };
  }

  /**
   * Reset metrics (useful for testing or periodic cleanup)
   */
  reset() {
    this.metrics = [];
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
  }
}

// Singleton instance
let apiPerformanceMonitor = null;

/**
 * Get API performance monitor instance
 */
function getAPIPerformanceMonitor() {
  if (!apiPerformanceMonitor) {
    apiPerformanceMonitor = new APIPerformanceMonitor();
  }
  return apiPerformanceMonitor;
}

module.exports = {
  APIPerformanceMonitor,
  getAPIPerformanceMonitor,
};
