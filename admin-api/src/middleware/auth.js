"use strict";

const config = require("../config");
const { verifySessionToken, getCookieOptions } = require("../services/token");

function attachSession(req, res, next) {
  const token = req.cookies?.[config.jwt.cookieName];
  if (!token) return next();

  try {
    const payload = verifySessionToken(token);
    req.user = payload;
  } catch {
    res.clearCookie(config.jwt.cookieName, getCookieOptions());
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

module.exports = {
  attachSession,
  requireAuth,
};
