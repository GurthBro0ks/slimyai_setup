"use strict";

const path = require("path");
const fs = require("fs").promises;

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

async function summarizeUploads() {
  try {
    const snailDir = path.join(UPLOADS_DIR, "snail");
    let total = 0;
    let today = 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const walk = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          total++;
          const stats = await fs.stat(fullPath).catch(() => null);
          if (stats && stats.mtime >= todayStart) {
            today++;
          }
        }
      }
    };

    if (await fs.access(snailDir).then(() => true).catch(() => false)) {
      await walk(snailDir);
    }

    return { total, today };
  } catch (err) {
    console.warn("[uploads] Failed to summarize:", err.message);
    return { total: 0, today: 0 };
  }
}

module.exports = {
  UPLOADS_DIR,
  summarizeUploads,
};
