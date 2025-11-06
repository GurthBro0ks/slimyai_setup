#!/usr/bin/env node
"use strict";

// Initialize Sentry FIRST (before any other imports)
const { initSentry, sentryRequestHandler, sentryErrorHandler } = require("./src/lib/monitoring/sentry");
initSentry();

const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const morgan = require("morgan");

const metrics = require("./src/lib/monitoring/metrics");
const database = require("./src/lib/database");
const { queueManager } = require("./src/lib/queues");
const { checkAlerts } = require("./src/lib/alerts");
const {
  storeSession,
  getSession,
  clearSession,
  activeSessionCount,
  getAllSessions,
} = require("./lib/session-store");
const {
  COOKIE_NAME,
  verifySession,
  signSession,
  setAuthCookie,
  clearAuthCookie,
} = require("./lib/jwt");
const { requestLogger, logger } = require("./src/lib/logger");
const requestIdMiddleware = require("./src/middleware/request-id");
const { errorHandler, notFoundHandler, asyncHandler } = require("./src/middleware/error-handler");
const { requireAuth: baseRequireAuth, requireRole: baseRequireRole, resolveUser } = require("./src/middleware/auth");
const config = require("./src/lib/config");
const { getAPIPerformanceMonitor } = require("./src/lib/performance-monitoring");
const {
  securityHeaders,
  authRateLimit,
  apiRateLimit,
  chatRateLimit,
  sensitiveOpsRateLimit,
  sanitizeInput,
  requestSizeLimit,
  securityLogger,
} = require("./src/middleware/security");
const ApiGateway = require("./src/lib/api-gateway");
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
} = require("./src/lib/errors");

const startedAt = new Date();
const SERVICE_NAME = config.server.serviceName;
const VERSION = config.server.version;
const PORT = config.server.port;

const STATE_COOKIE = "oauth_state";
const REDIRECT_COOKIE = "oauth_redirect";
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  domain: config.session.cookieDomain,
  path: "/",
  maxAge: 5 * 60 * 1000,
};

const app = express();

app.set("trust proxy", true);

// Sentry request handler (must be first middleware)
app.use(sentryRequestHandler);

// Security headers (must be early)
app.use(securityHeaders);

// Enhanced CORS configuration
app.use(
  cors({
    origin: config.server.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    maxAge: 86400, // 24 hours
  })
);

// Request ID middleware (must be early)
app.use(requestIdMiddleware);

// Security logging middleware
app.use(securityLogger);

// Request logging middleware
app.use(requestLogger);

// Standard middleware
app.use(morgan("combined"));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(requestSizeLimit);
app.use(sanitizeInput);

// Metrics middleware
app.use(metrics.metricsMiddleware);

// Performance monitoring middleware
const performanceMonitor = getAPIPerformanceMonitor();
app.use(performanceMonitor.middleware());

// Static assets with CDN support and caching headers
const createStaticOptions = (maxAge, isImmutable = false) => ({
  maxAge: maxAge * 1000, // Convert to milliseconds
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set CDN-friendly headers
    const cacheControl = isImmutable
      ? `public, max-age=${maxAge}, immutable`
      : `public, max-age=${maxAge}`;
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Add CORS for CDN access if CDN is enabled
    if (config.cdn.enabled) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    // Add ETag for better caching if not already set
    if (!res.getHeader('ETag')) {
      const crypto = require('crypto');
      const fs = require('fs');
      try {
        const stats = fs.statSync(path);
        const hash = crypto.createHash('md5')
          .update(`${path}:${stats.mtime.getTime()}:${stats.size}`)
          .digest('hex')
          .substring(0, 8);
        res.setHeader('ETag', `"${hash}"`);
      } catch (error) {
        // Ignore ETag generation errors
      }
    }
  }
});

// Serve static uploads with CDN headers
const uploadsOptions = createStaticOptions(config.cdn.uploadsMaxAge, false);
app.use('/uploads', express.static('uploads', uploadsOptions));

// Serve static assets from public directory if it exists
try {
  const fs = require('fs');
  const path = require('path');
  const publicDir = path.join(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    const staticOptions = createStaticOptions(config.cdn.staticMaxAge, true);
    app.use('/assets', express.static(publicDir, staticOptions));
    console.log('[admin-api] Serving static assets from /public directory');
  }
} catch (error) {
  // Ignore if public directory doesn't exist
}

// User resolution middleware - use centralized resolveUser
app.use((req, _res, next) => {
  resolveUser(req);
  next();
});

/**
 * Wrapper middleware that adds token validation for routes that need it.
 * Used for auth-related routes that require Discord token validation.
 */
async function requireAuthWithTokenValidation(req, res, next) {
  try {
    const user = resolveUser(req);
    if (!user) {
      throw new AuthenticationError();
    }
    
    // Ensure access token is valid (refresh if needed)
    const tokenValid = await ensureValidAccessToken(user.id);
    if (!tokenValid && req.session?.tokens) {
      // Token expired and couldn't refresh - clear session
      clearSession(user.id);
      clearAuthCookie(res);
      throw new TokenExpiredError();
    }
    
    req.user = user;
    req.session = req.session || getSession(user.id);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Wrapper middleware that adds token validation and role checking.
 * Used for routes that need both role checking and token validation.
 */
function requireRoleWithTokenValidation(minRole) {
  const order = ["member", "club", "admin"];
  return async (req, res, next) => {
    try {
      const user = resolveUser(req);
      if (!user) {
        throw new AuthenticationError();
      }

      // Ensure access token is valid (refresh if needed)
      const tokenValid = await ensureValidAccessToken(user.id);
      if (!tokenValid && req.session?.tokens) {
        // Token expired and couldn't refresh - clear session
        clearSession(user.id);
        clearAuthCookie(res);
        throw new TokenExpiredError();
      }

      const currentIdx = order.indexOf(user.role || "member");
      const requiredIdx = order.indexOf(minRole);
      if (currentIdx < requiredIdx) {
        throw new InsufficientRoleError();
      }

      req.user = user;
      req.session = req.session || getSession(user.id);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Use centralized middleware for most routes
const requireAuth = baseRequireAuth;
const requireRole = baseRequireRole;

function getDiscordConfig() {
  return {
    clientId: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    redirectUri: config.discord.redirectUri,
    scopes: config.discord.scopes,
  };
}

function isDiscordConfigured(discordConfig) {
  return Boolean(discordConfig.clientId && discordConfig.clientSecret);
}

function issueState(res) {
  const state = crypto.randomBytes(16).toString("base64url");
  res.cookie(STATE_COOKIE, state, STATE_COOKIE_OPTIONS);
  return state;
}

function clearOauthState(res) {
  res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);
  res.clearCookie(REDIRECT_COOKIE, STATE_COOKIE_OPTIONS);
}

function sanitizeRedirect(value) {
  if (typeof value !== "string" || !value.length) {
    return "/guilds";
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    // Prevent open redirects
    return "/guilds";
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function hasPermission(permissions, bit) {
  if (!permissions) return false;
  try {
    const perms = BigInt(permissions);
    return (perms & bit) === bit;
  } catch (err) {
    return false;
  }
}

function determineRole(userId, guilds = []) {
  if (config.roles.adminUserIds.includes(userId)) {
    return "admin";
  }

  if (
    guilds.some((guild) => hasPermission(guild.permissions, config.permissions.administrator))
  ) {
    return "admin";
  }

  if (config.roles.clubUserIds.includes(userId)) {
    return "club";
  }

  if (
    guilds.some((guild) => hasPermission(guild.permissions, config.permissions.manageGuild))
  ) {
    return "club";
  }

  return "member";
}

function normalizeGuild(guild) {
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    owner: Boolean(guild.owner),
    permissions: guild.permissions,
  };
}

async function annotateGuilds(guilds) {
  if (!config.discord.botToken) {
    return guilds.map((guild) => ({ ...guild, installed: null }));
  }

  return Promise.all(
    guilds.map(async (guild) => {
      try {
        const response = await fetch(`${config.discord.apiBaseUrl}/guilds/${guild.id}`, {
          headers: {
            Authorization: `Bot ${config.discord.botToken}`,
            "User-Agent": "slimy-admin-api/1.0 (+https://admin.slimyai.xyz)",
          },
        });
        return { ...guild, installed: response.ok };
      } catch (error) {
        console.warn(`[guilds] Failed to inspect guild ${guild.id}:`, error.message);
        return { ...guild, installed: false };
      }
    })
  );
}

async function exchangeCodeForTokens(discordConfig, code) {
  const body = new URLSearchParams({
    client_id: discordConfig.clientId,
    client_secret: discordConfig.clientSecret,
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri: discordConfig.redirectUri,
  });

  const response = await fetch(config.discord.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new TokenExchangeError(
      `Failed to exchange authorization code: ${response.status}`,
      { status: response.status, detail: detail.slice(0, 200) }
    );
  }

  return response.json();
}

async function exchangeRefreshToken(discordConfig, refreshToken) {
  const body = new URLSearchParams({
    client_id: discordConfig.clientId,
    client_secret: discordConfig.clientSecret,
    grant_type: "refresh_token",
    refresh_token: String(refreshToken),
  });

  const response = await fetch(config.discord.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new RefreshFailedError(
      `Token refresh failed: ${response.status}`,
      { status: response.status, detail: detail.slice(0, 200) }
    );
  }

  return response.json();
}

async function refreshAccessToken(userId) {
  const session = getSession(userId);
  if (!session?.tokens?.refreshToken) {
    throw new RefreshFailedError("No refresh token available");
  }

  const config = getDiscordConfig();
  if (!isDiscordConfigured(config)) {
    throw new ConfigurationError("Discord OAuth not configured");
  }

  const tokens = await exchangeRefreshToken(config, session.tokens.refreshToken);
  
  // Update session with new tokens
  const updatedSession = {
    ...session,
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || session.tokens.refreshToken, // Keep old refresh token if new one not provided
      tokenType: tokens.token_type || session.tokens.tokenType || "Bearer",
      scope: tokens.scope || session.tokens.scope,
      expiresAt: tokens.expires_in
        ? Date.now() + Number(tokens.expires_in) * 1000
        : null,
    },
  };

  storeSession(userId, updatedSession);
  return updatedSession.tokens;
}

async function ensureValidAccessToken(userId) {
  const session = getSession(userId);
  if (!session?.tokens) {
    return false;
  }

  const tokens = session.tokens;
  
  // Check if token is expired or will expire soon (within 5 minutes)
  if (tokens.expiresAt && Date.now() >= tokens.expiresAt - 5 * 60 * 1000) {
    // Try to refresh if we have a refresh token
    if (tokens.refreshToken) {
      try {
        await refreshAccessToken(userId);
        return true;
      } catch (error) {
        console.warn(`[auth] Failed to refresh token for user ${userId}:`, error.message);
        return false;
      }
    }
    return false;
  }

  return true;
}

async function fetchDiscordIdentity(tokenType, accessToken) {
  const headers = {
    Authorization: `${tokenType || "Bearer"} ${accessToken}`,
    "User-Agent": "slimy-admin-api/1.0 (+https://admin.slimyai.xyz)",
  };

  const [userResponse, guildResponse] = await Promise.all([
    fetch(`${config.discord.apiBaseUrl}/users/@me`, { headers }),
    fetch(`${config.discord.apiBaseUrl}/users/@me/guilds`, { headers }),
  ]);

  if (!userResponse.ok) {
    const errorText = await userResponse.text().catch(() => "");
    throw new UserFetchError(
      `Failed to fetch user: ${userResponse.status}`,
      { status: userResponse.status, detail: errorText.slice(0, 200) }
    );
  }

  if (!guildResponse.ok) {
    const errorText = await guildResponse.text().catch(() => "");
    throw new GuildFetchError(
      `Failed to fetch guilds: ${guildResponse.status}`,
      { status: guildResponse.status, detail: errorText.slice(0, 200) }
    );
  }

  const user = await userResponse.json();
  const guilds = await guildResponse.json();

  return { user, guilds };
}

const router = express.Router();

async function checkDatabaseHealth() {
  try {
    if (!database.isConfigured()) {
      return { status: "not_configured" };
    }

    if (!database.isInitialized) {
      return { status: "disconnected" };
    }

    // Perform a simple query to test database connectivity
    const startTime = Date.now();
    await database.getClient().$queryRaw`SELECT 1 as health_check`;
    const responseTime = Date.now() - startTime;

    return {
      status: "healthy",
      responseTimeMs: responseTime,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
}

async function checkDiscordAPIHealth() {
  try {
    if (!config.discord.botToken) {
      return { status: "not_configured" };
    }

    const discordConfig = getDiscordConfig();
    if (!isDiscordConfigured(discordConfig)) {
      return { status: "not_configured" };
    }

    // Test Discord API connectivity with a simple request
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${config.discord.apiBaseUrl}/users/@me`, {
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
        "User-Agent": "slimy-admin-api/1.0 (+https://admin.slimyai.xyz)",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        status: "healthy",
        responseTimeMs: responseTime,
      };
    } else {
      return {
        status: "unhealthy",
        statusCode: response.status,
        responseTimeMs: responseTime,
      };
    }
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
}

function checkSystemHealth() {
  const memUsage = process.memoryUsage();
  const totalMemMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const usedMemMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const memUsagePercent = Math.round((usedMemMB / totalMemMB) * 100);

  return {
    memory: {
      totalMB: totalMemMB,
      usedMB: usedMemMB,
      usagePercent: memUsagePercent,
      status: memUsagePercent > 90 ? "critical" : memUsagePercent > 75 ? "warning" : "healthy",
    },
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    pid: process.pid,
    nodeVersion: process.version,
  };
}

// Metrics endpoint for monitoring systems (Prometheus format)
router.get("/metrics", (_req, res) => {
  const metricsSnapshot = metrics.snapshot();
  const serviceName = SERVICE_NAME.replace(/[^a-zA-Z0-9_]/g, "_");

  // Prometheus-compatible metrics output
  const prometheusMetrics = [
    `# HELP ${serviceName}_uptime_seconds Time since service started`,
    `# TYPE ${serviceName}_uptime_seconds gauge`,
    `${serviceName}_uptime_seconds ${metricsSnapshot.uptimeSec}`,
    ``,
    `# HELP ${serviceName}_requests_total Total number of HTTP requests`,
    `# TYPE ${serviceName}_requests_total counter`,
    `${serviceName}_requests_total ${metricsSnapshot.requests}`,
    ``,
    `# HELP ${serviceName}_active_connections Current number of active connections`,
    `# TYPE ${serviceName}_active_connections gauge`,
    `${serviceName}_active_connections ${metricsSnapshot.activeConnections}`,
    ``,
    `# HELP ${serviceName}_errors_total Total number of errors`,
    `# TYPE ${serviceName}_errors_total counter`,
    `${serviceName}_errors_total ${metricsSnapshot.errors}`,
    ``,
    `# HELP ${serviceName}_error_rate_percent Current error rate percentage`,
    `# TYPE ${serviceName}_error_rate_percent gauge`,
    `${serviceName}_error_rate_percent ${metricsSnapshot.errorRatePercent}`,
    ``,
    `# HELP ${serviceName}_response_time_average_ms Average response time in milliseconds`,
    `# TYPE ${serviceName}_response_time_average_ms gauge`,
    `${serviceName}_response_time_average_ms ${metricsSnapshot.responseTime.average}`,
    ``,
    `# HELP ${serviceName}_response_time_p50_ms 50th percentile response time in milliseconds`,
    `# TYPE ${serviceName}_response_time_p50_ms gauge`,
    `${serviceName}_response_time_p50_ms ${metricsSnapshot.responseTime.p50}`,
    ``,
    `# HELP ${serviceName}_response_time_p95_ms 95th percentile response time in milliseconds`,
    `# TYPE ${serviceName}_response_time_p95_ms gauge`,
    `${serviceName}_response_time_p95_ms ${metricsSnapshot.responseTime.p95}`,
    ``,
    `# HELP ${serviceName}_response_time_p99_ms 99th percentile response time in milliseconds`,
    `# TYPE ${serviceName}_response_time_p99_ms gauge`,
    `${serviceName}_response_time_p99_ms ${metricsSnapshot.responseTime.p99}`,
    ``,
    `# HELP ${serviceName}_database_connections Current number of database connections`,
    `# TYPE ${serviceName}_database_connections gauge`,
    `${serviceName}_database_connections ${metricsSnapshot.database.connections}`,
    ``,
    `# HELP ${serviceName}_database_queries_total Total number of database queries`,
    `# TYPE ${serviceName}_database_queries_total counter`,
    `${serviceName}_database_queries_total ${metricsSnapshot.database.queries}`,
    ``,
    `# HELP ${serviceName}_database_query_time_average_ms Average database query time in milliseconds`,
    `# TYPE ${serviceName}_database_query_time_average_ms gauge`,
    `${serviceName}_database_query_time_average_ms ${metricsSnapshot.database.averageQueryTime}`,
    ``,
    `# HELP ${serviceName}_memory_heap_used_mb Current heap memory used in MB`,
    `# TYPE ${serviceName}_memory_heap_used_mb gauge`,
    `${serviceName}_memory_heap_used_mb ${metricsSnapshot.memory.heapUsed}`,
    ``,
    `# HELP ${serviceName}_memory_heap_total_mb Total heap memory in MB`,
    `# TYPE ${serviceName}_memory_heap_total_mb gauge`,
    `${serviceName}_memory_heap_total_mb ${metricsSnapshot.memory.heapTotal}`,
    ``,
    `# HELP ${serviceName}_images_processed_total Total number of images processed`,
    `# TYPE ${serviceName}_images_processed_total counter`,
    `${serviceName}_images_processed_total ${metricsSnapshot.imagesProcessed}`,
    ``,
    `# HELP ${serviceName}_chat_messages_total Total number of chat messages`,
    `# TYPE ${serviceName}_chat_messages_total counter`,
    `${serviceName}_chat_messages_total ${metricsSnapshot.chatMessages}`,
    ``,
    `# HELP ${serviceName}_sessions_active Current number of active sessions`,
    `# TYPE ${serviceName}_sessions_active gauge`,
    `${serviceName}_sessions_active ${activeSessionCount()}`,
  ];

  // Add status code metrics
  Object.entries(metricsSnapshot.statusCodes).forEach(([code, count]) => {
    prometheusMetrics.push(
      ``,
      `# HELP ${serviceName}_http_requests_total_total Total HTTP requests by status code`,
      `# TYPE ${serviceName}_http_requests_total_total counter`,
      `${serviceName}_http_requests_total{status="${code}"} ${count}`
    );
  });

  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(prometheusMetrics.join("\n") + "\n");
});

router.get("/health", async (_req, res) => {
  try {
    // Perform health checks in parallel
    const [databaseHealth, discordHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkDiscordAPIHealth(),
    ]);

    const systemHealth = checkSystemHealth();
    const metricsSnapshot = metrics.snapshot();

    // Determine overall health status
    const allHealthy = [
      databaseHealth.status === "healthy" || databaseHealth.status === "not_configured",
      discordHealth.status === "healthy" || discordHealth.status === "not_configured",
      systemHealth.memory.status !== "critical",
    ].every(Boolean);

    const statusCode = allHealthy ? 200 : 503; // 503 Service Unavailable

    res.status(statusCode).json({
      ok: allHealthy,
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: VERSION,
      checks: {
        database: databaseHealth,
        discord_api: discordHealth,
        system: systemHealth,
      },
      metrics: {
        requests: metricsSnapshot.requests,
        errors: metricsSnapshot.errors,
        errorRatePercent: metricsSnapshot.errorRatePercent,
        activeConnections: metricsSnapshot.activeConnections,
        responseTime: metricsSnapshot.responseTime,
        memoryUsagePercent: systemHealth.memory.usagePercent,
      },
      sessions: {
        active: activeSessionCount(),
      },
      config: {
        oauthConfigured: isDiscordConfigured(getDiscordConfig()),
        botTokenConfigured: Boolean(config.discord.botToken),
        databaseConfigured: database.isConfigured(),
      },
    });
  } catch (error) {
    console.error("[health] Health check failed:", error);
    res.status(503).json({
      ok: false,
      status: "error",
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: VERSION,
      error: error.message,
    });
  }
});

router.get("/diag", requireRole("admin"), (req, res) => {
  const sessionEntries = getAllSessions()
    .slice(0, 50)
    .map((session) => ({
      userId: session.userId,
      role: session.role || "member",
      guildCount: session.guilds?.length || 0,
      updatedAt: session.updatedAt || session.createdAt,
    }));

  res.json({
    ok: true,
    status: "operational",
    service: SERVICE_NAME,
    version: VERSION,
    checkedAt: new Date().toISOString(),
    metrics: metrics.snapshot(),
    runtime: {
      node: process.version,
      pid: process.pid,
      uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    },
    sessions: {
      active: activeSessionCount(),
      entries: sessionEntries,
    },
    config: {
      oauthConfigured: isDiscordConfigured(getDiscordConfig()),
      botTokenConfigured: Boolean(config.discord.botToken),
      corsOrigins: config.server.corsOrigins,
    },
    user: {
      id: req.user?.id,
      role: req.user?.role,
    },
  });
});

router.get("/auth/login", authRateLimit, asyncHandler((req, res) => {
  const config = getDiscordConfig();
  if (!isDiscordConfigured(config)) {
    throw new ConfigurationError("Discord OAuth is not configured on the admin API");
  }

  const state = issueState(res);
  const redirectTarget = sanitizeRedirect(req.query.redirect);
  res.cookie(REDIRECT_COOKIE, redirectTarget, STATE_COOKIE_OPTIONS);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes,
    state,
    prompt: "consent",
  });
  const url = `https://discord.com/oauth2/authorize?${params.toString()}`;
  const wantsJson =
    req.accepts(["json", "html"]) === "json" || req.query.format === "json";

  if (wantsJson) {
    return res.json({ ok: true, url, state, redirect: redirectTarget });
  }

  return res.redirect(url);
}));

router.get("/auth/callback", authRateLimit, asyncHandler(async (req, res) => {
  const config = getDiscordConfig();
  const wantsJson =
    req.accepts(["json", "html"]) === "json" || req.query.format === "json";

  if (!isDiscordConfigured(config)) {
    throw new ConfigurationError("Discord OAuth is not configured on the admin API");
  }

  const { code, state } = req.query;
  const savedState = req.cookies?.[STATE_COOKIE];

  if (!code || !state || !savedState || state !== savedState) {
    clearOauthState(res);
    throw new StateMismatchError();
  }

  const tokens = await exchangeCodeForTokens(config, code);
  const identity = await fetchDiscordIdentity(
    tokens.token_type,
    tokens.access_token
  );

  const normalizedGuilds = Array.isArray(identity.guilds)
    ? identity.guilds.map(normalizeGuild)
    : [];

  const role = determineRole(identity.user.id, normalizedGuilds);
  const sessionData = {
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenType: tokens.token_type || "Bearer",
      scope: tokens.scope || config.scopes,
      expiresAt: tokens.expires_in
        ? Date.now() + Number(tokens.expires_in) * 1000
        : null,
    },
    guilds: normalizedGuilds,
    role,
    user: {
      id: identity.user.id,
      username: identity.user.username,
      globalName: identity.user.global_name || identity.user.username,
      avatar: identity.user.avatar || null,
    },
  };

  storeSession(identity.user.id, sessionData);

  const jwtToken = signSession({
    user: {
      id: identity.user.id,
      username: identity.user.username,
      globalName: identity.user.global_name || identity.user.username,
      avatar: identity.user.avatar || null,
      role,
    },
  });

  setAuthCookie(res, jwtToken);
  clearOauthState(res);

  const redirectTarget = sanitizeRedirect(
    req.cookies?.[REDIRECT_COOKIE] || req.query.redirect
  );

  if (wantsJson) {
    return res.json({
      ok: true,
      redirect: redirectTarget,
      user: {
        id: identity.user.id,
        username: identity.user.username,
        globalName: identity.user.global_name || identity.user.username,
        role,
      },
    });
  }

  return res.redirect(redirectTarget);
}));

router.get("/auth/me", requireAuthWithTokenValidation, cacheUserData(300, 600), (req, res) => {
  const session = req.session || getSession(req.user.id);
  res.json({
    ok: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      globalName: req.user.globalName,
      avatar: req.user.avatar,
      role: req.user.role,
    },
    guilds: session?.guilds || [],
    tokens: session?.tokens
      ? {
          expiresAt: session.tokens.expiresAt,
          hasRefresh: Boolean(session.tokens.refreshToken),
        }
      : null,
  });
});

router.post("/auth/refresh", sensitiveOpsRateLimit, requireAuthWithTokenValidation, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const newTokens = await refreshAccessToken(userId);
  
  // Optionally update JWT token with refreshed user info
  const session = getSession(userId);
  if (session) {
    const jwtToken = signSession({
      user: {
        id: session.user.id,
        username: session.user.username,
        globalName: session.user.globalName,
        avatar: session.user.avatar,
        role: session.role,
      },
    });
    setAuthCookie(res, jwtToken);
  }

  res.json({
    ok: true,
    tokens: {
      expiresAt: newTokens.expiresAt,
      hasRefresh: Boolean(newTokens.refreshToken),
    },
  });
}));

router.post("/auth/logout", requireAuthWithTokenValidation, (req, res) => {
  // Clear user-specific cache on logout
  const cache = getAPICache();
  cache.invalidate(`api:*user_${req.user.id}*`).catch(err => {
    console.warn('Failed to invalidate user cache on logout:', err);
  });

  clearSession(req.user.id);
  clearAuthCookie(res);
  res.json({ ok: true, loggedOut: true });
});

router.get("/guilds", requireRole("club"), async (req, res) => {
  const session = req.session || getSession(req.user.id);
  const guilds = session?.guilds || [];
  const enriched = await annotateGuilds(guilds);
  res.json({
    ok: true,
    guilds: enriched,
  });
});

// Mount additional route modules
try {
  const chatRoutes = require("./src/routes/chat");
  router.use("/chat", chatRateLimit, chatRoutes);
  console.log("[admin-api] Mounted /api/chat routes");
} catch (err) {
  console.warn("[admin-api] Failed to mount chat routes:", err.message);
}

try {
  const snailRoutes = require("./src/routes/snail");
  router.use("/snail/:guildId", snailRoutes);
  console.log("[admin-api] Mounted /api/snail/:guildId routes");
} catch (err) {
  console.warn("[admin-api] Failed to mount snail routes:", err.message);
}

try {
  const personalityRoutes = require("./src/routes/personality");
  router.use("/", personalityRoutes);
  console.log("[admin-api] Mounted /api/:guildId/personality routes");
} catch (err) {
  console.warn("[admin-api] Failed to mount personality routes:", err.message);
}

try {
  const statsRoutes = require("./src/routes/stats");
  router.use("/stats", statsRoutes);
  console.log("[admin-api] Mounted /api/stats routes");
} catch (err) {
  console.warn("[admin-api] Failed to mount stats routes:", err.message);
}

try {
  const diagnosticsRoutes = require("./src/routes/diagnostics");
  router.use("/", diagnosticsRoutes);
  console.log("[admin-api] Mounted /api/diagnostics route");
} catch (err) {
  console.warn("[admin-api] Failed to mount diagnostics routes:", err.message);
}

// API Gateway Pattern Implementation
// Centralized middleware pipeline for cross-cutting concerns
const apiGateway = new ApiGateway();

// Add middleware to pipeline in order of execution (applied to /api routes only)
// 1. Rate limiting (applied globally to all API routes)
apiGateway.use("/api", apiRateLimit);

// 2. Authentication middleware (resolves user from session)
apiGateway.use("/api", (req, res, next) => {
  resolveUser(req);
  next();
});

// 3. Validation middleware (input sanitization)
apiGateway.use("/api", sanitizeInput);

// 4. Logging middleware (request/response logging)
apiGateway.use("/api", requestLogger);

// Route all /api/* requests through the gateway to admin API router
apiGateway.route("/api", router);

// Build and mount the gateway
const gatewayRouter = apiGateway.build();

// Mount gateway router (handles /api/* routes with middleware pipeline)
app.use("/", gatewayRouter);

// Log gateway configuration on startup
apiGateway.logConfiguration();

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Sentry error handler (must be before general error handler)
app.use(sentryErrorHandler);

// Error handler (must be last)
app.use(errorHandler);

// Periodic alert checking
function startAlertMonitoring() {
  // Check alerts every minute
  setInterval(() => {
    try {
      const metricsSnapshot = metrics.snapshot();
      checkAlerts(metricsSnapshot);
    } catch (error) {
      logger.error({ error: error.message }, "Error in alert monitoring");
    }
  }, 60 * 1000); // 60 seconds

  logger.info("Alert monitoring started");
}

// Initialize database before starting server
async function startServer() {
  try {
    // Configuration is validated when loaded via require('./src/lib/config')
    console.log("[admin-api] Configuration loaded and validated");

    console.log("[admin-api] Initializing database connection...");
    const dbInitialized = await database.initialize();
    if (!dbInitialized) {
      console.error("[admin-api] Failed to initialize database. Server will start without database functionality.");
    } else {
      console.log("[admin-api] Database initialized successfully");
    }

    console.log("[admin-api] Initializing job queues...");
    const queuesInitialized = await queueManager.initialize();
    if (!queuesInitialized) {
      console.error("[admin-api] Failed to initialize job queues. Server will start without background job processing.");
    } else {
      console.log("[admin-api] Job queues initialized successfully");
    }

    console.log("[admin-api] Initializing API cache...");
    try {
      const { initAPICache } = require("./src/middleware/cache");
      await initAPICache();
      console.log("[admin-api] API cache initialized successfully");
    } catch (error) {
      console.warn("[admin-api] Failed to initialize API cache:", error.message);
    }

    app.listen(PORT, "0.0.0.0", () => {
      logger.info({ port: PORT, service: SERVICE_NAME, version: VERSION }, "Server started");

      // Start alert monitoring after server is running
      startAlertMonitoring();
    });
  } catch (err) {
    console.error("[admin-api] Failed to start server:", err);
    process.exit(1);
  }
}

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  console.log(`[admin-api] Received ${signal}, shutting down gracefully...`);

  try {
    // Close job queues
    await queueManager.close();
    console.log("[admin-api] Job queues closed");

    // Close database connections
    await database.close();
    console.log("[admin-api] Database connections closed");

    console.log("[admin-api] Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("[admin-api] Error during graceful shutdown:", error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
