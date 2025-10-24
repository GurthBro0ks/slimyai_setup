"use strict";

const express = require("express");

const { requireAuth } = require("../middleware/auth");
const { requireCsrf } = require("../middleware/csrf");
const { requireGuildAccess, requireRole } = require("../middleware/rbac");
const { tasksLimiter } = require("../middleware/rate-limit");
const { recordAudit } = require("../services/audit");
const { startTask, getTask } = require("../services/task-runner");
const { SUPPORTED_TASKS, buildTaskOptions } = require("../services/tasks");

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const guildTaskRouter = express.Router();
guildTaskRouter.use(requireAuth);

guildTaskRouter.post(
  "/:guildId/tasks/:taskName",
  requireGuildAccess,
  requireRole("admin"),
  requireCsrf,
  tasksLimiter,
  async (req, res) => {
    const { guildId, taskName } = req.params;
    const normalizedTask = taskName.toLowerCase();

    if (!SUPPORTED_TASKS.has(normalizedTask)) {
      return res.status(400).json({ error: "unsupported-task" });
    }

    const options = buildTaskOptions(normalizedTask, guildId, req.body || {});

    await recordAudit({
      adminId: req.user.sub,
      action: `guild.task.${normalizedTask}`,
      guildId,
      payload: options,
    });

    const { taskId } = startTask(normalizedTask, guildId, options, req.user.sub);
    res.json({ taskId });
  },
);

const taskStreamRouter = express.Router();
taskStreamRouter.use(requireAuth);

taskStreamRouter.get("/tasks/:taskId/stream", (req, res) => {
  const { taskId } = req.params;
  const record = getTask(taskId);
  if (!record) {
    return res.status(404).json({ error: "task-not-found" });
  }

  let hasAccess = false;
  if (record.guildId === null || record.guildId === "__global__") {
    hasAccess = req.user?.role === "owner";
  } else {
    hasAccess = req.user?.guilds?.some(
      (guild) => guild.id === record.guildId,
    );
  }
  if (!hasAccess) {
    return res.status(403).json({ error: "guild-access-denied" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendExisting = () => {
    for (const entry of record.events) {
      sendEvent(res, entry.event, entry.data);
    }
  };

  sendExisting();

  const onLog = (payload) => sendEvent(res, "log", payload);
  const onError = (payload) => sendEvent(res, "error", payload);
  const onEnd = (payload) => {
    sendEvent(res, "end", payload);
    cleanup();
  };

  const cleanup = () => {
    record.emitter.removeListener("log", onLog);
    record.emitter.removeListener("error", onError);
    record.emitter.removeListener("end", onEnd);
    res.end();
  };

  record.emitter.on("log", onLog);
  record.emitter.on("error", onError);
  record.emitter.on("end", onEnd);

  req.on("close", cleanup);

  if (record.done) {
    // Task completed before stream established; ensure connection closes
    cleanup();
  }
});

module.exports = {
  guildTaskRouter,
  taskStreamRouter,
};
