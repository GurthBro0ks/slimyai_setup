"use strict";

const { isOperationalError, formatErrorResponse, InternalServerError } = require("../lib/errors");
const { logError } = require("../lib/logger");

/**
 * Error handling middleware
 * Must be used after all routes
 */
function errorHandler(err, req, res, next) {
  // Get request ID from request
  const requestId = req.id || req.headers["x-request-id"] || "unknown";
  
  // Get logger from request or use default
  const logger = req.logger || require("../lib/logger").logger;

  // Log the error
  logError(logger, err, {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    user: req.user?.id,
  });

  // Determine if this is an operational error
  const isOperational = isOperationalError(err);

  // If it's not an operational error, wrap it
  const error = isOperational ? err : new InternalServerError(err.message);

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Format error response
  const isDev = process.env.NODE_ENV === "development";
  const response = formatErrorResponse(error, requestId, isDev && !isOperational);

  // Send response
  res.status(statusCode).json(response);
}

/**
 * 404 handler - must be used before error handler
 */
function notFoundHandler(req, res) {
  const requestId = req.id || req.headers["x-request-id"] || "unknown";
  const logger = req.logger || require("../lib/logger").logger;

  logger.warn({
    requestId,
    method: req.method,
    path: req.path,
  }, "Route not found");

  res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
      requestId,
    },
  });
}

/**
 * Async error wrapper - wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};

