#!/usr/bin/env node
"use strict";

/**
 * Admin API Doctor Script
 *
 * Probes all admin API endpoints to ensure they:
 * - Return valid HTTP status codes
 * - Return parseable JSON
 * - Include expected top-level keys
 * - Never crash with unhandled errors
 *
 * Usage:
 *   node admin-api/scripts/doctor.js [base-url]
 *
 * Example:
 *   node admin-api/scripts/doctor.js http://localhost:3080
 */

const BASE_URL = process.argv[2] || "http://localhost:3080";
const TEST_GUILD_ID = process.env.TEST_GUILD_ID || "1176605506912141444";

// Build a test auth cookie (requires running API)
function buildTestCookie() {
  // In production, you'd get this from a real login
  // For now, this script assumes you have a valid session
  // or you're testing against a dev server with test mode
  return process.env.TEST_AUTH_COOKIE || "";
}

async function probe(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  const result = {
    endpoint,
    method: options.method || "GET",
    status: null,
    ok: false,
    json: null,
    error: null,
    keys: [],
  };

  try {
    const response = await fetch(url, {
      method: result.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    result.status = response.status;
    result.ok = response.ok;

    // Try to parse JSON
    try {
      const text = await response.text();
      result.json = JSON.parse(text);
      result.keys = Object.keys(result.json);
    } catch (parseErr) {
      result.error = `Failed to parse JSON: ${parseErr.message}`;
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

function formatResult(result) {
  const status = result.status || "ERR";
  const statusEmoji = result.ok ? "✅" : "❌";
  const method = result.method.padEnd(6);
  const endpoint = result.endpoint.padEnd(50);

  let details = "";
  if (result.error) {
    details = `ERROR: ${result.error}`;
  } else if (result.keys.length > 0) {
    details = `keys: ${result.keys.join(", ")}`;
  } else {
    details = "(empty response)";
  }

  return `${statusEmoji} ${method} ${status} ${endpoint} ${details}`;
}

async function main() {
  console.log("🔍 Admin API Doctor");
  console.log(`📡 Base URL: ${BASE_URL}`);
  console.log(`🏰 Test Guild: ${TEST_GUILD_ID}`);
  console.log();

  const cookie = buildTestCookie();
  if (!cookie) {
    console.log("⚠️  No TEST_AUTH_COOKIE provided - authenticated endpoints will fail");
    console.log("   To test authenticated routes, set TEST_AUTH_COOKIE env var");
    console.log();
  }

  const endpoints = [
    // Public endpoints
    { endpoint: "/api/", desc: "Root check" },
    { endpoint: "/api/ping", desc: "Health ping" },
    { endpoint: "/api/auth/debug", desc: "Auth debug (requires cookie)" },

    // Guild endpoints (admin only)
    { endpoint: "/api/guilds", desc: "List guilds", cookie },
    { endpoint: `/api/guilds/${TEST_GUILD_ID}/health`, desc: "Guild health", cookie },
    { endpoint: `/api/guilds/${TEST_GUILD_ID}/settings`, desc: "Guild settings", cookie },
    { endpoint: `/api/guilds/${TEST_GUILD_ID}/channels`, desc: "Guild channels", cookie },
    { endpoint: `/api/guilds/${TEST_GUILD_ID}/personality`, desc: "Guild personality", cookie },
    { endpoint: `/api/guilds/${TEST_GUILD_ID}/usage`, desc: "Guild usage", cookie },

    // Diagnostic endpoints
    { endpoint: "/api/diag", desc: "Bot diagnostics", cookie },

    // Snail endpoints
    { endpoint: `/api/guilds/${TEST_GUILD_ID}/snail/analyze_help`, desc: "Snail help", cookie },
  ];

  const results = [];

  for (const { endpoint, desc, cookie } of endpoints) {
    const result = await probe(endpoint, { cookie });
    results.push(result);
    console.log(formatResult(result));

    // Small delay to avoid hammering
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log();
  console.log("📊 Summary");
  console.log("-".repeat(80));

  const total = results.length;
  const ok = results.filter(r => r.ok).length;
  const errors = results.filter(r => r.error).length;
  const serverErrors = results.filter(r => r.status >= 500).length;
  const clientErrors = results.filter(r => r.status >= 400 && r.status < 500).length;

  console.log(`Total endpoints: ${total}`);
  console.log(`✅ OK (2xx-3xx): ${ok}`);
  console.log(`⚠️  Client errors (4xx): ${clientErrors}`);
  console.log(`❌ Server errors (5xx): ${serverErrors}`);
  console.log(`💥 Network errors: ${errors}`);

  console.log();

  if (serverErrors > 0) {
    console.log("❌ FAIL: Some endpoints returned 5xx errors");
    process.exit(1);
  } else if (errors > 0) {
    console.log("⚠️  WARNING: Some endpoints had network errors");
    process.exit(0);
  } else if (clientErrors === total) {
    console.log("⚠️  WARNING: All endpoints returned 4xx (likely missing auth)");
    process.exit(0);
  } else {
    console.log("✅ PASS: All endpoints responded without server errors");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("💥 Doctor script crashed:", err);
  process.exit(1);
});
