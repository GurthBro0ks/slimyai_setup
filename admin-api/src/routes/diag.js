"use strict";

const os = require("os");
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { summarizeUploads } = require("../services/uploads");

const router = express.Router();

function buildAdminSnapshot() {
  return {
    uptimeSec: Math.floor(process.uptime()),
    memory: {
      rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)),
    },
    node: process.version,
    pid: process.pid,
    hostname: os.hostname(),
  };
}

router.get("/", requireAuth, async (_req, res) => {
  try {
    const uploads = await summarizeUploads().catch(() => ({
      total: 0,
      today: 0,
      byGuild: {},
    }));

    res.json({
      ok: true,
      admin: buildAdminSnapshot(),
      uploads,
    });
  } catch (err) {
    console.error("[diag] failed to build diagnostics:", err);
    res.status(500).json({ error: "diag_failed" });
  }
});

module.exports = router;
