"use strict";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3081"];
const ROLE_ORDER = ["viewer", "editor", "admin", "owner"];

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveOrigins() {
  const fromEnv = parseList(process.env.ADMIN_ALLOWED_ORIGINS);
  if (fromEnv.length) return fromEnv;
  return DEFAULT_ALLOWED_ORIGINS;
}

const config = {
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    redirectUri:
      process.env.DISCORD_REDIRECT_URI ||
      "http://localhost:3080/api/auth/callback",
    scopes: ["identify", "guilds"],
  },
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
    cookieName: process.env.ADMIN_TOKEN_COOKIE || "slimy_admin_token",
    cookieDomain:
      process.env.COOKIE_DOMAIN ||
      process.env.ADMIN_COOKIE_DOMAIN ||
      undefined,
    cookieSecure: parseBoolean(
      process.env.COOKIE_SECURE ?? process.env.ADMIN_COOKIE_SECURE,
      process.env.NODE_ENV === "production",
    ),
    cookieSameSite:
      (process.env.COOKIE_SAMESITE ||
        process.env.ADMIN_COOKIE_SAMESITE ||
        "lax").toLowerCase(),
    maxAgeSeconds: Number(process.env.JWT_MAX_AGE_SECONDS || 12 * 60 * 60),
  },
  csrf: {
    headerName: "x-csrf-token",
  },
  network: {
    trustProxy: parseBoolean(
      process.env.TRUST_PROXY ?? process.env.ADMIN_TRUST_PROXY,
      true,
    ),
  },
  roles: {
    order: ROLE_ORDER,
    ownerIds: new Set(parseList(process.env.ADMIN_OWNER_IDS)),
  },
  guilds: {
    allowedIds: new Set(parseList(process.env.ADMIN_GUILD_IDS)),
  },
  ui: {
    origins: resolveOrigins(),
    successRedirect:
      process.env.ADMIN_REDIRECT_SUCCESS || "http://localhost:3081",
    failureRedirect:
      process.env.ADMIN_REDIRECT_FAILURE || "http://localhost:3081/login",
  },
  rateLimit: {
    tasks: {
      windowMs: Number(process.env.ADMIN_TASK_LIMIT_WINDOW_MS || 60_000),
      max: Number(process.env.ADMIN_TASK_LIMIT_MAX || 5),
    },
  },
  audit: {
    enabled: process.env.ADMIN_AUDIT_DISABLED !== "true",
  },
  cors: {
    enabled: parseBoolean(process.env.CORS_ENABLED, false),
    allowedOrigin:
      process.env.ALLOWED_ORIGIN ||
      process.env.ADMIN_ALLOWED_ORIGIN ||
      null,
  },
  security: {
    hstsMaxAge: Number(process.env.HSTS_MAX_AGE || 31536000),
  },
  baseUrl: process.env.ADMIN_BASE_URL || "http://localhost:3081",
  backup: {
    root: process.env.BACKUP_ROOT || "/var/backups/slimy",
    mysqlDir:
      process.env.BACKUP_MYSQL_DIR || "/var/backups/slimy/mysql",
    dataDir: process.env.BACKUP_DATA_DIR || "/var/backups/slimy/data",
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 14),
  },
};

module.exports = config;
