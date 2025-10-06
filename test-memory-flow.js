#!/usr/bin/env node
// test-memory-flow.js - Comprehensive memory loop validation
// Tests: /remember → /export → /forget flow with guild/DM context separation

const mem = require('./lib/memory');
const fs = require('fs');
const path = require('path');

// Test data
const TEST_USER_1 = 'test-user-flow-1';
const TEST_USER_2 = 'test-user-flow-2';
const TEST_GUILD_1 = 'test-guild-flow-1';
const TEST_GUILD_2 = 'test-guild-flow-2';

// Colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passCount++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    failCount++;
  }
}

async function cleanup() {
  console.log(`\n${YELLOW}[Setup]${RESET} Cleaning up test data...`);
  const db = mem.load ? require('./lib/memory').load() : null;
  if (!db) {
    console.log(`${RED}✗${RESET} Cannot load database for cleanup`);
    return;
  }

  // Remove all test memos
  const before = db.memos.length;
  db.memos = db.memos.filter(m =>
    !m.userId.includes('test-user-flow') &&
    (!m.guildId || !m.guildId.includes('test-guild-flow'))
  );
  const after = db.memos.length;

  if (before !== after) {
    require('./lib/memory').save(db);
    console.log(`${GREEN}✓${RESET} Removed ${before - after} test memos`);
  } else {
    console.log(`${GREEN}✓${RESET} No test data to clean`);
  }
}

async function testBasicAddAndList() {
  console.log(`\n${YELLOW}[Test 1]${RESET} Basic add and list operations`);

  // Add memo in guild context
  const memo1 = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: 'Test guild note 1'
  });

  assert(memo1 && memo1._id, 'addMemo returns memo with _id');
  assert(memo1.userId === TEST_USER_1, 'addMemo sets correct userId');
  assert(memo1.guildId === TEST_GUILD_1, 'addMemo sets correct guildId');
  assert(memo1.content === 'Test guild note 1', 'addMemo preserves content');
  assert(typeof memo1.createdAt === 'number', 'addMemo sets createdAt timestamp');

  // List memos in same guild context
  const guildMemos = await mem.listMemos({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    limit: 25
  });

  assert(guildMemos.length === 1, 'listMemos returns correct count in guild context');
  assert(guildMemos[0]._id === memo1._id, 'listMemos returns the correct memo');
}

async function testGuildVsDMSeparation() {
  console.log(`\n${YELLOW}[Test 2]${RESET} Guild vs DM context separation`);

  // Add guild memo
  const guildMemo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: 'Guild note'
  });

  // Add DM memo (same user, no guild)
  const dmMemo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: null,
    content: 'DM note'
  });

  // List guild memos - should NOT include DM memos
  const guildList = await mem.listMemos({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1
  });

  // List DM memos - should NOT include guild memos
  const dmList = await mem.listMemos({
    userId: TEST_USER_1,
    guildId: null
  });

  assert(guildList.length >= 1, 'Guild context returns guild memos');
  assert(dmList.length >= 1, 'DM context returns DM memos');
  assert(!guildList.find(m => m._id === dmMemo._id), 'Guild list does NOT include DM memos');
  assert(!dmList.find(m => m._id === guildMemo._id), 'DM list does NOT include guild memos');
  assert(guildList.every(m => m.guildId === TEST_GUILD_1), 'All guild memos have correct guildId');
  assert(dmList.every(m => m.guildId === null), 'All DM memos have null guildId');
}

async function testDeleteOperation() {
  console.log(`\n${YELLOW}[Test 3]${RESET} Delete operation and return values`);

  // Create a memo to delete
  const memo = await mem.addMemo({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2,
    content: 'Memo to be deleted'
  });

  // Verify it exists
  let list = await mem.listMemos({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2
  });
  assert(list.find(m => m._id === memo._id), 'Memo exists before deletion');

  // Delete the memo
  const deleted = await mem.deleteMemo({
    id: memo._id,
    userId: TEST_USER_2
  });

  assert(deleted === true, 'deleteMemo returns true for successful deletion');

  // Verify it's gone
  list = await mem.listMemos({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2
  });
  assert(!list.find(m => m._id === memo._id), 'Memo does not exist after deletion');

  // Try to delete non-existent memo
  const notDeleted = await mem.deleteMemo({
    id: 'nonexistent-id-12345',
    userId: TEST_USER_2
  });

  assert(notDeleted === false, 'deleteMemo returns false for non-existent memo');
}

async function testUserIsolation() {
  console.log(`\n${YELLOW}[Test 4]${RESET} User isolation (security test)`);

  // User 1 creates a memo
  const user1Memo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: 'User 1 private note'
  });

  // User 2 tries to delete User 1's memo
  const deletedByWrongUser = await mem.deleteMemo({
    id: user1Memo._id,
    userId: TEST_USER_2 // Wrong user!
  });

  assert(deletedByWrongUser === false, 'User 2 cannot delete User 1 memo');

  // Verify memo still exists for User 1
  const user1List = await mem.listMemos({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1
  });
  assert(user1List.find(m => m._id === user1Memo._id), 'User 1 memo still exists');

  // User 2 cannot see User 1's memos
  const user2List = await mem.listMemos({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_1
  });
  assert(!user2List.find(m => m._id === user1Memo._id), 'User 2 cannot see User 1 memos');
}

async function testEdgeCases() {
  console.log(`\n${YELLOW}[Test 5]${RESET} Edge cases and special characters`);

  // Empty content
  const emptyMemo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: ''
  });
  assert(emptyMemo && emptyMemo._id, 'Can create memo with empty content');

  // Special characters and unicode
  const specialMemo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: '🎉 Special chars: "quotes", \'apostrophes\', <tags>, & symbols! 你好'
  });
  assert(specialMemo && specialMemo._id, 'Can create memo with special characters');

  // Retrieve and verify content is preserved
  const list = await mem.listMemos({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1
  });
  const found = list.find(m => m._id === specialMemo._id);
  assert(
    found && found.content === specialMemo.content,
    'Special characters are preserved correctly'
  );

  // Long content
  const longContent = 'A'.repeat(1000);
  const longMemo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: longContent
  });
  assert(longMemo && longMemo.content.length === 1000, 'Can create memo with long content');
}

async function testCompleteFlow() {
  console.log(`\n${YELLOW}[Test 6]${RESET} Complete /remember → /export → /forget flow`);

  // Step 1: Remember (create multiple memos)
  const memo1 = await mem.addMemo({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2,
    content: 'Flow test note 1'
  });

  const memo2 = await mem.addMemo({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2,
    content: 'Flow test note 2'
  });

  const memo3 = await mem.addMemo({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2,
    content: 'Flow test note 3'
  });

  // Step 2: Export (list all memos)
  const exported = await mem.listMemos({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2,
    limit: 25
  });

  assert(exported.length >= 3, 'Export returns all created memos');
  assert(exported.find(m => m._id === memo1._id), 'Export includes memo 1');
  assert(exported.find(m => m._id === memo2._id), 'Export includes memo 2');
  assert(exported.find(m => m._id === memo3._id), 'Export includes memo 3');

  // Step 3: Forget (delete specific memos)
  const deleted1 = await mem.deleteMemo({ id: memo1._id, userId: TEST_USER_2 });
  const deleted2 = await mem.deleteMemo({ id: memo3._id, userId: TEST_USER_2 });

  assert(deleted1 === true, 'Successfully deleted memo 1');
  assert(deleted2 === true, 'Successfully deleted memo 3');

  // Step 4: Verify final state
  const finalList = await mem.listMemos({
    userId: TEST_USER_2,
    guildId: TEST_GUILD_2
  });

  assert(!finalList.find(m => m._id === memo1._id), 'Memo 1 is gone');
  assert(finalList.find(m => m._id === memo2._id), 'Memo 2 still exists');
  assert(!finalList.find(m => m._id === memo3._id), 'Memo 3 is gone');
}

async function testAtomicWrites() {
  console.log(`\n${YELLOW}[Test 7]${RESET} Atomic write validation`);

  // Verify temp file is cleaned up after successful write
  const memo = await mem.addMemo({
    userId: TEST_USER_1,
    guildId: TEST_GUILD_1,
    content: 'Atomic write test'
  });

  const dataFile = path.join(process.cwd(), 'data_store.json');
  const tempFile = dataFile + '.tmp';

  assert(!fs.existsSync(tempFile), 'Temp file is cleaned up after write');
  assert(fs.existsSync(dataFile), 'Main data file exists');

  // Verify file is valid JSON
  let validJson = false;
  try {
    const content = fs.readFileSync(dataFile, 'utf8');
    JSON.parse(content);
    validJson = true;
  } catch (e) {
    validJson = false;
  }

  assert(validJson, 'Data file contains valid JSON');
}

async function runTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${YELLOW}MEMORY FLOW TEST SUITE${RESET}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Clean up before tests
    await cleanup();

    // Run all test suites
    await testBasicAddAndList();
    await testGuildVsDMSeparation();
    await testDeleteOperation();
    await testUserIsolation();
    await testEdgeCases();
    await testCompleteFlow();
    await testAtomicWrites();

    // Clean up after tests
    await cleanup();

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${YELLOW}TEST SUMMARY${RESET}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`${GREEN}Passed:${RESET} ${passCount}`);
    console.log(`${RED}Failed:${RESET} ${failCount}`);
    console.log(`${YELLOW}Total:${RESET}  ${passCount + failCount}`);

    if (failCount === 0) {
      console.log(`\n${GREEN}✓ All tests passed!${RESET}\n`);
      process.exit(0);
    } else {
      console.log(`\n${RED}✗ Some tests failed!${RESET}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n${RED}✗ Test suite crashed:${RESET}`, error);
    process.exit(1);
  }
}

// Expose load and save for cleanup
if (!mem.load) {
  const memPath = require.resolve('./lib/memory');
  const memModule = require(memPath);
  // Re-export for testing
  mem.load = memModule.load || function() {
    const fs = require('fs');
    const path = require('path');
    const FILE = path.join(process.cwd(), 'data_store.json');
    try {
      const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      db.prefs ||= [];
      db.memos ||= [];
      db.channelModes ||= [];
      return db;
    } catch {
      return { prefs: [], memos: [], channelModes: [] };
    }
  };
  mem.save = memModule.save || function(db) {
    const fs = require('fs');
    const path = require('path');
    const FILE = path.join(process.cwd(), 'data_store.json');
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  };
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
