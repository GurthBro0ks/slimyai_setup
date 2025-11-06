"use strict";

const { runScript } = require("./run-script");

function ingestScreenshots(options = {}, handlers = {}) {
  const {
    guildId,
    directory,
    type = "both",
    commit = false,
    dryRun = false,
    applyCorrections = false,
    limit = null,
    logFile = null,
    capHint = null,
    forceCommit = false,
    env = {},
  } = options;

  if (!guildId) {
    throw new Error("ingestScreenshots requires guildId");
  }
  if (!directory) {
    throw new Error("ingestScreenshots requires directory");
  }

  const args = ["--guild", guildId, "--dir", directory];

  if (type) {
    args.push("--type", type);
  }
  if (commit) args.push("--commit");
  if (dryRun) args.push("--dry");
  if (applyCorrections) args.push("--apply-corrections");
  if (limit !== null && typeof limit !== "undefined") {
    args.push("--limit", String(limit));
  }
  if (logFile) {
    args.push("--log", logFile);
  }
  if (capHint !== null && typeof capHint !== "undefined") {
    args.push("--cap-hint", String(capHint));
  }
  if (forceCommit) args.push("--force-commit");

  return runScript("scripts/ingest-club-screenshots.js", args, {
    env,
    onStdout: handlers.onStdout,
    onStderr: handlers.onStderr,
    onClose: handlers.onClose,
  });
}

module.exports = { ingestScreenshots };
