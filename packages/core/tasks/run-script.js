"use strict";

const { spawn } = require("child_process");
const path = require("path");

function runScript(scriptRelativePath, args = [], options = {}) {
  const {
    env = {},
    cwd = process.cwd(),
    onStdout = null,
    onStderr = null,
    onClose = null,
  } = options;

  const scriptPath = path.join(process.cwd(), scriptRelativePath);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });

    child.stdout.on("data", (chunk) => {
      if (onStdout) onStdout(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      if (onStderr) onStderr(chunk.toString());
    });

    child.on("error", (err) => {
      if (onStderr) onStderr(String(err));
      reject(err);
    });

    child.on("close", (code) => {
      if (onClose) onClose(code);
      resolve({ exitCode: code });
    });
  });
}

module.exports = { runScript };
