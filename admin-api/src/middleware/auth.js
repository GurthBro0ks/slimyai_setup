"use strict";

/**
 * Authentication Middleware
 * 
 * Provides authentication and authorization middleware for Express routes.
 * Handles JWT token verification, session management, and role-based access control.
 * 
 * Middleware functions:
 *   - requireAuth: Require any authenticated user
 *   - requireRole(minRole): Require specific role or higher
 *   - requireGuildMember: Require guild membership
 */

const { COOKIE_NAME, verifySession } = require('../../lib/jwt');
const { getSession } = require('../../lib/session-store');

/**
 * Resolve and cache user from request.
 * Checks JWT token in cookies and hydrates user from session store.
 * 
 * @param {object} req - Express request object
 * @returns {object|null} User object or null if not authenticated
 */
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

/**
 * Require authentication middleware.
 * Returns 401 if user is not authenticated.
 * 
 * Usage:
 *   router.get('/protected', requireAuth, handler);
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
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

/**
 * Require specific role or higher middleware factory.
 * Role hierarchy: member < club < admin
 * 
 * Usage:
 *   router.get('/admin-only', requireRole('admin'), handler);
 *   router.get('/club-feature', requireRole('club'), handler);
 * 
 * @param {string} minRole - Minimum required role ("member", "club", or "admin")
 * @returns {function} Express middleware function
 */
function requireRole(minRole) {
  // Role hierarchy: lower index = lower privilege
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

/**
 * Require guild membership middleware factory.
 * Checks if user is a member of the specified guild.
 * Admins bypass this check and can access any guild.
 * 
 * Usage:
 *   router.get('/guild/:guildId/data', requireGuildMember(), handler);
 *   router.get('/server/:serverId/data', requireGuildMember('serverId'), handler);
 * 
 * @param {string} paramName - Name of route parameter containing guild ID (default: "guildId")
 * @returns {function} Express middleware function
 */
function requireGuildMember(paramName = "guildId") {
  return (req, res, next) => {
    const user = resolveUser(req);
    if (!user) {
      return res.status(401).json({
        ok: false,
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const guildId = req.params[paramName];
    if (!guildId) {
      return res.status(400).json({
        ok: false,
        code: "BAD_REQUEST",
        message: `Missing ${paramName} parameter`,
      });
    }

    // Admin users can access any guild
    if (user.role === "admin") {
      req.user = user;
      req.session = req.session || getSession(user.id);
      return next();
    }

    // Check if user is a member of the guild
    const session = req.session || getSession(user.id);
    const guilds = session?.guilds || user.guilds || [];
    const isMember = guilds.some(g => String(g.id) === String(guildId));

    if (!isMember) {
      return res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: "You are not a member of this guild",
      });
    }

    req.user = user;
    req.session = session;
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireGuildMember,
  resolveUser,
};
