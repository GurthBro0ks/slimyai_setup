"use strict";

const express = require("express");
const os = require("os");
const { requireAuth } = require("../middleware/auth");
const { summarizeUploads } = require("../services/uploads");

const router = express.Router();

const CACHE_TTL_MS = 30_000;
let cache = { at: 0, payload: null };

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return "0s";
  const parts = [];
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

function captureMemory() {
  const usage = process.memoryUsage();
  const toMb = (value) => Math.round((value / 1024 / 1024) * 10) / 10;
  return {
    rssMB: toMb(usage.rss),
    heapUsedMB: toMb(usage.heapUsed),
    heapTotalMB: toMb(usage.heapTotal),
    externalMB: toMb(usage.external),
  };
}

router.get("/diagnostics", requireAuth, async (_req, res) => {
  try {
    const now = Date.now();
    if (cache.payload && now - cache.at < CACHE_TTL_MS) {
      return res.json(cache.payload);
    }

    const uptimeSec = Math.floor(process.uptime());
    const memory = captureMemory();
    const uploadsSummary = await summarizeUploads();

    const payload = {
      ok: true,
      pid: process.pid,
      node: process.version,
      host: os.hostname(),
      uptimeSec,
      uptimeHuman: formatUptime(uptimeSec),
      memory,
      uploads: {
        total: uploadsSummary.total,
        today: uploadsSummary.today,
      },
      generatedAt: new Date().toISOString(),
    };

    cache = { at: now, payload };
    res.json(payload);
  } catch (error) {
    console.error("[diagnostics] failed", error);
    res.status(500).json({
      ok: false,
      error: "diagnostics_failed",
      message: error.message,
    });
  }
});

module.exports = router;

