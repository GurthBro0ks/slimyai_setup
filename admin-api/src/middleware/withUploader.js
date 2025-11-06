"use strict";

/**
 * Middleware to attach uploader info from authenticated user
 */
module.exports = function withUploader(req, _res, next) {
  const u = req.user || {};
  req.uploader = u.globalName || u.username || u.id || "unknown";
  next();
};
