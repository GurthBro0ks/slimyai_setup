"use strict";

const path = require("path");
const fs = require("fs");
const { promises: fsp } = fs;
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const mime = require("mime-types");
const { requireAuth } = require("../middleware/auth");
const {
  UPLOADS_DIR,
  listGuildUploads,
  summarizeUploads,
  toPublicUrl,
  formatDateSlug,
} = require("../services/uploads");

const router = express.Router({ mergeParams: true });

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILES = 20;
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const MAX_BYTES = MAX_MB * 1024 * 1024;

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
}

function ensureGuildFolder(guildId) {
  const now = new Date();
  const daySlug = formatDateSlug(now);
  const target = path.join(UPLOADS_DIR, String(guildId), daySlug);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const dest = ensureGuildFolder(req.params.guildId || "unknown");
      cb(null, dest);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext =
      mime.extension(file.mimetype) ||
      file.originalname.split(".").pop() ||
      "bin";
    const base = safeName(path.parse(file.originalname).name);
    const stamp = Date.now().toString(36);
    cb(null, `${base}.${stamp}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_BYTES,
    files: MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("unsupported_type"));
    }
  },
});

async function buildVariants(filePath) {
  const parsed = path.parse(filePath);
  const basePath = path.join(parsed.dir, parsed.name);
  const original = `${basePath}.jpg`;
  const large = `${basePath}.xl.jpg`;
  const thumb = `${basePath}.thumb.jpg`;

  const buffer = await sharp(filePath)
    .rotate()
    .jpeg({ quality: 88 })
    .toBuffer();

  await sharp(buffer)
    .jpeg({ quality: 90 })
    .toFile(original);
  await sharp(buffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(large);
  await sharp(buffer)
    .resize({ width: 320, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toFile(thumb);

  await fsp.unlink(filePath).catch(() => {});
  return { original, large, thumb };
}

router.get("/:guildId", requireAuth, async (req, res) => {
  try {
    const items = await listGuildUploads(req.params.guildId, {
      days: Number(req.query.days || 14),
      maxItems: Number(req.query.limit || 120),
    });
    res.json({ items });
  } catch (err) {
    console.error("[uploads] list failed:", err);
    res.status(500).json({ error: "failed_to_list_uploads" });
  }
});

router.post(
  "/:guildId",
  requireAuth,
  (req, res, next) => {
    upload.array("files", MAX_FILES)(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "file_too_large" });
        }
        if (err.message === "unsupported_type") {
          return res.status(400).json({ error: "unsupported_type" });
        }
        return res.status(400).json({ error: err.message || "upload_failed" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const processed = [];
      for (const file of req.files || []) {
        const variants = await buildVariants(file.path);
        processed.push({
          original: toPublicUrl(variants.original),
          large: toPublicUrl(variants.large),
          thumb: toPublicUrl(variants.thumb),
        });
      }

      const summary = await summarizeUploads();
      res.json({
        ok: true,
        uploaded: processed.length,
        files: processed,
        summary,
      });
    } catch (err) {
      console.error("[uploads] failed to process files:", err);
      res.status(500).json({ error: "upload_processing_failed" });
    }
  },
);

module.exports = router;
