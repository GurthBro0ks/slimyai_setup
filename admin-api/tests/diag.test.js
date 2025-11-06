"use strict";

process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ||= "test-secret";
process.env.SESSION_SECRET ||= "test-session-secret";
process.env.OPENAI_API_KEY ||= "sk-test-key-for-validation";

const request = require("supertest");
const app = require("../src/app");
const { signSession, COOKIE_NAME } = require("../lib/jwt");
const { storeSession, clearSession } = require("../lib/session-store");

function buildAdminCookie() {
  const userId = "admin-diag-test";
  storeSession(userId, {
    guilds: [],
    role: "admin",
    accessToken: "test",
    refreshToken: "test",
  });

  const token = signSession({
    user: {
      id: userId,
      username: "DiagTester",
      globalName: "DiagTester",
      role: "admin",
    },
  });

  return { cookie: `${COOKIE_NAME}=${token}`, userId };
}

async function run() {
  console.log("\n=== Diagnostics Endpoint Test ===\n");

  const { cookie, userId } = buildAdminCookie();

  // Test 1: /api/diag returns 200
  console.log("Test 1: /api/diag responds with 200");
  const res = await request(app).get("/api/diag").set("Cookie", cookie);

  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  console.log("✅ Status 200");

  // Test 2: Response is valid JSON
  console.log("\nTest 2: Response is valid JSON");
  if (!res.body || typeof res.body !== "object") {
    throw new Error("Response body is not a valid JSON object");
  }
  console.log("✅ Valid JSON object");

  // Test 3: Contains required fields
  console.log("\nTest 3: Response contains required fields");
  const required = ["uptimeSec", "requestsSinceBoot", "startedAt"];
  for (const field of required) {
    if (!(field in res.body)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  console.log("✅ Contains:", required.join(", "));

  // Test 4: Uptime is present
  console.log("\nTest 4: Uptime field validation");
  if (typeof res.body.uptimeSec !== "number") {
    throw new Error(`uptimeSec should be number, got ${typeof res.body.uptimeSec}`);
  }
  console.log("✅ Uptime:", res.body.uptimeSec, "seconds");

  // Test 5: Request counters present
  console.log("\nTest 5: Request counters validation");
  if (typeof res.body.requestsSinceBoot !== "object") {
    throw new Error(`requestsSinceBoot should be object, got ${typeof res.body.requestsSinceBoot}`);
  }
  if (typeof res.body.requestsSinceBoot.total !== "number") {
    throw new Error(`requestsSinceBoot.total should be number`);
  }
  console.log("✅ Request counters present, total:", res.body.requestsSinceBoot.total);

  // Test 6: Check OpenAI diagnostic endpoint separately
  console.log("\nTest 6: OpenAI diagnostic endpoint");
  const openaiRes = await request(app)
    .get("/api/diag/openai-usage")
    .set("Cookie", cookie);

  if (openaiRes.status !== 200) {
    console.warn("⚠️  OpenAI diagnostic endpoint returned", openaiRes.status);
  } else {
    console.log("✅ OpenAI diagnostic endpoint responds");
    if (openaiRes.body.maskedKey) {
      console.log("   Masked key:", openaiRes.body.maskedKey);
    }
  }

  // Test 7: No secrets leaked
  console.log("\nTest 7: Secret leakage check");
  const allBodies = JSON.stringify([res.body, openaiRes.body]);

  // Check for unmasked OpenAI keys
  const unmaskedKeyPattern = /sk-[a-zA-Z0-9]{40,}/;
  if (unmaskedKeyPattern.test(allBodies)) {
    throw new Error("Unmasked OpenAI key found in diagnostic responses");
  }

  // Check that masked keys use bullet characters
  if (openaiRes.body.maskedKey) {
    if (!openaiRes.body.maskedKey.includes("•")) {
      throw new Error("OpenAI key masking doesn't use bullet characters");
    }
    console.log("✅ OpenAI key properly masked");
  } else {
    console.log("✅ No OpenAI key in response (likely not configured)");
  }

  // Cleanup
  clearSession(userId);

  console.log("\n✅ All diagnostics tests passed!");
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ Diagnostics test failure:", err.message);
  console.error(err.stack);
  process.exit(1);
});
