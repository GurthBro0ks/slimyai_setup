#!/usr/bin/env node

require("dotenv/config");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const logger = require("../lib/logger");
const TEST = process.env.TEST_MODE === "1";

function commandAvailable(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function exec(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(
      `${command} ${args.join(" ")} exited with code ${result.status}`,
    );
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }

  return result;
}

function tryPm2() {
  if (!commandAvailable("pm2", ["-v"])) {
    logger.info("[restart] pm2 not available; skipping.");
    return false;
  }

  try {
    const name = process.env.PM2_NAME;
    if (name) {
      logger.info(`[restart] Restarting bot via pm2 process "${name}"`);
      exec("pm2", ["restart", name]);
      logger.info("[restart] pm2 restart succeeded.");
      return true;
    }

    logger.info("[restart] PM2_NAME not set; inspecting pm2 process list.");
    const listResult = exec("pm2", ["jlist"], { capture: true });
    const raw = (listResult.stdout || "").trim();
    if (!raw) {
      throw new Error("pm2 jlist returned no process data.");
    }

    const processes = JSON.parse(raw);
    if (!Array.isArray(processes) || processes.length === 0) {
      throw new Error("No pm2 processes found to restart.");
    }

    const preferred = processes.find((proc) => {
      const execPath = proc?.pm2_env?.pm_exec_path || "";
      return execPath.includes("index.js");
    });

    const target = preferred || processes[0];
    const identifier = target?.name || String(target?.pm_id);
    if (!identifier) {
      throw new Error("Unable to determine pm2 process identifier.");
    }

    logger.info(
      `[restart] Restarting pm2 process "${identifier}" (auto-selected).`,
    );
    exec("pm2", ["restart", identifier]);
    logger.info("[restart] pm2 restart succeeded.");
    return true;
  } catch (error) {
    logger.warn("[restart] pm2 path failed.", { error });
    return false;
  }
}

function tryDockerCompose() {
  const composePath = (process.env.DOCKER_COMPOSE_PATH || "").trim();
  if (!composePath) {
    logger.info(
      "[restart] DOCKER_COMPOSE_PATH not set; skipping docker compose restart.",
    );
    return false;
  }

  const resolvedPath = path.resolve(composePath);
  if (!fs.existsSync(resolvedPath)) {
    logger.warn("[restart] Docker compose file not found; skipping.", {
      resolvedPath,
    });
    return false;
  }

  const dockerComposeAvailable = commandAvailable("docker", [
    "compose",
    "version",
  ]);
  const dockerComposeClassicAvailable = commandAvailable("docker-compose", [
    "version",
  ]);

  if (!dockerComposeAvailable && !dockerComposeClassicAvailable) {
    logger.warn(
      '[restart] Neither "docker compose" nor "docker-compose" is available.',
    );
    return false;
  }

  try {
    if (dockerComposeAvailable) {
      logger.info(
        `[restart] Restarting bot via docker compose file ${resolvedPath}`,
      );
      exec("docker", ["compose", "-f", resolvedPath, "restart"]);
      logger.info("[restart] docker compose restart succeeded.");
      return true;
    }

    logger.info(
      `[restart] Restarting bot via docker-compose file ${resolvedPath}`,
    );
    exec("docker-compose", ["-f", resolvedPath, "restart"]);
    logger.info("[restart] docker-compose restart succeeded.");
    return true;
  } catch (error) {
    logger.warn(
      "[restart] docker compose restart failed, attempting force recreate.",
      { error },
    );
  }

  try {
    if (dockerComposeAvailable) {
      exec("docker", [
        "compose",
        "-f",
        resolvedPath,
        "up",
        "-d",
        "--force-recreate",
      ]);
      logger.info("[restart] docker compose force recreate succeeded.");
      return true;
    }

    exec("docker-compose", [
      "-f",
      resolvedPath,
      "up",
      "-d",
      "--force-recreate",
    ]);
    logger.info("[restart] docker-compose force recreate succeeded.");
    return true;
  } catch (error) {
    logger.warn("[restart] docker compose force recreate failed.", { error });
    return false;
  }
}

function trySystemd() {
  const service = (process.env.SYSTEMD_SERVICE || "").trim();
  if (!service) {
    logger.info("[restart] SYSTEMD_SERVICE not set; skipping systemd restart.");
    return false;
  }

  if (!commandAvailable("systemctl", ["--version"])) {
    logger.warn("[restart] systemctl not available on this system.");
    return false;
  }

  try {
    logger.info(`[restart] Attempting systemctl --user restart ${service}`);
    exec("systemctl", ["--user", "restart", service]);
    logger.info("[restart] systemd --user restart succeeded.");
    return true;
  } catch (userError) {
    logger.warn("[restart] systemd --user restart failed; attempting sudo.", {
      userError,
    });
  }

  try {
    exec("sudo", ["systemctl", "restart", service]);
    logger.info("[restart] systemd sudo restart succeeded.");
    return true;
  } catch (error) {
    logger.warn("[restart] systemd sudo restart failed.", { error });
    return false;
  }
}

function killExistingIndexes() {
  try {
    const result = exec("ps", ["-eo", "pid,command"], { capture: true });
    const lines = (result.stdout || "").split("\n").slice(1);
    let killedCount = 0;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const parts = trimmed.split(/\s+/);
      const pid = Number(parts.shift());
      const command = parts.join(" ");
      if (!Number.isFinite(pid)) return;
      if (pid === process.pid) return;
      if (command.includes("index.js") || command.includes("dist/index.js")) {
        try {
          process.kill(pid, "SIGTERM");
          killedCount += 1;
        } catch (error) {
          logger.warn(
            "[restart] Failed to terminate existing index.js process.",
            { pid, error },
          );
        }
      }
    });

    return killedCount;
  } catch (error) {
    logger.warn("[restart] Unable to inspect running node processes.", {
      error,
    });
    return 0;
  }
}

function tryFallback() {
  if (TEST) {
    logger.info("[restart] TEST_MODE=1 — skipping fallback restart.");
    return true;
  }

  logger.info("[restart] Falling back to npm run start.");
  const killed = killExistingIndexes();
  if (killed > 0) {
    logger.info(
      `[restart] Terminated ${killed} existing node process(es) before restart.`,
    );
  }

  try {
    exec("npm", ["run", "start", "-s"]);
    logger.info("[restart] npm run start succeeded.");
    return true;
  } catch (error) {
    logger.warn("[restart] npm run start failed.", { error });
    return false;
  }
}

function main() {
  const strategies = [tryPm2, tryDockerCompose, trySystemd, tryFallback];
  for (const strategy of strategies) {
    const succeeded = strategy();
    if (succeeded) {
      return;
    }
  }

  logger.error("[restart] Unable to restart bot using any strategy.");
  process.exit(1);
}

main();
