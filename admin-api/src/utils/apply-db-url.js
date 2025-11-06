"use strict";

function applyDatabaseUrl(urlValue) {
  if (!urlValue || typeof urlValue !== "string") return;

  try {
    const parsed = new URL(urlValue);
    if (!process.env.DB_HOST) process.env.DB_HOST = parsed.hostname;
    if (!process.env.DB_PORT) process.env.DB_PORT = parsed.port || "3306";
    if (!process.env.DB_USER) process.env.DB_USER = decodeURIComponent(parsed.username || "");
    if (!process.env.DB_PASSWORD) {
      process.env.DB_PASSWORD = decodeURIComponent(parsed.password || "");
    }
    if (!process.env.DB_NAME) {
      const pathname = parsed.pathname.startsWith("/")
        ? parsed.pathname.slice(1)
        : parsed.pathname;
      process.env.DB_NAME = pathname;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[admin-api] Failed to parse DB_URL:", err.message);
  }
}

module.exports = { applyDatabaseUrl };
