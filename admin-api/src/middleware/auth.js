"use strict";

const config = require("../config");
const { hasRole } = require("../services/rbac");
const { verifySessionToken, getCookieOptions } = require("../services/token");

function logReadAuth(message, meta = {}) {
  try {
    console.info("[admin-api] readAuth:", message, meta);
  } catch {
    /* ignore logging failures */
  }
}

function resolveUser(req) {
  if ("_cachedUser" in req) {
    return req._cachedUser;
  }

  const token = req.cookies?.[config.jwt.cookieName];
  if (!token) {
    logReadAuth("cookie missing", { cookieName: config.jwt.cookieName });
    req._cachedUser = null;
    return null;
  }
  logReadAuth("cookie present", { cookieName: config.jwt.cookieName });

  try {
    const payload = verifySessionToken(token);
    const sessionUser = payload?.user || payload;
    req.session = payload?.session || payload;
    req.user = sessionUser || null;
    req._cachedUser = req.user;
    if (req.user) {
      logReadAuth("user hydrated", { userId: req.user.id });
    } else {
      logReadAuth("token verified but no user payload");
    }
    return req.user;
  } catch (err) {
    logReadAuth("token verification failed", { error: err.message });
    req._cachedUser = null;
    return null;
  }
}

function attachSession(req, res, next) {
  const user = resolveUser(req);
  if (!user && req.cookies?.[config.jwt.cookieName]) {
    res.clearCookie(config.jwt.cookieName, getCookieOptions());
  }
  return next();
}

function unauthorized(res) {
  return res.status(401).json({
    ok: false,
    code: "UNAUTHORIZED",
    message: "Authentication required",
  });
}

function forbidden(res, message = "Insufficient role") {
  return res.status(403).json({
    ok: false,
    code: "FORBIDDEN",
    message,
  });
}

function requireAuth(req, res, next) {
  const user = req.user || resolveUser(req);
  if (!user) {
    return unauthorized(res);
  }
  return next();
}

function requireRole(minRole = "admin") {
  return (req, res, next) => {
    const user = req.user || resolveUser(req);
    if (!user) {
      return unauthorized(res);
    }
    if (!user.role || !hasRole(user.role, minRole)) {
      return forbidden(res);
    }
    return next();
  };
}

function resolveGuildId(req, paramKey = "guildId") {
  return (
    req.params?.[paramKey] ||
    req.query?.[paramKey] ||
    req.body?.[paramKey] ||
    req.params?.guildId ||
    req.query?.guildId ||
    req.body?.guildId ||
    null
  );
}

function requireGuildMember(paramKey = "guildId") {
  return (req, res, next) => {
    const user = req.user || resolveUser(req);
    if (!user) {
      return unauthorized(res);
    }

    const guildId = resolveGuildId(req, paramKey);
    if (!guildId) {
      return res.status(400).json({
        ok: false,
        code: "BAD_REQUEST",
        message: "Missing guildId parameter",
      });
    }

    if (user.role && hasRole(user.role, "admin")) {
      return next();
    }

    const guilds = user.guilds || [];
    const guild = guilds.find((entry) => entry.id === guildId);
    if (!guild) {
      return forbidden(res, "You are not a member of this guild");
    }

    req.guild = guild;
    return next();
  };
}

function readAuth(req, _res, next) {
  resolveUser(req);
  return next();
}

module.exports = {
  attachSession,
  requireAuth,
  requireRole,
  requireGuildMember,
  resolveUser,
  readAuth,
};
