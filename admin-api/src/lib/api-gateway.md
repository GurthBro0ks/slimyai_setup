"use strict";

/**
 * API Gateway Pattern - Documentation
 * 
 * This module implements the API Gateway pattern for centralized request handling
 * with cross-cutting concerns.
 * 
 * ## Architecture
 * 
 * The API Gateway provides a middleware pipeline that processes all API requests
 * before they reach the actual route handlers. This allows for:
 * 
 * - Centralized rate limiting
 * - Consistent authentication handling
 * - Request validation and sanitization
 * - Unified logging
 * - Easy addition of new cross-cutting concerns
 * 
 * ## Usage Example
 * 
 * ```javascript
 * const ApiGateway = require('./src/lib/api-gateway');
 * const apiGateway = new ApiGateway();
 * 
 * // Add middleware to pipeline (executed in order)
 * apiGateway.use('/api', rateLimiter);
 * apiGateway.use('/api', authentication);
 * apiGateway.use('/api', validation);
 * apiGateway.use('/api', logging);
 * 
 * // Route requests to handlers
 * apiGateway.route('/api', adminApiRouter);
 * 
 * // Build and mount
 * const gatewayRouter = apiGateway.build();
 * app.use('/', gatewayRouter);
 * ```
 * 
 * ## Middleware Execution Order
 * 
 * 1. Rate Limiting - Prevents abuse and DDoS attacks
 * 2. Authentication - Resolves user from session/JWT
 * 3. Validation - Sanitizes and validates input
 * 4. Logging - Records request/response for monitoring
 * 5. Route Handler - Actual business logic
 * 
 * ## Benefits
 * 
 * - **Centralized Logic**: All cross-cutting concerns in one place
 * - **Consistent Handling**: Same middleware applied to all API routes
 * - **Easy Extension**: Add new middleware without modifying route handlers
 * - **Better Observability**: Unified logging and monitoring
 * - **Security**: Rate limiting and validation applied consistently
 */

module.exports = require('./api-gateway');

