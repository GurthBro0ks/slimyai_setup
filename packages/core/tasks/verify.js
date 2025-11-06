"use strict";

const { runScript } = require("./run-script");

function verifyStats(options = {}, handlers = {}) {
  const {
    guildId,
    strict = false,
    warnLow = null,
    warnHigh = null,
    env = {},
  } = options;

  if (!guildId) {
    throw new Error("verifyStats requires guildId");
  }

  const args = ["--guild", guildId];

  if (strict) args.push("--strict");
  if (warnLow !== null && typeof warnLow !== "undefined") {
    args.push("--warn-low", String(warnLow));
  }
  if (warnHigh !== null && typeof warnHigh !== "undefined") {
    args.push("--warn-high", String(warnHigh));
  }

  return runScript("scripts/verify-club-stats.js", args, {
    env,
    onStdout: handlers.onStdout,
    onStderr: handlers.onStderr,
    onClose: handlers.onClose,
  });
}

module.exports = { verifyStats };
