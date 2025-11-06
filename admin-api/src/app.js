"use strict";

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const morgan = require("morgan");

const metrics = require("./lib/monitoring/metrics");
const database = require("./lib/database");
const {
  storeSession,
  getSession,
  clearSession,
  activeSessionCount,
  getAllSessions,
} = require("../lib/session-store");
const {
  COOKIE_NAME,
  verifySession,
  signSession,
  setAuthCookie,
  clearAuthCookie,
} = require("../lib/jwt");
const { requestLogger } = require("./lib/logger");
const requestIdMiddleware = require("./middleware/request-id");
const { errorHandler, notFoundHandler, asyncHandler } = require("./middleware/error-handler");
const { requireAuth, requireRole, requireGuildMember, resolveUser } = require("./middleware/auth");
const {
  AuthenticationError,
  TokenExpiredError,
  RefreshFailedError,
  AuthorizationError,
  InsufficientRoleError,
  ValidationError,
  BadRequestError,
  StateMismatchError,
  NotFoundError,
  ConfigurationError,
  TokenExchangeError,
  UserFetchError,
  GuildFetchError,
} = require("./lib/errors");

// CORS configuration
const CORS_ORIGINS = [
  process.env.CORS_ALLOW_ORIGIN,
  process.env.CORS_ALLOW_ORIGIN_2,
  process.env.CORS_ALLOW_ORIGIN_3,
].filter(Boolean).map(origin => origin.split(',').map(s => s.trim())).flat();

const app = express();

// Trust proxy for production deployments
app.set("trust proxy", true);

// CORS middleware
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Request logging middleware
app.use(requestLogger);

// Standard middleware
app.use(morgan("combined"));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Metrics middleware
app.use((req, _res, next) => {
  metrics.recordRequest();
  next();
});

// User resolution middleware - use centralized resolveUser
app.use((req, _res, next) => {
  resolveUser(req);
  next();
});

// Placeholder function for testing (mock implementation)
async function ensureValidAccessToken(userId) {
  // Mock implementation for tests - always returns true
  return true;
}

// Create router and mount routes
const router = express.Router();

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "slimy-admin-api",
    version: "test",
    uptime: process.uptime(),
    database: database.isConfigured() ? "connected" : "disabled",
  });
});

// Mount additional route modules (only the ones we need for testing)
try {
  const chatRoutes = require("./routes/chat");
  router.use("/chat", chatRoutes);
  console.log("[test-app] Mounted /api/chat routes");
} catch (err) {
  console.warn("[test-app] Failed to mount chat routes:", err.message);
}

try {
  const guildsRoutes = require("./routes/guilds");
  router.use("/guilds", guildsRoutes);
  console.log("[test-app] Mounted /api/guilds routes");
} catch (err) {
  console.warn("[test-app] Failed to mount guilds routes:", err.message);
}

try {
  const statsTrackerRoutes = require("./routes/stats-tracker");
  router.use("/stats", statsTrackerRoutes);
  console.log("[test-app] Mounted /api/stats routes");
} catch (err) {
  console.warn("[test-app] Failed to mount stats-tracker routes:", err.message);
}

// Mount router
app.use("/api", router);
app.use("/", router);

// Test routes for auth middleware testing
const testAuthRouter = express.Router();
const testRoleRouter = express.Router();
const testGuildRouter = express.Router();

testAuthRouter.get("/protected", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

testRoleRouter.get("/admin-only", requireRole("admin"), (req, res) => {
  res.json({ ok: true, user: req.user });
});

testRoleRouter.get("/club-only", requireRole("club"), (req, res) => {
  res.json({ ok: true, user: req.user });
});

testGuildRouter.get("/guild/:guildId/protected", requireGuildMember(), (req, res) => {
  res.json({ ok: true, user: req.user, guildId: req.params.guildId });
});

// Mount test routes
app.use("/test-auth", testAuthRouter);
app.use("/test-role", testRoleRouter);
app.use("/test-guild", testGuildRouter);

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
