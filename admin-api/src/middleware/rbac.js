"use strict";

const { hasRole } = require("../services/rbac");

function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user?.role || !hasRole(req.user.role, minRole)) {
      return res.status(403).json({ error: "forbidden" });
    }
    return next();
  };
}

function requireGuildAccess(req, res, next) {
  const guildId =
    req.params?.guildId || req.body?.guildId || req.query?.guildId;

  if (!guildId) {
    return res.status(400).json({ error: "guildId-required" });
  }

  const guild = req.user?.guilds?.find((entry) => entry.id === guildId);
  if (!guild) {
    return res.status(403).json({ error: "guild-access-denied" });
  }

  req.guild = guild;
  return next();
}

module.exports = {
  requireRole,
  requireGuildAccess,
};
