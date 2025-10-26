"use strict";

const path = require("path");
const fs = require("fs");
const { promises: fsp } = fs;

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/var/lib/slimy/uploads";
const PUBLIC_PREFIX = "/api/uploads/files";

function ensureTrailingSlash(input) {
  return input.endsWith(path.sep) ? input : `${input}${path.sep}`;
}

const NORMALIZED_UPLOADS_ROOT = ensureTrailingSlash(
  path.resolve(UPLOADS_DIR),
).replace(/\\/g, "/");

function formatDateSlug(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function toPublicUrl(fsPath) {
  const normalized = path.resolve(fsPath).replace(/\\/g, "/");
  if (!normalized.startsWith(NORMALIZED_UPLOADS_ROOT)) {
    return null;
  }
  const suffix = normalized.slice(NORMALIZED_UPLOADS_ROOT.length);
  return `${PUBLIC_PREFIX}/${suffix.replace(/^\//, "")}`;
}

async function listGuildUploads(guildId, { days = 14, maxItems = 200 } = {}) {
  if (!guildId) {
    return [];
  }

  const guildRoot = path.join(UPLOADS_DIR, String(guildId));
  if (!(await pathExists(guildRoot))) {
    return [];
  }

  const dayEntries = await fsp
    .readdir(guildRoot, { withFileTypes: true })
    .catch(() => []);
  const orderedDays = dayEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, days);

  const items = [];
  for (const daySlug of orderedDays) {
    const dayPath = path.join(guildRoot, daySlug);
    const files = await fsp.readdir(dayPath).catch(() => []);
    for (const name of files) {
      if (!name.endsWith(".thumb.jpg")) continue;
      const stem = name.slice(0, -10); // remove ".thumb.jpg"
      const thumb = path.join(dayPath, `${stem}.thumb.jpg`);
      const large = path.join(dayPath, `${stem}.xl.jpg`);
      const original = path.join(dayPath, `${stem}.jpg`);
      const metaPath = path.join(dayPath, `${stem}.meta.json`);

      const stat = await fsp.stat(thumb).catch(() => null);
      if (!stat) continue;

      // Read metadata if available
      let metadata = {};
      try {
        const metaContent = await fsp.readFile(metaPath, "utf-8");
        metadata = JSON.parse(metaContent);
      } catch {
        // If no metadata file, use defaults
        metadata = {
          uploadedBy: "unknown",
          uploadedAt: stat.mtime.toISOString(),
        };
      }

      items.push({
        id: `${daySlug}/${stem}`,
        guildId: String(guildId),
        date: daySlug,
        uploadedAt: metadata.uploadedAt || stat.mtime.toISOString(),
        uploadedBy: metadata.uploadedBy || "unknown",
        originalName: metadata.originalName,
        urls: {
          thumb: toPublicUrl(thumb),
          large: (await pathExists(large)) ? toPublicUrl(large) : toPublicUrl(original),
          original: (await pathExists(original)) ? toPublicUrl(original) : toPublicUrl(large),
        },
      });
    }
  }

  items.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  if (items.length > maxItems) {
    return items.slice(0, maxItems);
  }

  return items;
}

async function summarizeUploads(referenceDate = new Date()) {
  const rootExists = await pathExists(UPLOADS_DIR);
  if (!rootExists) {
    return { total: 0, today: 0, byGuild: {} };
  }

  const todaySlug = formatDateSlug(referenceDate);
  const guildEntries = await fsp
    .readdir(UPLOADS_DIR, { withFileTypes: true })
    .catch(() => []);

  let total = 0;
  let today = 0;
  const byGuild = {};

  for (const entry of guildEntries) {
    if (!entry.isDirectory()) continue;
    const guildId = entry.name;
    const guildPath = path.join(UPLOADS_DIR, guildId);
    const dayEntries = await fsp
      .readdir(guildPath, { withFileTypes: true })
      .catch(() => []);

    let guildTotal = 0;
    for (const dayEntry of dayEntries) {
      if (!dayEntry.isDirectory()) continue;
      const daySlug = dayEntry.name;
      const dayPath = path.join(guildPath, daySlug);
      const files = await fsp.readdir(dayPath).catch(() => []);
      const count = files.filter((fileName) => fileName.endsWith(".thumb.jpg"))
        .length;

      if (!count) continue;
      total += count;
      guildTotal += count;
      if (daySlug === todaySlug) {
        today += count;
      }
    }

    if (guildTotal) {
      byGuild[guildId] = guildTotal;
    }
  }

  return { total, today, byGuild };
}

module.exports = {
  UPLOADS_DIR,
  listGuildUploads,
  summarizeUploads,
  toPublicUrl,
  formatDateSlug,
};
