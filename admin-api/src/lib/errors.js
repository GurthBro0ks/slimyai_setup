"use strict";

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(code, message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Authentication Errors (401)
 */
class AuthenticationError extends AppError {
  constructor(message = "Authentication required", details = null) {
    super("AUTH_REQUIRED", message, 401, details);
  }
}

class TokenExpiredError extends AppError {
  constructor(message = "Session expired. Please log in again.", details = null) {
    super("TOKEN_EXPIRED", message, 401, details);
  }
}

class RefreshFailedError extends AppError {
  constructor(message = "Token refresh failed. Please log in again.", details = null) {
    super("REFRESH_FAILED", message, 401, details);
  }
}

/**
 * Authorization Errors (403)
 */
class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions", details = null) {
    super("FORBIDDEN", message, 403, details);
  }
}

class InsufficientRoleError extends AppError {
  constructor(message = "Insufficient role", details = null) {
    super("FORBIDDEN", message, 403, details);
  }
}

/**
 * Validation Errors (400)
 */
class ValidationError extends AppError {
  constructor(message = "Validation failed", details = null) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

class BadRequestError extends AppError {
  constructor(message = "Bad request", details = null) {
    super("BAD_REQUEST", message, 400, details);
  }
}

class StateMismatchError extends AppError {
  constructor(message = "OAuth state did not match", details = null) {
    super("STATE_MISMATCH", message, 400, details);
  }
}

/**
 * Not Found Errors (404)
 */
class NotFoundError extends AppError {
  constructor(message = "Resource not found", details = null) {
    super("NOT_FOUND", message, 404, details);
  }
}

/**
 * External Service Errors (502)
 */
class ExternalServiceError extends AppError {
  constructor(service, message, details = null) {
    super(`${service.toUpperCase()}_ERROR`, message, 502, details);
    this.service = service;
  }
}

class OAuthError extends AppError {
  constructor(code, message, details = null) {
    super(code, message, 502, details);
  }
}

class TokenExchangeError extends OAuthError {
  constructor(message = "Failed to exchange authorization code for tokens", details = null) {
    super("TOKEN_EXCHANGE_FAILED", message, details);
  }
}

class UserFetchError extends OAuthError {
  constructor(message = "Failed to fetch user information from Discord", details = null) {
    super("USER_FETCH_FAILED", message, details);
  }
}

class GuildFetchError extends OAuthError {
  constructor(message = "Failed to fetch guild information from Discord", details = null) {
    super("GUILD_FETCH_FAILED", message, details);
  }
}

/**
 * Configuration Errors (503)
 */
class ConfigurationError extends AppError {
  constructor(message = "Service not configured", details = null) {
    super("CONFIG_MISSING", message, 503, details);
  }
}

/**
 * Internal Server Errors (500)
 */
class InternalServerError extends AppError {
  constructor(message = "Internal server error", details = null) {
    super("SERVER_ERROR", message, 500, details);
  }
}

/**
 * Check if error is an operational (expected) error
 */
function isOperationalError(error) {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert error to standardized response format
 */
function formatErrorResponse(error, requestId, includeStack = false) {
  const isDev = process.env.NODE_ENV === "development";
  
  const response = {
    ok: false,
    error: {
      code: error.code || "SERVER_ERROR",
      message: error.message || "An unexpected error occurred",
      requestId,
    },
  };

  // Add details if available
  if (error.details) {
    response.error.details = error.details;
  }

  // Add stack trace in development only
  if (isDev && includeStack && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
}

/**
 * Centralized API handler that wraps route handlers with consistent error handling
 * @param {Function} handler - The async route handler function
 * @param {Object} options - Configuration options
 * @param {string} options.routeName - Name of the route for logging (e.g., "chat/bot")
 * @param {Function} options.errorMapper - Optional function to map specific errors to custom responses
 * @returns {Function} Express middleware function
 */
function apiHandler(handler, options = {}) {
  const { routeName = "unknown", errorMapper } = options;

  return async (req, res, next) => {
    try {
      // Execute the route handler
      const result = await handler(req, res, next);

      // If handler returns a result and hasn't already sent a response, send it
      if (result !== undefined && !res.headersSent) {
        // Assume successful responses have an 'ok' field or are plain objects
        if (typeof result === 'object' && result !== null && 'ok' in result) {
          res.json(result);
        } else {
          res.json(result);
        }
      }
    } catch (error) {
      // Apply custom error mapping if provided
      if (errorMapper) {
        const mappedError = errorMapper(error, req, res);
        if (mappedError) {
          // If mapper returns an error, it means it handled the response
          if (mappedError instanceof Error) {
            throw mappedError;
          }
          // If mapper returns false/null/undefined, continue with default handling
          if (mappedError === false || mappedError === null || mappedError === undefined) {
            return;
          }
        }
      }

      // Log the error with route context
      console.error(`[${routeName}] failed`, error);

      // Re-throw to let the global error handler deal with it
      throw error;
    }
  };
}

module.exports = {
  AppError,
  AuthenticationError,
  TokenExpiredError,
  RefreshFailedError,
  AuthorizationError,
  InsufficientRoleError,
  ValidationError,
  BadRequestError,
  StateMismatchError,
  NotFoundError,
  ExternalServiceError,
  OAuthError,
  TokenExchangeError,
  UserFetchError,
  GuildFetchError,
  ConfigurationError,
  InternalServerError,
  isOperationalError,
  formatErrorResponse,
  apiHandler,
};

