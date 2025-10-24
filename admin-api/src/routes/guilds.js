"use strict";

const express = require("express");
const multer = require("multer");
const { z } = require("zod");

const { requireAuth } = require("../middleware/auth");
const { requireCsrf } = require("../middleware/csrf");
const { requireRole, requireGuildAccess } = require("../middleware/rbac");
const { validateBody, validateQuery } = require("../middleware/validate");
const settingsService = require("../services/settings");
const personalityService = require("../services/personality");
const channelService = require("../services/channels");
const correctionsService = require("../services/corrections");
const usageService = require("../services/usage");
const healthService = require("../services/health");
const { rescanMember } = require("../services/rescan");
const { recordAudit } = require("../services/audit");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024,
  },
});

const router = express.Router();

const settingsSchema = z.object({
  sheetUrl: z
    .union([z.string().trim(), z.null()])
    .optional()
    .transform((val) => (val === "" ? null : val)),
  weekWindowDays: z
    .union([z.number().int().min(1).max(14), z.null()])
    .optional(),
  thresholds: z
    .object({
      warnLow: z.union([z.number(), z.null()]).optional(),
      warnHigh: z.union([z.number(), z.null()]).optional(),
    })
    .partial()
    .optional(),
  tokensPerMinute: z.union([z.number().int().positive(), z.null()]).optional(),
  testSheet: z.boolean().optional(),
});

const personalitySchema = z.object({
  profile: z.record(z.any()).default({}),
});

const channelEntrySchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string().min(1).optional(),
  modes: z.record(z.any()).default({}),
  allowlist: z.array(z.string()).default([]),
});

const channelsSchema = z.object({
  channels: z.array(channelEntrySchema).default([]),
});

const correctionsQuerySchema = z.object({
  weekId: z.string().optional(),
});

const correctionSchema = z
  .object({
    weekId: z.string().optional(),
    memberKey: z.string().optional(),
    displayName: z.string().optional(),
    memberInput: z.string().optional(),
    metric: z.enum(["total", "sim"]),
    value: z.union([z.number(), z.string()]),
    reason: z.string().optional(),
  })
  .refine(
    (data) => data.memberKey || data.displayName || data.memberInput,
    "memberKey or displayName is required",
  );

const usageQuerySchema = z.object({
  window: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.use(requireAuth);

router.get("/", (req, res) => {
  res.json({ guilds: req.user.guilds || [] });
});

router.get(
  "/:guildId/settings",
  requireGuildAccess,
  async (req, res, next) => {
    try {
      const result = await settingsService.getSettings(req.params.guildId, {
        includeTest: req.query.test === "true",
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/:guildId/settings",
  requireGuildAccess,
  requireRole("editor"),
  requireCsrf,
  validateBody(settingsSchema),
  async (req, res, next) => {
    try {
      const result = await settingsService.updateSettings(
        req.params.guildId,
        req.validated.body,
      );
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.settings.update",
        guildId: req.params.guildId,
        payload: req.validated.body,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/personality",
  requireGuildAccess,
  async (req, res, next) => {
    try {
      const record = await personalityService.getPersonality(
        req.params.guildId,
      );
      res.json(record);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/:guildId/personality",
  requireGuildAccess,
  requireRole("editor"),
  requireCsrf,
  validateBody(personalitySchema),
  async (req, res, next) => {
    try {
      const record = await personalityService.updatePersonality(
        req.params.guildId,
        req.validated.body.profile,
        { userId: req.user.sub },
      );
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.personality.update",
        guildId: req.params.guildId,
      });
      res.json(record);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/channels",
  requireGuildAccess,
  async (req, res, next) => {
    try {
      const channels = await channelService.getChannelSettings(
        req.params.guildId,
      );
      res.json({ channels });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/:guildId/channels",
  requireGuildAccess,
  requireRole("editor"),
  requireCsrf,
  validateBody(channelsSchema),
  async (req, res, next) => {
    try {
      const result = await channelService.replaceChannelSettings(
        req.params.guildId,
        req.validated.body.channels,
        { userId: req.user.sub },
      );
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.channels.update",
        guildId: req.params.guildId,
        payload: { count: req.validated.body.channels.length },
      });
      res.json({ channels: result });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/corrections",
  requireGuildAccess,
  validateQuery(correctionsQuerySchema),
  async (req, res, next) => {
    try {
      const corrections = await correctionsService.listCorrections(
        req.params.guildId,
        req.validated?.query?.weekId,
      );
      res.json({ corrections });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:guildId/corrections",
  requireGuildAccess,
  requireRole("editor"),
  requireCsrf,
  validateBody(correctionSchema),
  async (req, res, next) => {
    try {
      const result = await correctionsService.createCorrection(
        req.params.guildId,
        req.validated.body,
        { userId: req.user.sub },
      );
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.corrections.add",
        guildId: req.params.guildId,
        payload: req.validated.body,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:guildId/corrections/:correctionId",
  requireGuildAccess,
  requireRole("editor"),
  requireCsrf,
  async (req, res, next) => {
    try {
      const correctionId = Number(req.params.correctionId);
      if (!Number.isFinite(correctionId)) {
        return res.status(400).json({ error: "invalid-correction-id" });
      }

      const success = await correctionsService.deleteCorrectionById(
        req.params.guildId,
        correctionId,
      );
      if (!success) {
        return res.status(404).json({ error: "not-found" });
      }
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.corrections.delete",
        guildId: req.params.guildId,
        payload: { id: correctionId },
      });
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:guildId/rescan-user",
  requireGuildAccess,
  requireRole("editor"),
  requireCsrf,
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "file-required" });
      }

      const result = await rescanMember(
        req.params.guildId,
        {
          fileBuffer: req.file.buffer,
          fileMime: req.file.mimetype,
          filename: req.file.originalname,
          memberInput: req.body.member || req.body.memberInput,
          metric: req.body.metric,
          weekId: req.body.weekId,
        },
        { userId: req.user.sub },
      );

      await recordAudit({
        adminId: req.user.sub,
        action: "guild.rescan",
        guildId: req.params.guildId,
        payload: { member: req.body.member, metric: result.metric },
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/usage",
  requireGuildAccess,
  validateQuery(usageQuerySchema),
  async (req, res, next) => {
    try {
      const result = await usageService.getUsage(req.params.guildId, {
        window: req.validated?.query?.window,
        startDate: req.validated?.query?.startDate,
        endDate: req.validated?.query?.endDate,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/health",
  requireGuildAccess,
  async (req, res, next) => {
    try {
      const result = await healthService.getHealth(req.params.guildId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/export/corrections.csv",
  requireGuildAccess,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const rows = await correctionsService.fetchCorrectionsForExport(
        req.params.guildId,
      );
      const csv = correctionsService.correctionsToCsv(rows);

      await recordAudit({
        adminId: req.user.sub,
        action: "guild.export.corrections.csv",
        guildId: req.params.guildId,
        payload: { count: rows.length },
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${req.params.guildId}-corrections.csv"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/export/corrections.json",
  requireGuildAccess,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const rows = await correctionsService.fetchCorrectionsForExport(
        req.params.guildId,
      );
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.export.corrections.json",
        guildId: req.params.guildId,
        payload: { count: rows.length },
      });
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.guildId}-corrections.json"`);
      res.setHeader("Cache-Control", "no-store");
      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:guildId/export/personality.json",
  requireGuildAccess,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const record = await personalityService.getPersonality(req.params.guildId);
      await recordAudit({
        adminId: req.user.sub,
        action: "guild.export.personality.json",
        guildId: req.params.guildId,
      });
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${req.params.guildId}-personality.json"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(record.profile || {});
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
