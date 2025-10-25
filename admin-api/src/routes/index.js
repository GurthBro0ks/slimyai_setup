"use strict";
const express = require("express");
const router = express.Router();

const authRoutes = require("./auth");
const guildRoutes = require("./guilds");
const uploadsRoutes = require("./uploads");
const diagRoutes = require("./diag");
const botRoutes = require("./bot");

router.get("/api/", (_req, res) => res.json({ ok: true }));
router.use("/api/auth", authRoutes);
router.use("/api/guilds", guildRoutes);
router.use("/api/uploads", uploadsRoutes);
router.use("/api/diag", diagRoutes);
router.use("/api/bot", botRoutes);

module.exports = router;
