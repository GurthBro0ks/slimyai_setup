"use strict";

/**
 * Snail Tools Routes
 * 
 * Handles Super Snail game-related API endpoints including:
 * - Screenshot analysis using OpenAI Vision
 * - User stats retrieval
 * - Secret codes fetching
 * - Tier cost calculations
 * 
 * All routes require authentication, member role, and guild membership.
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const mime = require("mime-types");
const { analyzeSnailDataUrl } = require("../../../lib/snail-vision");
const { readJson, writeJson } = require("../lib/store");
const { UPLOADS_DIR } = require("../services/uploads");
const metrics = require("../lib/monitoring/metrics");
const {
  requireAuth,
  requireRole,
  requireGuildMember,
} = require("../middleware/auth");
const { requireCsrf } = require("../middleware/csrf");
const { cacheGuildData, cacheStats } = require("../middleware/cache");
const { snail, validateFileUploads } = require("../lib/validation/schemas");
const { apiHandler } = require("../lib/errors");

const router = express.Router({ mergeParams: true });

// Upload configuration
const MAX_FILES = 8;  // Maximum number of files per upload
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 10);  // Max file size in MB
const MAX_BYTES = MAX_MB * 1024 * 1024;
const SNELP_CODES_URL =
  process.env.SNELP_CODES_URL || "https://snelp.com/api/codes";

// Directory paths for file storage
const UPLOAD_ROOT = path.join(UPLOADS_DIR, "snail");
const DATA_ROOT = path.join(process.cwd(), "data", "snail");
const CODES_ROOT = path.join(process.cwd(), "data", "codes");

// Ensure directories exist
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(DATA_ROOT, { recursive: true });
fs.mkdirSync(CODES_ROOT, { recursive: true });

// Configure multer for file uploads
// Files are stored in guild-specific directories
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const guildFolder = path.join(UPLOAD_ROOT, String(req.params.guildId));
      fs.mkdirSync(guildFolder, { recursive: true });
      cb(null, guildFolder);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    // Sanitize filename and add timestamp to prevent collisions
    const safe = (file.originalname || "upload.png").replace(
      /[^a-z0-9._-]/gi,
      "_",
    );
    const stamp = Date.now().toString(36);
    const ext = path.extname(safe) || ".png";
    cb(null, `${path.basename(safe, ext)}.${stamp}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: MAX_FILES,
    fileSize: MAX_BYTES,
  },
});

// All snail routes require authentication, member role, and guild membership
router.use(requireAuth);
router.use(requireRole("member"));
router.use(requireGuildMember("guildId"));

/**
 * POST /api/snail/:guildId/analyze
 * 
 * Analyze Super Snail screenshots using OpenAI Vision API.
 * 
 * Requires: member role, guild membership
 * 
 * Request: multipart/form-data
 *   - images: File[] (required) - Up to 8 image files, max 10MB each
 *   - prompt: string (optional) - Additional context for analysis
 * 
 * Response:
 *   - ok: boolean
 *   - saved: boolean - Whether analysis was saved
 *   - guildId: string
 *   - userId: string
 *   - prompt: string
 *   - results: array - Analysis results for each image
 *   - savedAt: string - ISO timestamp
 * 
 * Errors:
 *   - 400: missing_images - No images provided
 *   - 413: file_too_large - File exceeds size limit
 *   - 503: vision_unavailable - OpenAI API key not configured
 *   - 500: server_error - Internal server error
 */
router.post(
  "/analyze",
  requireCsrf,
  express.json(),
  snail.upload,
  (req, res, next) => {
    upload.array("images", MAX_FILES)(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "file_too_large" });
        }
        return res
          .status(400)
          .json({ error: err.message || "upload_failed", code: err.code });
      }
      return next();
    });
  },
  validateFileUploads,
  async (req, res) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "vision_unavailable" });
    }
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "missing_images" });
    }
    try {
      const guildId = String(req.params.guildId);
      const userId = req.user.id;
      const prompt = String(req.body?.prompt || "").trim();

      const analyses = [];
      for (const file of files) {
        const buffer = await fsp.readFile(file.path);
        const mimeType =
          file.mimetype || mime.lookup(file.originalname) || "image/png";
        const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
        const analysis = await analyzeSnailDataUrl(dataUrl, { prompt });
        const publicUrl = `/api/uploads/files/snail/${guildId}/${path.basename(file.path)}`;
        analyses.push({
          file: {
            name: file.originalname,
            storedAs: path.basename(file.path),
            size: file.size,
            mimetype: mimeType,
            url: publicUrl,
          },
          uploadedBy: {
            id: req.user.id,
            name: req.user.globalName || req.user.username,
            role: req.user.role,
          },
          analysis,
        });
      }

      const payload = {
        guildId,
        userId,
        prompt,
        results: analyses,
        uploadedAt: new Date().toISOString(),
      };

      const target = path.join(DATA_ROOT, guildId, userId, "latest.json");
      await writeJson(target, payload);

      metrics.recordImages(files.length);

      res.json({
        ok: true,
        saved: true,
        guildId,
        userId,
        prompt,
        results: analyses,
        savedAt: payload.uploadedAt,
      });
    } catch (err) {
      console.error("[snail/analyze] failed");
      res.status(500).json({ error: "server_error" });
    }
  },
);

/**
 * GET /api/snail/:guildId/stats
 *
 * Get user's latest stats analysis for the guild.
 *
 * Requires: member role, guild membership
 *
 * Response:
 *   - ok: boolean
 *   - record: object - Latest analysis record, or
 *   - empty: boolean - true if no stats found
 *
 * Errors:
 *   - 500: server_error - Internal server error
 */
router.get("/stats", snail.stats, cacheGuildData(300, 600), async (req, res) => {
  try {
    const guildId = String(req.params.guildId);
    const userId = req.user.id;
    const target = path.join(DATA_ROOT, guildId, userId, "latest.json");
    const record = await readJson(target, null);
    if (!record) {
      return res.json({ ok: true, empty: true });
    }
    return res.json({ ok: true, record });
  } catch (err) {
    console.error("[snail/stats] failed", err);
    return res.status(500).json({ error: "server_error" });
  }
});

/**
 * GET /api/snail/:guildId/analyze_help
 *
 * Get help text and tips for screenshot analysis.
 *
 * Requires: member role, guild membership
 *
 * Response:
 *   - ok: boolean
 *   - help: array - Array of help text strings
 */
router.get("/analyze_help", snail.help, cacheStats(3600, 7200), (_req, res) => {
  res.json({
    ok: true,
    help: [
      "Use portrait screenshots with clear stat columns; crop out chat popups when possible.",
      "Upload up to eight images per run. Make sure the Pentagon stats and loadout are visible.",
      "Add an optional prompt to explain what you need (e.g. “compare rush vs last week”).",
      "If numbers look wrong, re-upload crisp captures or re-run with a single high-quality screenshot.",
    ],
  });
});

/**
 * POST /api/snail/:guildId/calc
 *
 * Calculate tier cost percentage.
 *
 * Requires: member role, guild membership
 *
 * Request body:
 *   - sim: number (required) - SIM value
 *   - total: number (required) - Total value
 *
 * Response:
 *   - ok: boolean
 *   - sim: number - SIM value
 *   - total: number - Total value
 *   - simPct: number - Calculated percentage (sim / total)
 */
router.post("/calc", requireCsrf, express.json(), snail.calc, (req, res) => {
  const { sim, total } = req.body;
  const simPct = total > 0 ? sim / total : 0;
  res.json({
    ok: true,
    sim,
    total,
    simPct,
  });
});

/**
 * GET /api/snail/:guildId/codes
 *
 * Get secret codes for Super Snail game.
 * Fetches from remote Snelp API with fallback to local cache.
 *
 * Requires: member role, guild membership
 *
 * Query parameters:
 *   - scope: string (optional) - Filter scope: "active", "past7", or "all" (default: "active")
 *
 * Response:
 *   - ok: boolean
 *   - source: string - "remote" or "local"
 *   - codes: array - Array of code objects
 *
 * Errors:
 *   - Falls back to local cache if remote fails
 */
router.get("/codes", snail.codes, cacheGuildData(1800, 3600), async (req, res) => {
  const guildId = String(req.params.guildId);
  const scope = ["active", "past7", "all"].includes(req.query.scope)
    ? req.query.scope
    : "active";
  try {
    const url = new URL(SNELP_CODES_URL);
    url.searchParams.set("guildId", guildId);
    url.searchParams.set("scope", scope);
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = await response.json();
      return res.json({ ok: true, source: "remote", ...data });
    }
    console.warn(
      "[snail/codes] Remote source failed:",
      response.status,
      await response.text(),
    );
    throw new Error(`remote_failed_${response.status}`);
  } catch (err) {
    console.warn("[snail/codes] falling back to local store:", err.message);
    const fallback = await readJson(
      path.join(CODES_ROOT, `${guildId}.json`),
      { codes: [] },
    );
    return res.json({ ok: true, source: "local", ...fallback });
  }
});

module.exports = router;
