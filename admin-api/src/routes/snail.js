"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const mime = require("mime-types");
const { analyzeSnailDataUrl } = require("../../../lib/snail-vision");
const { readJson, writeJson } = require("../lib/store");
const { UPLOADS_DIR } = require("../services/uploads");
const metrics = require("../lib/metrics");
const {
  requireAuth,
  requireRole,
  requireGuildMember,
} = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

const MAX_FILES = 8;
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const SNELP_CODES_URL =
  process.env.SNELP_CODES_URL || "https://snelp.com/api/codes";

const UPLOAD_ROOT = path.join(UPLOADS_DIR, "snail");
const DATA_ROOT = path.join(process.cwd(), "data", "snail");
const CODES_ROOT = path.join(process.cwd(), "data", "codes");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(DATA_ROOT, { recursive: true });
fs.mkdirSync(CODES_ROOT, { recursive: true });

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

router.use(requireAuth);
router.use(requireRole("member"));
router.use(requireGuildMember("guildId"));

router.post(
  "/analyze",
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
      console.error("[snail/analyze] failed", err);
      res.status(500).json({ error: "server_error", message: err.message });
    }
  },
);

router.get("/stats", async (req, res) => {
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

router.get("/analyze_help", (_req, res) => {
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

router.post("/calc", express.json(), (req, res) => {
  const sim = Number(req.body?.sim ?? 0);
  const total = Number(req.body?.total ?? 0);
  const simPct = total > 0 ? sim / total : 0;
  res.json({
    ok: true,
    sim,
    total,
    simPct,
  });
});

router.get("/codes", async (req, res) => {
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
