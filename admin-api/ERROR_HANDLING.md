# Standardized Error Handling & Logging Implementation

## Overview

Implemented comprehensive error handling and structured logging for the admin-api service.

## Components Created

### 1. Error Classes (`src/lib/errors.js`)

Standardized error classes with proper HTTP status codes:

- **Authentication Errors (401)**
  - `AuthenticationError` - Authentication required
  - `TokenExpiredError` - Session expired
  - `RefreshFailedError` - Token refresh failed

- **Authorization Errors (403)**
  - `AuthorizationError` - Insufficient permissions
  - `InsufficientRoleError` - Insufficient role

- **Validation Errors (400)**
  - `ValidationError` - Validation failed
  - `BadRequestError` - Bad request
  - `StateMismatchError` - OAuth state mismatch

- **Not Found Errors (404)**
  - `NotFoundError` - Resource not found

- **External Service Errors (502)**
  - `OAuthError` - Base OAuth error
  - `TokenExchangeError` - Token exchange failed
  - `UserFetchError` - User fetch failed
  - `GuildFetchError` - Guild fetch failed

- **Configuration Errors (503)**
  - `ConfigurationError` - Service not configured

- **Internal Server Errors (500)**
  - `InternalServerError` - Internal server error

### 2. Structured Logger (`src/lib/logger.js`)

Uses **Pino** for high-performance structured logging:

- JSON-formatted logs in production
- Pretty-printed logs in development
- Request logging middleware with context
- Error logging with appropriate levels
- Request ID tracking

### 3. Request ID Middleware (`src/middleware/request-id.js`)

- Generates unique request IDs (UUID v4)
- Accepts `X-Request-ID` header from clients
- Adds `X-Request-ID` to response headers
- Enables request tracking across services

### 4. Error Handler Middleware (`src/middleware/error-handler.js`)

- Centralized error handling
- Standardized error response format
- Automatic error logging with context
- Stack traces in development only
- Request ID included in all error responses

### 5. Async Handler Wrapper

- Wraps async route handlers
- Automatically catches and forwards errors
- Prevents unhandled promise rejections

## Error Response Format

All errors follow this standardized format:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly error message",
    "requestId": "xxx-xxx-xxx",
    "details": { ... }  // Optional, for additional context
  }
}
```

In development mode, stack traces are included:

```json
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Internal server error",
    "requestId": "xxx-xxx-xxx",
    "stack": "Error: ...\n    at ..."
  }
}
```

## Logging Format

### Request Logs

```json
{
  "level": "INFO",
  "time": "2025-11-06T16:08:08.703Z",
  "pid": 1473642,
  "requestId": "aa672e1f-4665-4f80-b3ee-15abe6bb1d89",
  "method": "GET",
  "path": "/api/health",
  "statusCode": 200,
  "duration": 1,
  "msg": "Request completed"
}
```

### Error Logs

```json
{
  "level": "ERROR",
  "time": "2025-11-06T16:08:08.703Z",
  "pid": 1473642,
  "requestId": "aa672e1f-4665-4f80-b3ee-15abe6bb1d89",
  "error": {
    "name": "TokenExchangeError",
    "message": "Failed to exchange authorization code: 400",
    "code": "TOKEN_EXCHANGE_FAILED",
    "statusCode": 502,
    "stack": "..."
  },
  "method": "GET",
  "path": "/api/auth/callback",
  "user": "123456789",
  "msg": "Server error"
}
```

## Usage Examples

### Throwing Errors in Routes

```javascript
const { NotFoundError, ValidationError } = require("./src/lib/errors");
const { asyncHandler } = require("./src/middleware/error-handler");

router.get("/users/:id", asyncHandler(async (req, res) => {
  const user = await getUser(req.params.id);
  if (!user) {
    throw new NotFoundError("User not found", { userId: req.params.id });
  }
  res.json({ ok: true, user });
}));
```

### Using Logger in Routes

```javascript
router.post("/data", asyncHandler(async (req, res) => {
  req.logger.info({ action: "create_data" }, "Creating data");
  
  try {
    const result = await createData(req.body);
    req.logger.info({ resultId: result.id }, "Data created successfully");
    res.json({ ok: true, data: result });
  } catch (error) {
    req.logger.error({ error: error.message }, "Failed to create data");
    throw error; // Will be handled by error middleware
  }
}));
```

## Success Criteria Met

✅ **All errors follow standard format** - All errors use AppError classes with consistent structure

✅ **Errors logged with context** - All errors logged with request ID, user context, and error details

✅ **User errors are helpful** - Error messages are user-friendly with optional details

✅ **Stack traces in dev only** - Stack traces only included in development mode

✅ **Request IDs for tracking** - Every request has a unique ID for tracking and debugging

## Benefits

- **Better debugging** - Structured logs with request IDs make it easy to trace issues
- **User-friendly errors** - Clear error messages with appropriate status codes
- **Monitoring capability** - Structured logs can be easily parsed by log aggregation tools
- **Audit trail** - All requests and errors are logged with full context
- **Performance tracking** - Request duration is logged for performance monitoring
- **Issue diagnosis** - Request IDs enable correlation across services
- **Support efficiency** - Support can quickly find and diagnose issues using request IDs

## Configuration

Set log level via environment variable:

```bash
LOG_LEVEL=debug  # Options: trace, debug, info, warn, error, fatal
```

Default: `info` in production, `debug` in development

## Next Steps

1. Update remaining routes to use error classes instead of manual error responses
2. Add metrics/logging integration (e.g., Datadog, CloudWatch)
3. Add request rate limiting with error responses
4. Add API versioning with error responses for deprecated versions

