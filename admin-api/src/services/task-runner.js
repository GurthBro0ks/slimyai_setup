"use strict";

const EventEmitter = require("events");
const { nanoid } = require("nanoid");

const { executeTask, SUPPORTED_TASKS } = require("./tasks");

const TASK_TTL_MS = Number(process.env.ADMIN_TASK_TTL_MS || 5 * 60 * 1000);

const tasks = new Map();

function createRecord({ taskId, taskName, guildId, options, adminId }) {
  return {
    taskId,
    taskName,
    guildId,
    adminId,
    options,
    status: "running",
    startedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    error: null,
    events: [],
    emitter: new EventEmitter(),
    done: false,
  };
}

function appendEvent(record, event, data) {
  record.events.push({ event, data });
  if (record.events.length > 1000) {
    record.events.shift();
  }
  record.emitter.emit(event, data);
}

function finalize(record, payload) {
  if (record.done) return;
  record.done = true;
  record.status = payload.status;
  record.exitCode = payload.exitCode ?? null;
  record.error = payload.error || null;
  record.completedAt = Date.now();

  if (payload.error) {
    appendEvent(record, "error", { message: payload.error });
  }

  appendEvent(record, "end", {
    status: record.status,
    exitCode: record.exitCode,
  });

  setTimeout(() => {
    tasks.delete(record.taskId);
  }, TASK_TTL_MS).unref?.();
}

function startTask(taskName, guildId, options = {}, adminId = null) {
  if (!SUPPORTED_TASKS.has(taskName)) {
    throw new Error(`Unsupported task ${taskName}`);
  }

  const taskId = nanoid();
  const record = createRecord({ taskId, taskName, guildId, options, adminId });
  tasks.set(taskId, record);

  appendEvent(record, "start", {
    taskId,
    taskName,
    startedAt: record.startedAt,
  });

  executeTask(taskName, options, {
    onStdout(line) {
      appendEvent(record, "log", { stream: "stdout", line });
    },
    onStderr(line) {
      appendEvent(record, "log", { stream: "stderr", line });
    },
    onClose(code) {
      finalize(record, {
        status: code === 0 ? "completed" : "failed",
        exitCode: code,
      });
    },
  }).catch((err) => {
    appendEvent(record, "log", {
      stream: "stderr",
      line: `[task] ${err?.message || err}`,
    });
    finalize(record, {
      status: "failed",
      exitCode: null,
      error: err?.message || String(err),
    });
  });

  return { taskId, record };
}

function getTask(taskId) {
  return tasks.get(taskId) || null;
}

module.exports = {
  startTask,
  getTask,
};
