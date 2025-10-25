"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const BOT_RESCAN_URL = process.env.BOT_RESCAN_URL || null;

router.post("/rescan", requireAuth, async (req, res) => {
  if (!BOT_RESCAN_URL) {
    return res.status(501).json({ error: "rescan_unconfigured" });
  }

  try {
    const response = await fetch(BOT_RESCAN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(req.body || {}),
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text();

    if (!response.ok) {
      return res.status(response.status).send(payload);
    }

    return res.status(200).send(payload);
  } catch (err) {
    console.error("[bot] rescan proxy error:", err);
    return res.status(502).json({ error: "bot_unreachable" });
  }
});

module.exports = router;
