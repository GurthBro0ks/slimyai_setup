"use strict";

const express = require("express");
const router = express.Router();
const { chooseTab, readStats } = require("../../lib/sheets");

const SHEET_ID = process.env.STATS_SHEET_ID;
const PINNED = process.env.STATS_BASELINE_TITLE || "Baseline (10-24-25)";

if (!SHEET_ID) {
  // Soft-fail route if not configured
  router.get("/summary", (_req, res) => res.status(500).json({ error: "missing_sheet_id", message: "STATS_SHEET_ID not configured in environment" }));
  module.exports = router;
} else {
  router.get("/summary", async (req, res) => {
    try {
      // priority: explicit ?title= → ?tab=baseline/latest → pinned → newest baseline → latest
      const qTitle = (req.query.title || "").toString().trim();
      const qTab = (req.query.tab || "").toString().trim().toLowerCase();
      let title = qTitle || null;

      if (!title) {
        if (qTab === "baseline") title = PINNED;
        if (qTab === "latest") title = "Club Latest";
      }

      const selected = await chooseTab(SHEET_ID, title || PINNED);
      if (!selected) return res.status(404).json({ error: "no_tabs_found" });

      const stats = await readStats(SHEET_ID, selected);
      return res.json({ ok: true, selected, pinned: PINNED, stats });
    } catch (err) {
      console.error("[stats/summary]", err);
      return res.status(500).json({ error: "server_error", message: err.message });
    }
  });

  module.exports = router;
}
