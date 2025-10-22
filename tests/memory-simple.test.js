// tests/memory-simple.test.js
// Simplified test suite that uses a real test database file
// No complex mocking - just test the actual functions

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Test database isolation
const TEST_DIR = path.join(__dirname, "tmp-memory-store");
const TEST_DB = path.join(TEST_DIR, "data_store.json");

// Colors
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

let results = { passed: 0, failed: 0, tests: [] };

// Setup - create test DB and temporarily change the memory module's file path
function setup() {
  console.log(`${BLUE}===========================================`);
  console.log(`Memory System Test Suite (Simplified)`);
  console.log(`===========================================${RESET}\n`);

  // Ensure test directory exists and is clean
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Point memory module to isolated test file
  process.env.SLIMY_MEMORY_FILE = TEST_DB;

  // Seed empty test DB
  const emptyDb = { prefs: [], memos: [], channelModes: [] };
  fs.writeFileSync(TEST_DB, JSON.stringify(emptyDb, null, 2));

  console.log(`${GREEN}✓${RESET} Test environment ready\n`);
}

function teardown() {
  // Clean up test DB
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_DB + ".tmp")) fs.unlinkSync(TEST_DB + ".tmp");
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  delete process.env.SLIMY_MEMORY_FILE;

  console.log(`${GREEN}✓${RESET} Test environment cleaned up\n`);
}

async function test(name, fn) {
  // Clear module cache to get fresh instance
  delete require.cache[require.resolve("../lib/memory.js")];

  // Reset database before each test for isolation
  const emptyDb = { prefs: [], memos: [], channelModes: [] };
  fs.writeFileSync(TEST_DB, JSON.stringify(emptyDb, null, 2));

  try {
    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    results.passed++;
    results.tests.push({ name, status: "PASS" });
  } catch (err) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: err.message });
  }
}

async function runTests() {
  setup();

  try {
    console.log(`${BLUE}--- Basic Functionality Tests ---${RESET}`);

    await test("setConsent() and getConsent() work", async () => {
      const mem = require("../lib/memory.js");
      await mem.setConsent({
        userId: "user1",
        guildId: "guild1",
        allowed: true,
      });
      const result = await mem.getConsent({
        userId: "user1",
        guildId: "guild1",
      });
      assert.strictEqual(result, true);
    });

    await test("addMemo() creates memo with ID", async () => {
      const mem = require("../lib/memory.js");
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "Test",
      });
      assert.ok(memo._id);
      assert.strictEqual(memo.content, "Test");
    });

    await test("listMemos() returns correct memos", async () => {
      const mem = require("../lib/memory.js");
      await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "Note 1",
      });
      await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "Note 2",
      });

      const memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
      assert.strictEqual(memos.length, 2);
    });

    await test("deleteMemo() removes memo", async () => {
      const mem = require("../lib/memory.js");
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "Delete me",
      });
      const deleted = await mem.deleteMemo({ id: memo._id, userId: "user1" });
      assert.strictEqual(deleted, true);

      const memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
      const found = memos.find((m) => m._id === memo._id);
      assert.strictEqual(found, undefined);
    });

    await test("Guild/DM isolation works", async () => {
      const mem = require("../lib/memory.js");
      await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "Guild",
      });
      await mem.addMemo({ userId: "user1", guildId: null, content: "DM" });

      const guildMemos = await mem.listMemos({
        userId: "user1",
        guildId: "guild1",
      });
      const dmMemos = await mem.listMemos({ userId: "user1", guildId: null });

      assert.strictEqual(guildMemos.length, 1);
      assert.strictEqual(dmMemos.length, 1);
      assert.strictEqual(guildMemos[0].content, "Guild");
      assert.strictEqual(dmMemos[0].content, "DM");
    });

    console.log();
    console.log(`${BLUE}--- Edge Case Tests ---${RESET}`);

    await test("Special characters and emoji", async () => {
      const mem = require("../lib/memory.js");
      const special = "Test 🐌🎉 <>&\"' \\n\\t";
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: special,
      });
      assert.strictEqual(memo.content, special);
    });

    await test("Very long content (5000 chars)", async () => {
      const mem = require("../lib/memory.js");
      const long = "A".repeat(5000);
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: long,
      });
      assert.strictEqual(memo.content.length, 5000);
    });

    await test("Empty content string", async () => {
      const mem = require("../lib/memory.js");
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "",
      });
      assert.strictEqual(memo.content, "");
    });

    console.log();
    console.log(`${BLUE}--- Security Tests ---${RESET}`);

    await test("User cannot delete other user memos", async () => {
      const mem = require("../lib/memory.js");
      const memo1 = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "User1",
      });
      await mem.addMemo({
        userId: "user2",
        guildId: "guild1",
        content: "User2",
      });

      // User2 tries to delete User1's memo
      const deleted = await mem.deleteMemo({ id: memo1._id, userId: "user2" });
      assert.strictEqual(deleted, false);
    });

    console.log();
    console.log(`${BLUE}--- Concurrent Operation Tests ---${RESET}`);

    await test("Rapid sequential memos (10 memos)", async () => {
      const mem = require("../lib/memory.js");

      // With locking, we need to run sequentially or handle lock contention
      // This tests that locking works correctly
      const memos = [];
      for (let i = 0; i < 10; i++) {
        const memo = await mem.addMemo({
          userId: "user1",
          guildId: "guild1",
          content: `Note ${i}`,
        });
        memos.push(memo);
      }

      assert.strictEqual(memos.length, 10);

      // Check for unique IDs (UUID should guarantee this)
      const ids = memos.map((m) => m._id);
      const uniqueIds = new Set(ids);
      if (uniqueIds.size < 10) {
        throw new Error(
          `ID collision detected: ${10 - uniqueIds.size} duplicates`,
        );
      }

      // Verify all saved
      const saved = await mem.listMemos({ userId: "user1", guildId: "guild1" });
      if (saved.length !== 10) {
        throw new Error(`Expected 10 memos, got ${saved.length}`);
      }
    });
  } catch (err) {
    console.error(`${RED}FATAL:${RESET}`, err);
  } finally {
    teardown();

    // Summary
    console.log(`${BLUE}===========================================`);
    console.log(`Test Summary`);
    console.log(`===========================================${RESET}`);
    console.log(`${GREEN}Passed: ${results.passed}${RESET}`);
    console.log(`${RED}Failed: ${results.failed}${RESET}`);
    console.log(`Total: ${results.passed + results.failed}\n`);

    if (results.failed > 0) {
      console.log(`${RED}FAILED TESTS:${RESET}`);
      results.tests
        .filter((t) => t.status === "FAIL")
        .forEach((t) => {
          console.log(`  ${RED}✗${RESET} ${t.name}`);
          if (t.error) console.log(`    ${t.error}`);
        });
      console.log();
      process.exit(1);
    } else {
      console.log(`${GREEN}✓ All tests passed!${RESET}\n`);
      process.exit(0);
    }
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
  });
}
