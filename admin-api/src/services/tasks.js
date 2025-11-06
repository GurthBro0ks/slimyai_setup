"use strict";

const { ingestScreenshots, verifyStats, recomputeLatest } = require("@slimy/core");

const { runMysqlDump } = require("../util/mysql-dump");

const SUPPORTED_TASKS = new Set(["ingest", "verify", "recompute", "backup-mysql"]);

function buildTaskOptions(taskName, guildId, body = {}) {
  switch (taskName) {
    case "ingest":
      return {
        guildId,
        directory: body.directory,
        type: body.type,
        commit: Boolean(body.commit),
        dryRun: Boolean(body.dryRun),
        applyCorrections: Boolean(body.applyCorrections),
        limit:
          typeof body.limit !== "undefined" && body.limit !== null
            ? Number(body.limit)
            : null,
        logFile: body.logFile,
        capHint:
          typeof body.capHint !== "undefined" && body.capHint !== null
            ? Number(body.capHint)
            : null,
        forceCommit: Boolean(body.forceCommit),
      };
    case "verify":
      return {
        guildId,
        strict: Boolean(body.strict),
        warnLow:
          typeof body.warnLow !== "undefined" && body.warnLow !== null
            ? Number(body.warnLow)
            : null,
        warnHigh:
          typeof body.warnHigh !== "undefined" && body.warnHigh !== null
            ? Number(body.warnHigh)
            : null,
      };
    case "recompute":
      return {
        guildId,
        snapshotId:
          typeof body.snapshotId !== "undefined" && body.snapshotId !== null
            ? Number(body.snapshotId)
            : null,
        latest: body.latest !== false,
        rebuildWow: Boolean(body.rebuildWow),
        pushSheet: Boolean(body.pushSheet),
        dryRun: Boolean(body.dryRun),
        weekId: body.weekId || null,
        capHint:
          typeof body.capHint !== "undefined" && body.capHint !== null
            ? Number(body.capHint)
            : null,
        force: Boolean(body.force),
        jsonOut: body.jsonOut || null,
      };
    case "backup-mysql":
      return {
        outputPath: body.outputPath,
        label: body.label || null,
      };
    default:
      throw new Error(`Unsupported task ${taskName}`);
  }
}

function executeTask(taskName, options = {}, handlers = {}) {
  switch (taskName) {
    case "ingest":
      return ingestScreenshots(options, handlers);
    case "verify":
      return verifyStats(options, handlers);
    case "recompute":
      return recomputeLatest(options, handlers);
    case "backup-mysql":
      return runMysqlDump(options, handlers);
    default:
      throw new Error(`Unsupported task ${taskName}`);
  }
}

module.exports = {
  SUPPORTED_TASKS,
  buildTaskOptions,
  executeTask,
};
