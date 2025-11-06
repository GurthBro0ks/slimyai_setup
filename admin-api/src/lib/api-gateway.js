"use strict";

/**
 * API Gateway Pattern Implementation
 * 
 * Provides a centralized middleware pipeline for handling API requests
 * with cross-cutting concerns like rate limiting, authentication, validation, and logging.
 * 
 * Usage:
 *   const gateway = new ApiGateway();
 *   gateway.use(rateLimiter);
 *   gateway.use(authentication);
 *   gateway.use(validation);
 *   gateway.use(logging);
 *   gateway.route('/api/*', adminApiProxy);
 */

const express = require("express");
const { logger } = require("./logger");

class ApiGateway {
  constructor() {
    this.middlewareStack = [];
    this.routes = [];
    this.router = express.Router();
  }

  /**
   * Add middleware to the pipeline
   * Middleware will be executed in the order they are added
   * 
   * @param {Function|string} middleware - Express middleware function or route pattern
   * @param {Function} [fn] - Middleware function (if first param is a route pattern)
   * @returns {ApiGateway} Returns self for chaining
   * 
   * @example
   *   gateway.use(rateLimiter);
   *   gateway.use('/api/chat', chatRateLimiter);
   */
  use(middleware, fn) {
    if (typeof middleware === "string" && fn) {
      // Route-specific middleware: gateway.use('/api/chat', middleware)
      this.middlewareStack.push({ path: middleware, handler: fn });
    } else if (typeof middleware === "function") {
      // Global middleware: gateway.use(middleware)
      this.middlewareStack.push({ path: null, handler: middleware });
    } else {
      throw new Error("Invalid middleware: must be a function or (path, function)");
    }
    return this;
  }

  /**
   * Register a route pattern with a handler
   * 
   * @param {string} pattern - Route pattern (e.g., '/api/*')
   * @param {Function|express.Router} handler - Route handler or Express router
   * @returns {ApiGateway} Returns self for chaining
   * 
   * @example
   *   gateway.route('/api/*', adminApiRouter);
   *   gateway.route('/api/chat', chatRouter);
   */
  route(pattern, handler) {
    if (!pattern || typeof pattern !== "string") {
      throw new Error("Route pattern must be a non-empty string");
    }
    if (!handler) {
      throw new Error("Route handler is required");
    }

    this.routes.push({ pattern, handler });
    return this;
  }

  /**
   * Build the Express router with all middleware and routes
   * 
   * @returns {express.Router} Configured Express router
   */
  build() {
    // Apply middleware in order
    this.middlewareStack.forEach(({ path, handler }) => {
      if (path) {
        // Route-specific middleware
        this.router.use(path, handler);
      } else {
        // Global middleware
        this.router.use(handler);
      }
    });

    // Register routes
    this.routes.forEach(({ pattern, handler }) => {
      // Convert wildcard pattern to Express route
      const expressPattern = pattern.replace(/\*/g, "*");
      
      if (typeof handler === "function" && handler.handle) {
        // Express Router instance
        this.router.use(pattern, handler);
      } else if (typeof handler === "function") {
        // Middleware function
        this.router.use(pattern, handler);
      } else {
        throw new Error(`Invalid route handler for pattern ${pattern}`);
      }
    });

    return this.router;
  }

  /**
   * Get middleware stack for inspection
   * 
   * @returns {Array} Array of middleware configurations
   */
  getMiddlewareStack() {
    return this.middlewareStack.map(({ path, handler }) => ({
      path: path || "global",
      handler: handler.name || "anonymous",
    }));
  }

  /**
   * Get registered routes for inspection
   * 
   * @returns {Array} Array of route configurations
   */
  getRoutes() {
    return this.routes.map(({ pattern, handler }) => ({
      pattern,
      handler: handler.name || (handler.handle ? "Router" : "anonymous"),
    }));
  }

  /**
   * Log gateway configuration (useful for debugging)
   */
  logConfiguration() {
    logger.info({
      middleware: this.getMiddlewareStack(),
      routes: this.getRoutes(),
    }, "API Gateway configuration");
  }
}

module.exports = ApiGateway;

