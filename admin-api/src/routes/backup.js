"use strict";

const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const { requireAuth } = require("../middleware/auth");
const { requireCsrf } = require("../middleware/csrf");
const { requireRole } = require("../middleware/rbac");
const { startTask } = require("../services/task-runner");
const { buildTaskOptions } = require("../services/tasks");
const config = require("../config");
const { recordAudit } = require("../services/audit");

const router = express.Router();

router.use(requireAuth);

async function listDirectoryContents(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(dirPath, entry.name);
      const stats = await fsp.stat(fullPath);
      files.push({
        name: entry.name,
        path: fullPath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    }
    return files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

router.get(
  "/list",
  requireRole("owner"),
  async (_req, res, next) => {
    try {
      const mysqlFiles = await listDirectoryContents(config.backup.mysqlDir);
      const dataFiles = await listDirectoryContents(config.backup.dataDir);
      res.json({ mysql: mysqlFiles, data: dataFiles });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/mysql-dump",
  requireRole("owner"),
  requireCsrf,
  async (req, res, next) => {
    try {
      const stamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .split(".")[0];
      const filename = `slimy-${stamp}.sql.gz`;
      const outputPath = path.join(config.backup.mysqlDir, filename);

      fs.mkdirSync(config.backup.mysqlDir, { recursive: true });

      const options = buildTaskOptions("backup-mysql", null, {
        outputPath,
        label: filename,
      });

      const { taskId } = startTask("backup-mysql", null, options, req.user.sub);

      await recordAudit({
        adminId: req.user.sub,
        action: "backup.mysql",
        payload: { outputPath },
      });

      res.json({
        taskId,
        filename,
        outputPath,
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
