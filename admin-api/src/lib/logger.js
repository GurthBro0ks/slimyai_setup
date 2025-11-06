"use strict";

const pino = require("pino");

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");

// Base logger configuration
const baseConfig = {
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
    log: (obj) => {
      // Add service context to all logs
      return {
        ...obj,
        service: process.env.ADMIN_API_SERVICE_NAME || "slimy-admin-api",
        version: process.env.ADMIN_API_VERSION || "dev",
        env: process.env.NODE_ENV || "development",
        hostname: require("os").hostname(),
        pid: process.pid,
      };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Add serializers for common objects
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
        "x-forwarded-for": req.headers["x-forwarded-for"],
        "x-request-id": req.headers["x-request-id"],
      },
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.headers,
    }),
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
};

// Development logger with pretty printing
const devConfig = {
  ...baseConfig,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname,service,version,env",
      messageFormat: "{service} {level} {msg}",
    },
  },
};

// Production logger with JSON output for monitoring platforms
const prodConfig = {
  ...baseConfig,
  // Ensure JSON format for production monitoring
  formatters: {
    ...baseConfig.formatters,
    // Add additional structured fields for monitoring
    log: (obj) => {
      const base = baseConfig.formatters.log(obj);

      // Add monitoring-specific fields
      if (obj.requestId) {
        base.dd = {
          trace_id: obj.requestId,
          span_id: obj.requestId,
        };
      }

      return base;
    },
  },
};

// Create logger based on environment
const logger = pino(isDevelopment ? devConfig : prodConfig);

/**
 * Create a child logger with context
 */
function createLogger(context = {}) {
  return logger.child(context);
}

/**
 * Request logger middleware - creates logger with request ID
 */
function requestLogger(req, res, next) {
  const requestId = req.id || req.headers["x-request-id"] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.id = requestId;
  req.logger = createLogger({ requestId, method: req.method, path: req.path });
  
  // Log request start
  req.logger.info({ 
    method: req.method, 
    path: req.path,
    query: req.query,
    ip: req.ip,
  }, "Incoming request");

  // Log response when finished
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    req.logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    }, "Request completed");
  });

  next();
}

/**
 * Error logger - logs errors with context
 */
function logError(logger, error, context = {}) {
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
    },
    ...context,
  };

  if (error.statusCode && error.statusCode < 500) {
    // Client errors (4xx) - log as warning
    logger.warn(logData, "Client error");
  } else {
    // Server errors (5xx) - log as error
    logger.error(logData, "Server error");
  }
}

module.exports = {
  logger,
  createLogger,
  requestLogger,
  logError,
};

