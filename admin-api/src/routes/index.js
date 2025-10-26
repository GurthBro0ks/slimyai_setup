"use strict";
const express = require("express");
const router = express.Router();

const authRoutes = require("./auth");
const guildRoutes = require("./guilds");
const guildSettingsRoutes = require("./guild-settings");
const guildChannelsRoutes = require("./guild-channels");
const personalityRoutes = require("./personality");
const uploadsRoutes = require("./uploads");
const diagRoutes = require("./diag");
const botRoutes = require("./bot");
const statsRoutes = require("./stats");

router.get("/api/", (_req, res) => res.json({ ok: true }));
router.use("/api/auth", authRoutes);
router.use("/api/guilds", guildRoutes);
router.use("/api/guilds", guildSettingsRoutes);
router.use("/api/guilds", guildChannelsRoutes);
router.use("/api/guilds", personalityRoutes);
router.use("/api/uploads", uploadsRoutes);
router.use("/api/diag", diagRoutes);
router.use("/api/bot", botRoutes);
router.use("/api/stats", statsRoutes);

module.exports = router;
