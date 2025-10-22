/**
 * PM2 ecosystem for slimy-bot
 * - Runs from this folder (cwd: __dirname)
 * - index.js loads .env (require('dotenv').config())
 * - Set WATCH_DEV=1 before restart to enable file watching in dev
 */
const path = require("path");

const WATCH = process.env.WATCH_DEV === "1";

module.exports = {
  apps: [
    {
      name: "slimy-bot",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      max_memory_restart: "300M",
      watch: WATCH,
      ignore_watch: ["node_modules", ".git", "logs"],
      out_file: path.join(__dirname, "logs", "slimy-bot.out.log"),
      error_file: path.join(__dirname, "logs", "slimy-bot.err.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
