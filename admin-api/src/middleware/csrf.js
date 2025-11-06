"use strict";

const config = require("../config");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (!req.user?.csrfToken) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const headerName = config.csrf.headerName;
  const headerValue =
    req.headers?.[headerName] || req.headers?.[headerName.toLowerCase()];

  if (!headerValue || headerValue !== req.user.csrfToken) {
    return res.status(403).json({ error: "invalid-csrf-token" });
  }

  return next();
}

module.exports = { requireCsrf };
