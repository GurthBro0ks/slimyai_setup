"use strict";

const { runScript } = require("./run-script");

function recomputeLatest(options = {}, handlers = {}) {
  const {
    guildId,
    snapshotId = null,
    latest = true,
    rebuildWow = false,
    pushSheet = false,
    dryRun = false,
    weekId = null,
    capHint = null,
    force = false,
    jsonOut = null,
    env = {},
  } = options;

  if (!guildId) {
    throw new Error("recomputeLatest requires guildId");
  }

  const args = ["--guild", guildId];

  if (snapshotId) {
    args.push("--snapshot", String(snapshotId));
  } else if (latest) {
    args.push("--latest");
  }

  if (rebuildWow) args.push("--rebuild-wow");
  if (pushSheet) args.push("--push-sheet");
  if (dryRun) args.push("--dry");
  if (weekId) {
    args.push("--week", String(weekId));
  }
  if (capHint !== null && typeof capHint !== "undefined") {
    args.push("--cap-hint", String(capHint));
  }
  if (force) args.push("--force");
  if (jsonOut) {
    args.push("--json", jsonOut);
  }

  return runScript("scripts/recompute-from-snapshot.js", args, {
    env,
    onStdout: handlers.onStdout,
    onStderr: handlers.onStderr,
    onClose: handlers.onClose,
  });
}

module.exports = { recomputeLatest };
