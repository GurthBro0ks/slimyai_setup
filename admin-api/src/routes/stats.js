"use strict";

const express = require("express");
const router = express.Router();
const { chooseTab, readStats } = require("../../lib/sheets");
const { cacheStats } = require("../middleware/cache");
const { stats } = require("../lib/validation/schemas");
const { apiHandler } = require("../lib/errors");
const config = require("../lib/config");

const SHEET_ID = config.google.statsSheetId;
const PINNED = config.google.statsBaselineTitle;

if (!SHEET_ID) {
  // Soft-fail route if not configured
  router.get("/summary", (_req, res) => res.status(500).json({ error: "missing_sheet_id", message: "STATS_SHEET_ID not configured in environment" }));
  module.exports = router;
} else {
  router.get("/summary", stats.summary, cacheStats(600), apiHandler(async (req, res) => {
    // priority: explicit ?title= → ?tab=baseline/latest → pinned → newest baseline → latest
    const qTitle = (req.query.title || "").toString().trim();
    const qTab = (req.query.tab || "").toString().trim().toLowerCase();
    let title = qTitle || null;

    if (!title) {
      if (qTab === "baseline") title = PINNED;
      if (qTab === "latest") title = "Club Latest";
    }

    const selected = await chooseTab(SHEET_ID, title || PINNED);
    if (!selected) {
      res.status(404).json({ error: "no_tabs_found" });
      return;
    }

    const stats = await readStats(SHEET_ID, selected);
    return { ok: true, selected, pinned: PINNED, stats };
  }, { routeName: "stats/summary" }));

  module.exports = router;
}
