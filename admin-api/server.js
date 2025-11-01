#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const morgan = require("morgan");

const metrics = require("./src/lib/metrics");
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

const startedAt = new Date();
const SERVICE_NAME = process.env.ADMIN_API_SERVICE_NAME || "slimy-admin-api";
const VERSION = process.env.ADMIN_API_VERSION || "dev";
const PORT = Number(process.env.PORT || 3080);

const DEFAULT_ALLOWED_ORIGINS = [
  "https://admin.slimyai.xyz",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DEFAULT_REDIRECT_URI = "https://admin.slimyai.xyz/api/auth/callback";
const DEFAULT_SCOPES = "identify guilds";

const BOT_TOKEN = (process.env.DISCORD_BOT_TOKEN || "").trim();
const COOKIE_DOMAIN = (process.env.COOKIE_DOMAIN || ".slimyai.xyz").trim();

const PERMISSION_ADMINISTRATOR = 0x8n;
const PERMISSION_MANAGE_GUILD = 0x20n;

const STATE_COOKIE = "oauth_state";
const REDIRECT_COOKIE = "oauth_redirect";
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  domain: COOKIE_DOMAIN,
  path: "/",
  maxAge: 5 * 60 * 1000,
};

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[admin-api] SESSION_SECRET not configured; falling back to development secret."
  );
}

function parseList(value, defaults = []) {
  const list = (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length ? list : defaults;
}

function parseIdList(value) {
  return parseList(value, []);
}

const CORS_ORIGINS = parseList(
  process.env.CORS_ALLOW_ORIGIN,
  DEFAULT_ALLOWED_ORIGINS
);
const ADMIN_USER_IDS = parseIdList(process.env.ADMIN_USER_IDS);
const CLUB_USER_IDS = parseIdList(process.env.CLUB_USER_IDS);

const app = express();

app.set("trust proxy", true);
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  metrics.recordRequest();
  next();
});
app.use((req, _res, next) => {
  resolveUser(req);
  next();
});

function resolveUser(req) {
  if (req._cachedUser !== undefined) {
    return req._cachedUser;
  }

  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    req._cachedUser = null;
    return null;
  }

  try {
    const decoded = verifySession(token);
    const baseUser = decoded?.user;
    if (!baseUser?.id) {
      req._cachedUser = null;
      return null;
    }

    const session = getSession(baseUser.id);
    if (session) {
      const hydrated = {
        id: baseUser.id,
        username: baseUser.username || baseUser.globalName || "user",
        globalName: baseUser.globalName || baseUser.username || "user",
        avatar: baseUser.avatar || null,
        role: session.role || baseUser.role || "member",
        guilds: session.guilds || [],
      };
      req.session = session;
      req._cachedUser = hydrated;
      req.user = hydrated;
      return hydrated;
    }

    const fallback = {
      id: baseUser.id,
      username: baseUser.username || baseUser.globalName || "user",
      globalName: baseUser.globalName || baseUser.username || "user",
      avatar: baseUser.avatar || null,
      role: baseUser.role || "member",
      guilds: baseUser.guilds || [],
    };
    req._cachedUser = fallback;
    req.user = fallback;
    return fallback;
  } catch (err) {
    console.warn("[auth] Failed to verify session token:", err.message);
    req._cachedUser = null;
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  req.user = user;
  req.session = req.session || getSession(user.id);
  next();
}

function requireRole(minRole) {
  const order = ["member", "club", "admin"];
  return (req, res, next) => {
    const user = resolveUser(req);
    if (!user) {
      return res.status(401).json({
        ok: false,
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const currentIdx = order.indexOf(user.role || "member");
    const requiredIdx = order.indexOf(minRole);
    if (currentIdx < requiredIdx) {
      return res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: "Insufficient role",
      });
    }

    req.user = user;
    req.session = req.session || getSession(user.id);
    next();
  };
}

function getDiscordConfig() {
  return {
    clientId: (process.env.DISCORD_CLIENT_ID || "").trim(),
    clientSecret: (process.env.DISCORD_CLIENT_SECRET || "").trim(),
    redirectUri:
      (process.env.DISCORD_REDIRECT_URI || "").trim() || DEFAULT_REDIRECT_URI,
    scopes:
      (process.env.DISCORD_OAUTH_SCOPES || "").trim() || DEFAULT_SCOPES,
  };
}

function isDiscordConfigured(config) {
  return Boolean(config.clientId && config.clientSecret);
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
  if (ADMIN_USER_IDS.includes(userId)) {
    return "admin";
  }

  if (
    guilds.some((guild) => hasPermission(guild.permissions, PERMISSION_ADMINISTRATOR))
  ) {
    return "admin";
  }

  if (CLUB_USER_IDS.includes(userId)) {
    return "club";
  }

  if (
    guilds.some((guild) => hasPermission(guild.permissions, PERMISSION_MANAGE_GUILD))
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
  if (!BOT_TOKEN) {
    return guilds.map((guild) => ({ ...guild, installed: null }));
  }

  return Promise.all(
    guilds.map(async (guild) => {
      try {
        const response = await fetch(`${DISCORD_API}/guilds/${guild.id}`, {
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
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

async function exchangeCodeForTokens(config, code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `token_exchange_failed:${response.status}${
        detail ? `:${detail.slice(0, 120)}` : ""
      }`
    );
  }

  return response.json();
}

async function fetchDiscordIdentity(tokenType, accessToken) {
  const headers = {
    Authorization: `${tokenType || "Bearer"} ${accessToken}`,
    "User-Agent": "slimy-admin-api/1.0 (+https://admin.slimyai.xyz)",
  };

  const [userResponse, guildResponse] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, { headers }),
    fetch(`${DISCORD_API}/users/@me/guilds`, { headers }),
  ]);

  if (!userResponse.ok) {
    throw new Error(`user_fetch_failed:${userResponse.status}`);
  }

  if (!guildResponse.ok) {
    throw new Error(`guild_fetch_failed:${guildResponse.status}`);
  }

  const user = await userResponse.json();
  const guilds = await guildResponse.json();

  return { user, guilds };
}

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    sessions: {
      active: activeSessionCount(),
    },
    config: {
      oauthConfigured: isDiscordConfigured(getDiscordConfig()),
      botTokenConfigured: Boolean(BOT_TOKEN),
    },
  });
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
      botTokenConfigured: Boolean(BOT_TOKEN),
      corsOrigins: CORS_ORIGINS,
    },
    user: {
      id: req.user?.id,
      role: req.user?.role,
    },
  });
});

router.get("/auth/login", (req, res) => {
  const config = getDiscordConfig();
  if (!isDiscordConfigured(config)) {
    return res.status(503).json({
      ok: false,
      code: "CONFIG_MISSING",
      message: "Discord OAuth is not configured on the admin API",
    });
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
});

router.get("/auth/callback", async (req, res) => {
  const config = getDiscordConfig();
  const wantsJson =
    req.accepts(["json", "html"]) === "json" || req.query.format === "json";

  if (!isDiscordConfigured(config)) {
    const payload = {
      ok: false,
      code: "CONFIG_MISSING",
      message: "Discord OAuth is not configured on the admin API",
    };
    return wantsJson ? res.status(503).json(payload) : res.redirect("/?error=config_missing");
  }

  const { code, state } = req.query;
  const savedState = req.cookies?.[STATE_COOKIE];

  if (!code || !state || !savedState || state !== savedState) {
    clearOauthState(res);
    const payload = {
      ok: false,
      code: "STATE_MISMATCH",
      message: "OAuth state did not match",
    };
    return wantsJson ? res.status(400).json(payload) : res.redirect("/?error=state_mismatch");
  }

  try {
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
  } catch (error) {
    console.error("[auth/callback] OAuth flow failed:", error);
    clearOauthState(res);
    const payload = {
      ok: false,
      code: "OAUTH_FAILED",
      message: "Unable to complete Discord login",
    };
    return wantsJson ? res.status(502).json(payload) : res.redirect("/?error=oauth_failed");
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
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

router.post("/auth/logout", requireAuth, (req, res) => {
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

app.use("/api", router);
app.use("/", router);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

app.use((err, _req, res, _next) => {
  console.error("[admin-api] Unhandled error", err);
  res.status(500).json({
    ok: false,
    code: "SERVER_ERROR",
    message: err.message || "Unexpected error",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[admin-api] Listening on port ${PORT}`);
});
