"use strict";

process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ||= "test-secret";
process.env.DISCORD_REDIRECT_URI ||= "https://example.com/callback";
process.env.SESSION_SECRET ||= "test-session-secret";

const request = require("supertest");
const app = require("../src/app");
const { signSession } = require("../lib/jwt");
const { storeSession, clearSession } = require("../lib/session-store");

const COOKIE_NAME = "slimy_admin";
const TEST_GUILD_ID = "1234567890";

function buildCookie({ id, role, guilds }) {
  storeSession(id, {
    guilds,
    role,
    accessToken: "test",
    refreshToken: "test",
  });
  const token = signSession({
    user: {
      id,
      username: `${role}-tester`,
      globalName: `${role}-tester`,
      role,
      guilds,
    },
  });
  return `${COOKIE_NAME}=${token}`;
}

async function expectStatus(label, req, expected) {
  const res = await req;
  if (res.status !== expected) {
    throw new Error(
      `${label} expected HTTP ${expected} but received ${res.status} (${res.text || res.body?.error || "no body"})`,
    );
  }
  return res;
}

async function run() {
  const memberCookie = buildCookie({
    id: "member-user",
    role: "member",
    guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }],
  });

  await expectStatus(
    "member snail access",
    request(app)
      .get(`/api/guilds/${TEST_GUILD_ID}/snail/analyze_help`)
      .set("Cookie", memberCookie),
    200,
  );

  await expectStatus(
    "member blocked from admin route",
    request(app).get("/api/guilds").set("Cookie", memberCookie),
    403,
  );

  const adminCookie = buildCookie({
    id: "admin-user",
    role: "admin",
    guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }],
  });

  await expectStatus(
    "admin snail access",
    request(app)
      .get(`/api/guilds/${TEST_GUILD_ID}/snail/analyze_help`)
      .set("Cookie", adminCookie),
    200,
  );

  await expectStatus(
    "admin diag access",
    request(app).get("/api/diag").set("Cookie", adminCookie),
    200,
  );

  clearSession("member-user");
  clearSession("admin-user");

  console.log("✅ Role guard checks passed for member/admin cookies.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Role guard test failure:", err);
  process.exit(1);
});
