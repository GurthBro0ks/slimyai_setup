"use strict";

const fs = require("fs");
const path = require("path");

const dotenv = require("dotenv");

const database = require("../lib/database");
const { applyDatabaseUrl } = require("./src/utils/apply-db-url");
const { createApp } = require("./src/app");
const logger = require("../lib/logger");

function loadEnv() {
  const explicitEnvPath =
    process.env.ADMIN_ENV_FILE || process.env.ENV_FILE || null;
  if (explicitEnvPath && fs.existsSync(explicitEnvPath)) {
    dotenv.config({ path: explicitEnvPath });
  }

  const envPath = path.join(process.cwd(), ".env.admin");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  // Allow fallback to default .env for shared values
  const defaultEnvPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath });
  }
}

async function start() {
  loadEnv();
  applyDatabaseUrl(process.env.DB_URL);

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set in .env.admin for admin-api");
  }

  if (process.env.NODE_ENV !== "production") {
    logger.info("[admin-api] Booting in non-production mode");
  }

  if (!database.isConfigured()) {
    logger.warn("[admin-api] Database not configured; admin API will be read-only");
  } else {
    await database.initialize();
  }

  const app = createApp();
  const port = Number(process.env.PORT || process.env.ADMIN_API_PORT || 3080);
  const host = process.env.HOST || process.env.ADMIN_API_HOST || "127.0.0.1";

  const server = app.listen(port, host, () => {
    logger.info(`[admin-api] Listening on http://${host}:${port}`);
  });

  process.on("SIGINT", () => {
    logger.info("[admin-api] Caught SIGINT, shutting down");
    server.close(() => {
      database.close().finally(() => process.exit(0));
    });
  });

  process.on("unhandledRejection", (err) => {
    logger.error("[admin-api] Unhandled rejection", { err: err?.message || err });
  });
}

start().catch((err) => {
  logger.error("[admin-api] Failed to start", { err: err?.message || err });
  process.exit(1);
});
