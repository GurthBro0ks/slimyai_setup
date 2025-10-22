// tests/memory-loop.test.js
// Automated test suite for memory module
// Uses Node.js built-in assert - no external dependencies needed

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Test database file (isolated from production)
const TEST_DB_FILE = path.join(__dirname, "..", "data_store_test.json");
const ORIGINAL_FILE = path.join(__dirname, "..", "data_store.json");

// Colors for output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

// Helper to load memory module with test database
function loadMemoryModule() {
  // Backup original file path
  const originalEnv = process.env.NODE_ENV;

  // Clear module cache to reload with new file path
  delete require.cache[require.resolve("../lib/memory.js")];

  // Mock the file path before requiring
  const Module = require("module");
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function (id) {
    if (id === "fs") {
      const fs = originalRequire.call(this, id);
      const originalReadFileSync = fs.readFileSync;
      const originalWriteFileSync = fs.writeFileSync;
      const originalRenameSync = fs.renameSync;
      const originalExistsSync = fs.existsSync;
      const originalUnlinkSync = fs.unlinkSync;

      return new Proxy(fs, {
        get(target, prop) {
          if (prop === "readFileSync") {
            return function (file, ...args) {
              if (file.includes("data_store.json")) {
                file = TEST_DB_FILE;
              }
              return originalReadFileSync.call(fs, file, ...args);
            };
          }
          if (prop === "writeFileSync") {
            return function (file, ...args) {
              if (file.includes("data_store.json")) {
                file = TEST_DB_FILE;
              }
              return originalWriteFileSync.call(fs, file, ...args);
            };
          }
          if (prop === "renameSync") {
            return function (oldPath, newPath) {
              if (oldPath.includes("data_store.json"))
                oldPath = oldPath.replace(
                  "data_store.json",
                  "data_store_test.json",
                );
              if (newPath.includes("data_store.json")) newPath = TEST_DB_FILE;
              return originalRenameSync.call(fs, oldPath, newPath);
            };
          }
          if (prop === "existsSync") {
            return function (file) {
              if (file.includes("data_store.json")) {
                file = TEST_DB_FILE;
              }
              return originalExistsSync.call(fs, file);
            };
          }
          if (prop === "unlinkSync") {
            return function (file) {
              if (file.includes("data_store.json")) {
                file = TEST_DB_FILE;
              }
              return originalUnlinkSync.call(fs, file);
            };
          }
          return target[prop];
        },
      });
    }
    return originalRequire.call(this, id);
  };

  const mem = require("../lib/memory.js");

  // Restore original require
  Module.prototype.require = originalRequire;

  return mem;
}

// Setup: Create clean test database
function setup() {
  console.log(`${BLUE}===========================================`);
  console.log(`Memory System Test Suite`);
  console.log(`===========================================${RESET}\n`);

  // Create empty test database
  const emptyDb = { prefs: [], memos: [], channelModes: [] };
  fs.writeFileSync(TEST_DB_FILE, JSON.stringify(emptyDb, null, 2));
  console.log(`${GREEN}✓${RESET} Test database created: ${TEST_DB_FILE}\n`);
}

// Teardown: Clean up test database
function teardown() {
  if (fs.existsSync(TEST_DB_FILE)) {
    fs.unlinkSync(TEST_DB_FILE);
    console.log(`${GREEN}✓${RESET} Test database cleaned up\n`);
  }
  const tempFile = TEST_DB_FILE + ".tmp";
  if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
}

// Test runner
async function test(name, fn) {
  try {
    // Reset database before each test
    const emptyDb = { prefs: [], memos: [], channelModes: [] };
    fs.writeFileSync(TEST_DB_FILE, JSON.stringify(emptyDb, null, 2));

    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    results.passed++;
    results.tests.push({ name, status: "PASS" });
  } catch (err) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
    if (err.stack) {
      console.log(`  ${err.stack.split("\n").slice(1, 3).join("\n")}${RESET}`);
    }
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: err.message });
  }
}

// Read test database
function readTestDb() {
  return JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf8"));
}

// ====================
// UNIT TESTS
// ====================

async function unitTests() {
  console.log(`${BLUE}--- Unit Tests ---${RESET}`);

  const mem = loadMemoryModule();

  await test("setConsent() creates consent entry", async () => {
    await mem.setConsent({ userId: "user1", guildId: "guild1", allowed: true });
    const db = readTestDb();
    assert.strictEqual(db.prefs.length, 1);
    assert.strictEqual(db.prefs[0].value, "1");
  });

  await test("getConsent() retrieves consent", async () => {
    await mem.setConsent({ userId: "user1", guildId: "guild1", allowed: true });
    const result = await mem.getConsent({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(result, true);
  });

  await test("getConsent() returns false for no consent", async () => {
    const result = await mem.getConsent({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(result, false);
  });

  await test("addMemo() creates memo with unique ID", async () => {
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "Test note",
    });
    assert.ok(memo._id);
    assert.strictEqual(memo.content, "Test note");
    assert.strictEqual(memo.userId, "user1");
  });

  await test("addMemo() persists to database", async () => {
    await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "Test note",
    });
    const db = readTestDb();
    assert.strictEqual(db.memos.length, 1);
    assert.strictEqual(db.memos[0].content, "Test note");
  });

  await test("listMemos() returns user memos", async () => {
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
    await mem.addMemo({
      userId: "user2",
      guildId: "guild1",
      content: "Note 3",
    });

    const memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(memos.length, 2);
  });

  await test("listMemos() respects guild isolation", async () => {
    await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "Guild note",
    });
    await mem.addMemo({ userId: "user1", guildId: null, content: "DM note" });

    const guildMemos = await mem.listMemos({
      userId: "user1",
      guildId: "guild1",
    });
    const dmMemos = await mem.listMemos({ userId: "user1", guildId: null });

    assert.strictEqual(guildMemos.length, 1);
    assert.strictEqual(dmMemos.length, 1);
    assert.strictEqual(guildMemos[0].content, "Guild note");
    assert.strictEqual(dmMemos[0].content, "DM note");
  });

  await test("deleteMemo() removes memo by ID", async () => {
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "Test",
    });
    const deleted = await mem.deleteMemo({ id: memo._id, userId: "user1" });

    assert.strictEqual(deleted, true);
    const db = readTestDb();
    assert.strictEqual(db.memos.length, 0);
  });

  await test("deleteMemo() returns false for non-existent ID", async () => {
    const deleted = await mem.deleteMemo({
      id: "nonexistent",
      userId: "user1",
    });
    assert.strictEqual(deleted, false);
  });

  await test("deleteMemo() only deletes own memos (security)", async () => {
    const memo1 = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "User1",
    });
    await mem.addMemo({ userId: "user2", guildId: "guild1", content: "User2" });

    // Try to delete user2's memo as user1
    const deleted = await mem.deleteMemo({ id: memo1._id, userId: "user2" });

    assert.strictEqual(deleted, false);
    const db = readTestDb();
    assert.strictEqual(db.memos.length, 2); // Both still exist
  });

  console.log();
}

// ====================
// INTEGRATION TESTS
// ====================

async function integrationTests() {
  console.log(`${BLUE}--- Integration Tests (Full Flow) ---${RESET}`);

  const mem = loadMemoryModule();

  await test("Full remember → export → forget flow", async () => {
    // Step 1: Set consent
    await mem.setConsent({ userId: "user1", guildId: "guild1", allowed: true });
    const consent = await mem.getConsent({
      userId: "user1",
      guildId: "guild1",
    });
    assert.strictEqual(consent, true);

    // Step 2: Add memo
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "Integration test",
    });
    assert.ok(memo._id);

    // Step 3: List/export
    const memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(memos.length, 1);
    assert.strictEqual(memos[0].content, "Integration test");

    // Step 4: Delete
    const deleted = await mem.deleteMemo({ id: memo._id, userId: "user1" });
    assert.strictEqual(deleted, true);

    // Step 5: Verify deletion
    const memosAfter = await mem.listMemos({
      userId: "user1",
      guildId: "guild1",
    });
    assert.strictEqual(memosAfter.length, 0);
  });

  await test("Multiple memos lifecycle", async () => {
    // Add 5 memos
    const ids = [];
    for (let i = 1; i <= 5; i++) {
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: `Note ${i}`,
      });
      ids.push(memo._id);
    }

    // Verify all added
    let memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(memos.length, 5);

    // Delete 2 memos
    await mem.deleteMemo({ id: ids[1], userId: "user1" });
    await mem.deleteMemo({ id: ids[3], userId: "user1" });

    // Verify 3 remaining
    memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(memos.length, 3);
  });

  console.log();
}

// ====================
// EDGE CASE TESTS
// ====================

async function edgeCaseTests() {
  console.log(`${BLUE}--- Edge Case Tests ---${RESET}`);

  const mem = loadMemoryModule();

  await test("Empty string content", async () => {
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "",
    });
    assert.strictEqual(memo.content, "");
  });

  await test("Very long content (10000 chars)", async () => {
    const longText = "A".repeat(10000);
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: longText,
    });
    assert.strictEqual(memo.content.length, 10000);

    const memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(memos[0].content.length, 10000);
  });

  await test("Special characters and emoji", async () => {
    const special = "Test 🐌🎉 <>&\"' \\n\\t";
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: special,
    });
    assert.strictEqual(memo.content, special);
  });

  await test("Unicode and multilingual content", async () => {
    const unicode = "Hello 你好 مرحبا Привет 🌍";
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: unicode,
    });
    assert.strictEqual(memo.content, unicode);
  });

  await test("Null guildId (DM context)", async () => {
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: null,
      content: "DM note",
    });
    assert.strictEqual(memo.guildId, null);

    const memos = await mem.listMemos({ userId: "user1", guildId: null });
    assert.strictEqual(memos.length, 1);
  });

  await test("Rapid sequential operations", async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        mem.addMemo({
          userId: "user1",
          guildId: "guild1",
          content: `Note ${i}`,
        }),
      );
    }

    const memos = await Promise.all(promises);
    assert.strictEqual(memos.length, 10);

    // Verify all saved
    const saved = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    assert.strictEqual(saved.length, 10);

    // Check for unique IDs
    const ids = saved.map((m) => m._id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, 10, "All IDs should be unique");
  });

  console.log();
}

// ====================
// RACE CONDITION TESTS
// ====================

async function raceConditionTests() {
  console.log(`${BLUE}--- Race Condition Tests (Concurrent Ops) ---${RESET}`);

  const mem = loadMemoryModule();

  await test("Concurrent addMemo operations", async () => {
    const operations = [];
    for (let i = 0; i < 20; i++) {
      operations.push(
        mem.addMemo({
          userId: `user${i % 5}`,
          guildId: "guild1",
          content: `Concurrent note ${i}`,
        }),
      );
    }

    const results = await Promise.all(operations);
    assert.strictEqual(results.length, 20);

    // Verify all saved (THIS MAY FAIL DUE TO RACE CONDITION BUG)
    const db = readTestDb();
    if (db.memos.length < 20) {
      throw new Error(
        `Race condition detected: Expected 20 memos, got ${db.memos.length}`,
      );
    }
    assert.strictEqual(db.memos.length, 20);
  });

  await test("Concurrent addMemo + deleteMemo", async () => {
    // Add one memo first
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "To delete",
    });

    // Now run concurrent add + delete
    const operations = [
      mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "New note 1",
      }),
      mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "New note 2",
      }),
      mem.deleteMemo({ id: memo._id, userId: "user1" }),
      mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: "New note 3",
      }),
    ];

    await Promise.all(operations);

    // Should have 3 memos (original deleted, 3 new added)
    const memos = await mem.listMemos({ userId: "user1", guildId: "guild1" });
    if (memos.length !== 3) {
      throw new Error(`Race condition: Expected 3 memos, got ${memos.length}`);
    }
  });

  await test("Concurrent consent + addMemo", async () => {
    const operations = [
      mem.setConsent({ userId: "user1", guildId: "guild1", allowed: true }),
      mem.addMemo({ userId: "user1", guildId: "guild1", content: "Note A" }),
      mem.setConsent({ userId: "user2", guildId: "guild1", allowed: true }),
      mem.addMemo({ userId: "user2", guildId: "guild1", content: "Note B" }),
    ];

    await Promise.all(operations);

    const db = readTestDb();
    // Should have 2 consents and 2 memos
    assert.strictEqual(db.prefs.length, 2, "Should have 2 consent entries");
    assert.strictEqual(db.memos.length, 2, "Should have 2 memos");
  });

  console.log();
}

// ====================
// ERROR HANDLING TESTS
// ====================

async function errorHandlingTests() {
  console.log(`${BLUE}--- Error Handling Tests ---${RESET}`);

  await test("Corrupted database file recovery", async () => {
    // Corrupt the file
    fs.writeFileSync(TEST_DB_FILE, "{invalid json");

    // Module should handle gracefully
    const mem = loadMemoryModule();
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "After corruption",
    });

    assert.ok(memo._id);
    const db = readTestDb();
    assert.ok(db.memos);
  });

  await test("Missing database file auto-creation", async () => {
    // Delete the file
    if (fs.existsSync(TEST_DB_FILE)) {
      fs.unlinkSync(TEST_DB_FILE);
    }

    const mem = loadMemoryModule();
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "New DB",
    });

    assert.ok(memo._id);
    assert.ok(fs.existsSync(TEST_DB_FILE));
  });

  console.log();
}

// ====================
// DATA INTEGRITY TESTS
// ====================

async function dataIntegrityTests() {
  console.log(`${BLUE}--- Data Integrity Tests ---${RESET}`);

  const mem = loadMemoryModule();

  await test("Memo IDs are unique across rapid creation", async () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const memo = await mem.addMemo({
        userId: "user1",
        guildId: "guild1",
        content: `Test ${i}`,
      });
      if (ids.has(memo._id)) {
        throw new Error(`Duplicate ID detected: ${memo._id}`);
      }
      ids.add(memo._id);
    }
    assert.strictEqual(ids.size, 50);
  });

  await test("Deleted memos are actually removed from file", async () => {
    const memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "To delete",
    });
    await mem.deleteMemo({ id: memo._id, userId: "user1" });

    const db = readTestDb();
    const found = db.memos.find((m) => m._id === memo._id);
    assert.strictEqual(
      found,
      undefined,
      "Deleted memo should not exist in file",
    );
  });

  await test("User isolation: Users cannot delete other users memos", async () => {
    const user1Memo = await mem.addMemo({
      userId: "user1",
      guildId: "guild1",
      content: "User 1",
    });
    const user2Memo = await mem.addMemo({
      userId: "user2",
      guildId: "guild1",
      content: "User 2",
    });

    // User1 tries to delete User2's memo
    const deleted = await mem.deleteMemo({
      id: user2Memo._id,
      userId: "user1",
    });
    assert.strictEqual(deleted, false);

    // Verify User2's memo still exists
    const memos = await mem.listMemos({ userId: "user2", guildId: "guild1" });
    assert.strictEqual(memos.length, 1);
  });

  console.log();
}

// ====================
// MAIN RUNNER
// ====================

async function runAllTests() {
  setup();

  try {
    await unitTests();
    await integrationTests();
    await edgeCaseTests();
    await raceConditionTests();
    await errorHandlingTests();
    await dataIntegrityTests();
  } catch (err) {
    console.error(`${RED}FATAL ERROR:${RESET}`, err);
  } finally {
    teardown();

    // Print summary
    console.log(`${BLUE}===========================================`);
    console.log(`Test Summary`);
    console.log(`===========================================${RESET}`);
    console.log(`${GREEN}Passed: ${results.passed}${RESET}`);
    console.log(`${RED}Failed: ${results.failed}${RESET}`);
    console.log(`${YELLOW}Skipped: ${results.skipped}${RESET}`);
    console.log(
      `Total: ${results.passed + results.failed + results.skipped}\n`,
    );

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

// Run if called directly
if (require.main === module) {
  runAllTests().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
