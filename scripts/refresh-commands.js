#!/usr/bin/env node

require("dotenv/config");
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const logger = require("../lib/logger");
const TEST = process.env.TEST_MODE === "1";

function requireCommand(modulePath) {
  try {
    // eslint-disable-next-line global-require
    return require(modulePath);
  } catch (error) {
    logger.error("[refresh] Failed to load command module", {
      modulePath,
      error,
    });
    return null;
  }
}

function extractCommandData(mod, modulePath) {
  if (!mod || typeof mod !== "object") {
    logger.warn("[refresh] Command module missing exports", { modulePath });
    return null;
  }

  const candidates = [
    mod.data,
    mod.command?.data,
    mod.default?.data,
    typeof mod.getBuilder === "function" ? mod.getBuilder() : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate.toJSON === "function") {
      const json = candidate.toJSON();
      if (json?.name) return json;
    } else if (candidate?.name) {
      return candidate;
    }
  }

  if (mod.data?.name) {
    return mod.data;
  }

  logger.warn("[refresh] Skipping command without exportable data", {
    modulePath,
  });
  return null;
}

function loadCommands() {
  const commandsDir = path.resolve(__dirname, "../commands");
  const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
  const commands = [];

  entries.forEach((entry) => {
    if (!entry.isFile()) return;
    if (!entry.name.endsWith(".js") && !entry.name.endsWith(".ts")) return;

    const modulePath = path.join(commandsDir, entry.name);
    const mod = requireCommand(modulePath);
    const data = extractCommandData(mod, modulePath);
    if (data?.name) {
      commands.push(data);
    }
  });

  return commands;
}

async function registerCommands(rest, clientId, commands, guildIds) {
  if (!commands.length) {
    logger.warn("[refresh] No commands discovered; nothing to register.");
    return;
  }

  const commandNames = commands.map((command) => command.name).join(", ");
  logger.info(`[refresh] Found ${commands.length} commands: ${commandNames}`);

  for (const guildId of guildIds) {
    logger.info(
      `[refresh] Registering ${commands.length} commands for guild ${guildId}`,
    );
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    logger.info(`[refresh] Registered guild commands for ${guildId}`);
  }

  logger.info(
    "[refresh] Registering commands globally (can take up to 1 hour to propagate)",
  );
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  logger.info("[refresh] Registered commands globally");
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !clientId) {
    if (TEST) {
      logger.info(
        "[refresh] TEST_MODE=1 — token or client ID not set, skipping registration.",
      );
      return;
    }

    if (!token) {
      logger.warn(
        "[refresh] DISCORD_TOKEN missing; skipping command registration.",
      );
    }

    if (!clientId) {
      logger.warn(
        "[refresh] DISCORD_CLIENT_ID missing; skipping command registration.",
      );
    }

    logger.warn(
      "[refresh] Command refresh skipped because required credentials are not set.",
    );
    return;
  }

  const devGuildIds = (process.env.DEV_GUILD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    const commands = loadCommands();
    if (TEST) {
      const commandNames = commands.map((command) => command.name).join(", ");
      logger.info("[refresh] TEST_MODE=1 — skipping remote registration.");
      logger.info(
        `[refresh] Simulated ${commands.length} commands: ${commandNames}`,
      );
      return;
    }

    const rest = new REST({ version: "10" }).setToken(token);
    await registerCommands(rest, clientId, commands, devGuildIds);
    logger.info("[refresh] Command registration complete.");
  } catch (error) {
    logger.error("[refresh] Command registration failed", { error });
    process.exit(1);
  }
}

main();
