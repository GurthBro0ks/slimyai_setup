"use strict";

const express = require("express");
const { z } = require("zod");
const path = require("path");
const { requireRole, requireGuildMember } = require("../middleware/auth");
const { readJson, writeJson } = require("../lib/store");

const SETTINGS_ROOT = path.join(process.cwd(), "data", "settings");

const router = express.Router();
// Note: GET operations allow club role, PUT/POST require admin role

const SettingsSchema = z
  .object({
    screenshot_channel_id: z.string().min(1).nullable().optional(),
    personality: z.record(z.any()).optional(),
    overrides: z
      .object({
        category: z.record(z.any()).optional(),
        channel: z.record(z.any()).optional(),
      })
      .optional(),
  })
  .strict();

const ScreenshotSchema = z.object({
  channelId: z.string().min(1),
});

function defaultSettings() {
  return {
    screenshot_channel_id: null,
    personality: {},
    overrides: {
      category: {},
      channel: {},
    },
  };
}

async function loadSettings(guildId) {
  const file = path.join(SETTINGS_ROOT, `${guildId}.json`);
  const existing = await readJson(file, null);
  if (!existing) return defaultSettings();
  const merged = defaultSettings();
  if (existing.screenshot_channel_id) {
    merged.screenshot_channel_id = existing.screenshot_channel_id;
  }
  if (existing.personality) {
    merged.personality = { ...existing.personality };
  }
  if (existing.overrides) {
    merged.overrides.category = {
      ...merged.overrides.category,
      ...(existing.overrides.category || {}),
    };
    merged.overrides.channel = {
      ...merged.overrides.channel,
      ...(existing.overrides.channel || {}),
    };
  }
  return merged;
}

async function saveSettings(guildId, payload) {
  const file = path.join(SETTINGS_ROOT, `${guildId}.json`);
  await writeJson(file, payload);
  return payload;
}

router.get(
  "/:guildId/settings",
  requireRole("club"), // Allow club and admin to read settings
  requireGuildMember("guildId"),
  async (req, res) => {
    try {
      const settings = await loadSettings(req.params.guildId);
      res.json({ ok: true, settings });
    } catch (err) {
      console.error("[guild-settings GET] failed", err);
      res.status(500).json({ error: "server_error" });
    }
  },
);

router.put(
  "/:guildId/settings",
  requireRole("admin"), // Only admin can write settings
  requireGuildMember("guildId"),
  express.json(),
  async (req, res) => {
    try {
      const parsed = SettingsSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "invalid_input",
          details: parsed.error.issues,
        });
      }

      const current = await loadSettings(req.params.guildId);
      const next = {
        ...current,
        ...parsed.data,
        personality: {
          ...current.personality,
          ...(parsed.data.personality || {}),
        },
        overrides: {
          category: {
            ...current.overrides.category,
            ...(parsed.data.overrides?.category || {}),
          },
          channel: {
            ...current.overrides.channel,
            ...(parsed.data.overrides?.channel || {}),
          },
        },
      };

      if ("screenshot_channel_id" in parsed.data) {
        next.screenshot_channel_id =
          parsed.data.screenshot_channel_id ?? null;
      }

      await saveSettings(req.params.guildId, next);
      res.json({ ok: true, settings: next });
    } catch (err) {
      console.error("[guild-settings PUT] failed", err);
      res.status(500).json({ error: "server_error" });
    }
  },
);

router.post(
  "/:guildId/settings/screenshot-channel",
  requireRole("admin"), // Only admin can write settings
  requireGuildMember("guildId"),
  express.json(),
  async (req, res) => {
    try {
      const parsed = ScreenshotSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "invalid_input",
          details: parsed.error.issues,
        });
      }
      const current = await loadSettings(req.params.guildId);
      current.screenshot_channel_id = parsed.data.channelId;
      await saveSettings(req.params.guildId, current);
      res.json({ ok: true, settings: current });
    } catch (err) {
      console.error("[guild-settings screenshot] failed", err);
      res.status(500).json({ error: "server_error" });
    }
  },
);

module.exports = router;
