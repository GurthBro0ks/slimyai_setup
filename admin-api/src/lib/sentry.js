"use strict";

const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

// Initialize Sentry if DSN is provided
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || "development";
  const serviceName = process.env.ADMIN_API_SERVICE_NAME || "slimy-admin-api";

  if (!dsn) {
    console.log("[sentry] Sentry DSN not configured, skipping initialization");
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: process.env.ADMIN_API_VERSION || "dev",
    integrations: [
      // Add profiling integration
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in production, 100% in development
    profilesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in production, 100% in development

    // Error tracking configuration
    beforeSend(event, hint) {
      // Filter out common non-actionable errors
      const error = hint.originalException;
      if (error && error.message) {
        // Skip client errors that are expected (4xx)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          return null;
        }

        // Skip timeout errors that are client-side
        if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
          return null;
        }
      }

      return event;
    },
  });

  console.log(`[sentry] Initialized Sentry for ${serviceName} in ${environment}`);
}

// Middleware to capture request context
function sentryRequestHandler(req, res, next) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return next();
  }

  // Start a transaction for each request
  const transaction = Sentry.startTransaction({
    op: "http.server",
    name: `${req.method} ${req.path}`,
  });

  // Set the transaction on the request for later use
  req.sentryTransaction = transaction;

  // Finish transaction when response is done
  res.on("finish", () => {
    transaction.setHttpStatus(res.statusCode);
    transaction.finish();
  });

  next();
}

// Error handler for Sentry
function sentryErrorHandler(err, req, res, next) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return next(err);
  }

  Sentry.withScope((scope) => {
    if (req.user) {
      scope.setUser({
        id: req.user.id,
        username: req.user.username,
      });
    }

    if (req.id) {
      scope.setTag("request_id", req.id);
    }

    scope.setTag("method", req.method);
    scope.setTag("path", req.path);

    Sentry.captureException(err);
  });

  next(err);
}

// Utility function to capture custom errors
function captureError(error, context = {}) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setTag(key, context[key]);
    });
    Sentry.captureException(error);
  });
}

// Utility function to capture messages
function captureMessage(message, level = "info", context = {}) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setTag(key, context[key]);
    });
    Sentry.captureMessage(message, level);
  });
}

// Performance monitoring helper
function startTransaction(name, op = "function") {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return null;
  }

  return Sentry.startTransaction({
    op,
    name,
  });
}

module.exports = {
  initSentry,
  sentryRequestHandler,
  sentryErrorHandler,
  captureError,
  captureMessage,
  startTransaction,
};
