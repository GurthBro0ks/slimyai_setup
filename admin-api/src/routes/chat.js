"use strict";

const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getSession } = require("../../lib/session-store");
const metrics = require("../lib/metrics");
const { askChatBot } = require("../services/chat-bot");
const database = require("../../lib/database");

const ADMIN_ROOM_ID = "admin-global";

const router = express.Router();
router.use(requireAuth);

router.post("/bot", requireRole("member"), express.json(), async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const guildId = String(req.body?.guildId || "");
    const { reply } = await askChatBot({ prompt, guildId });
    metrics.recordChatMessage();
    res.json({ ok: true, reply });
  } catch (err) {
    if (err.code === "missing_prompt") {
      return res.status(400).json({ error: "missing_prompt" });
    }
    if (err.code === "openai_error") {
      return res
        .status(err.status || 502)
        .json({ error: "openai_error", detail: err.detail });
    }
    console.error("[chat/bot] failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:guildId/history", async (req, res) => {
  try {
    const guildId = String(req.params.guildId || "");
    if (!guildId) {
      return res.status(400).json({ error: "missing_guild" });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const isAdmin = req.user.role === "admin";

    if (guildId === ADMIN_ROOM_ID) {
      if (!isAdmin) {
        return res.status(403).json({
          error: "forbidden",
          hint: "admin room is available to admins only",
        });
      }
    } else {
      const session = getSession(req.user.id);
      const guilds = Array.isArray(session?.guilds) ? session.guilds : [];
      const guildEntry = guilds.find((guild) => String(guild.id) === guildId);
      const effectiveRole = guildEntry?.role || req.user.role || "member";

      const allowed =
        isAdmin || effectiveRole === "admin" || effectiveRole === "club";

      if (!allowed) {
        return res.status(403).json({
          error: "forbidden",
          hint: "insufficient role to view chat history",
        });
      }

      if (!guildEntry && !isAdmin) {
        return res.status(403).json({
          error: "not_in_guild",
          guildId,
        });
      }
    }

    if (!database.isConfigured()) {
      return res.json({ ok: true, messages: [] });
    }

    const includeAdminOnly = guildId === ADMIN_ROOM_ID || isAdmin;
    const messages = await database.getChatMessages(guildId, limit, includeAdminOnly);

    const formatted = messages.map((msg) => ({
      messageId: msg.message_id,
      guildId: msg.guild_id,
      userId: msg.user_id,
      username: msg.global_name || msg.username,
      from: {
        id: msg.user_id,
        name: msg.global_name || msg.username,
        role: msg.user_role,
        color: getColorForRole(msg.user_role),
      },
      text: msg.text,
      adminOnly: Boolean(msg.admin_only),
      ts: msg.created_at.toISOString(),
    }));

    res.json({ ok: true, messages: formatted });
  } catch (err) {
    console.error("[chat/history] failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

function getColorForRole(role) {
  const colors = {
    member: "#3b82f6",
    club: "#f59e0b",
    admin: "#ef4444",
    bot: "#22c55e",
  };
  return colors[role] || colors.member;
}

module.exports = router;
