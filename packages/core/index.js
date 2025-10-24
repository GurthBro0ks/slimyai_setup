"use strict";

const path = require("path");

const { parsePower } = require("../../lib/numparse");
const { classifyPage } = require("../../lib/club-vision");
const { canonicalize } = require("../../lib/club-store");
const { pushLatest, testSheetAccess } = require("../../lib/club-sheets");
const usage = require("../../lib/usage-openai");
const { getWeekAnchor, getWeekId } = require("../../lib/week-anchor");

const { ingestScreenshots } = require("./tasks/ingest");
const { verifyStats } = require("./tasks/verify");
const { recomputeLatest } = require("./tasks/recompute");

function pushSheet(guildId) {
  return pushLatest(guildId);
}

module.exports = {
  ingestScreenshots,
  verifyStats,
  recomputeLatest,
  pushSheet,
  testSheetAccess,
  usage,
  parsePower,
  normalizeMemberKey: canonicalize,
  classifyPage,
  getWeekAnchor,
  getWeekId,
  resolveRepoPath(relativePath) {
    return path.join(process.cwd(), relativePath);
  },
};
