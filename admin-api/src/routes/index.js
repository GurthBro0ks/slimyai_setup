"use strict";

const express = require("express");

const authRoutes = require("./auth");
const guildRoutes = require("./guilds");
const { guildTaskRouter, taskStreamRouter } = require("./tasks");
const backupRoutes = require("./backup");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ ok: true });
});

router.use("/auth", authRoutes);
router.use("/guilds", guildRoutes);
router.use("/guilds", guildTaskRouter);
router.use("/", taskStreamRouter);
router.use("/backup", backupRoutes);

module.exports = router;
