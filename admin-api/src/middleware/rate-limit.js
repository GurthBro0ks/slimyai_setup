"use strict";

const rateLimit = require("express-rate-limit");

const config = require("../config");

const tasksLimiter = rateLimit({
  windowMs: config.rateLimit.tasks.windowMs,
  max: config.rateLimit.tasks.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.sub || req.ip;
    const guildId = req.params?.guildId || "global";
    return `${userId}:${guildId}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: "rate-limit" });
  },
});

module.exports = { tasksLimiter };
