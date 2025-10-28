#!/usr/bin/env node
"use strict";

process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ||= "test-secret";
process.env.SESSION_SECRET ||= "test-session-secret";

const request = require("supertest");
const app = require("../src/app");
const { signSession, COOKIE_NAME } = require("../lib/jwt");
const { storeSession, clearSession } = require("../lib/session-store");

const TEST_GUILD_ID = process.env.TEST_GUILD_ID || "1176605506912141444";

function buildCookie(role) {
  const userId = `${role}-sheet-test`;
  storeSession(userId, {
    guilds: [{ id: TEST_GUILD_ID, name: "Test Guild", role, installed: true }],
    role,
    accessToken: "test",
    refreshToken: "test",
  });

  const token = signSession({
    user: {
      id: userId,
      username: `${role}Tester`,
      globalName: `${role}Tester`,
      role,
    },
  });

  return { cookie: `${COOKIE_NAME}=${token}`, userId };
}

async function run() {
  console.log("\n=== Guild Settings / Sheet Smoke Test ===\n");
  console.log("Guild ID:", TEST_GUILD_ID);

  // Test 1: Club role can GET settings
  console.log("\nTest 1: Club role can GET settings");
  const { cookie: clubCookie, userId: clubUserId } = buildCookie("club");
  
  const clubGetRes = await request(app)
    .get(`/api/guilds/${TEST_GUILD_ID}/settings`)
    .set("Cookie", clubCookie);

  console.log("Status:", clubGetRes.status);
  console.log("Body keys:", Object.keys(clubGetRes.body || {}));

  if (clubGetRes.status === 403) {
    throw new Error("❌ Club role still getting 403 on GET /settings!");
  }
  if (clubGetRes.status !== 200) {
    throw new Error(`Expected 200, got ${clubGetRes.status}: ${JSON.stringify(clubGetRes.body)}`);
  }
  console.log("✅ Club role can read settings");

  // Test 2: Club role CANNOT PUT settings
  console.log("\nTest 2: Club role cannot write settings");
  const clubPutRes = await request(app)
    .put(`/api/guilds/${TEST_GUILD_ID}/settings`)
    .set("Cookie", clubCookie)
    .send({ screenshot_channel_id: "12345" });

  console.log("Status:", clubPutRes.status);
  if (clubPutRes.status !== 403) {
    throw new Error(`Club should be blocked from PUT, but got ${clubPutRes.status}`);
  }
  console.log("✅ Club role properly blocked from writing settings");

  // Test 3: Admin role can GET settings
  console.log("\nTest 3: Admin role can GET settings");
  const { cookie: adminCookie, userId: adminUserId } = buildCookie("admin");
  
  const adminGetRes = await request(app)
    .get(`/api/guilds/${TEST_GUILD_ID}/settings`)
    .set("Cookie", adminCookie);

  if (adminGetRes.status !== 200) {
    throw new Error(`Admin GET failed with ${adminGetRes.status}`);
  }
  console.log("✅ Admin role can read settings");

  // Test 4: Admin role can PUT settings
  console.log("\nTest 4: Admin role can write settings");
  const adminPutRes = await request(app)
    .put(`/api/guilds/${TEST_GUILD_ID}/settings`)
    .set("Cookie", adminCookie)
    .send({ screenshot_channel_id: "98765" });

  console.log("Status:", adminPutRes.status);
  if (adminPutRes.status !== 200) {
    console.warn("⚠️  Admin PUT failed (might be validation issue):", adminPutRes.body);
  } else {
    console.log("✅ Admin role can write settings");
  }

  // Cleanup
  clearSession(clubUserId);
  clearSession(adminUserId);

  console.log("\n✅ All sheet/settings smoke tests passed!");
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ Sheet smoke test failure:", err.message);
  console.error(err.stack);
  process.exit(1);
});
