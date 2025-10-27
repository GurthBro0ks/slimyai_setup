"use strict";

const express = require("express");
const { COOKIE_NAME, verifySession } = require("../../lib/jwt");

const router = express.Router();

// Simple ping endpoint for health checks
router.get("/ping", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

// Auth debugging endpoint
router.get("/auth/debug", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  
  if (!token) {
    return res.json({ cookie: false, message: "No auth cookie found" });
  }

  try {
    const session = verifySession(token);
    const user = session?.user;
    
    if (!user) {
      return res.json({ cookie: true, badToken: true, message: "Cookie present but invalid session" });
    }

    const guilds = Array.isArray(user.guilds) ? user.guilds : [];
    return res.json({
      cookie: true,
      user: {
        id: user.id,
        username: user.username,
        globalName: user.globalName,
        role: user.role || "member",
        guildCount: guilds.length,
      },
    });
  } catch (err) {
    return res.json({
      cookie: true,
      badToken: true,
      error: err.message,
      message: "Failed to verify session token",
    });
  }
});

module.exports = router;
