#!/usr/bin/env node
// scripts/migrate-to-database.js - Migrate data from file storage to database
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../lib/database');

const DATA_FILE = path.join(process.cwd(), 'data_store.json');
const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * Create backup of data_store.json
 */
function createBackup() {
  if (!fs.existsSync(DATA_FILE)) {
    console.log('❌ data_store.json not found. Nothing to migrate.');
    return null;
  }

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `data_store.${timestamp}.json`);

  fs.copyFileSync(DATA_FILE, backupPath);
  console.log(`✅ Backup created: ${backupPath}`);

  return backupPath;
}

/**
 * Load data from data_store.json
 */
function loadDataStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);

    return {
      prefs: data.prefs || [],
      memos: data.memos || [],
      channelModes: data.channelModes || []
    };
  } catch (err) {
    console.error('❌ Error loading data_store.json:', err.message);
    throw err;
  }
}

/**
 * Migrate consent preferences
 */
async function migrateConsent(prefs) {
  console.log('\n📋 Migrating consent preferences...');

  let migrated = 0;
  let skipped = 0;

  for (const pref of prefs) {
    if (pref.key !== 'consent') continue;

    try {
      const enabled = pref.value === '1';
      await db.setUserConsent(pref.userId, enabled);
      migrated++;
    } catch (err) {
      console.error(`  ❌ Failed to migrate consent for user ${pref.userId}:`, err.message);
      skipped++;
    }
  }

  console.log(`  ✅ Migrated: ${migrated}`);
  console.log(`  ⚠️  Skipped: ${skipped}`);

  return { migrated, skipped };
}

/**
 * Migrate memories
 */
async function migrateMemories(memos) {
  console.log('\n📝 Migrating memories...');

  let migrated = 0;
  let skipped = 0;

  for (const memo of memos) {
    try {
      await db.saveMemory(
        memo.userId,
        memo.guildId || null,
        memo.content,
        memo.tags || [],
        {
          channelId: memo.channelId || null,
          channelName: memo.channelName || null,
          timestamp: memo.createdAt || Date.now()
        }
      );
      migrated++;
    } catch (err) {
      console.error(`  ❌ Failed to migrate memory ${memo._id}:`, err.message);
      skipped++;
    }
  }

  console.log(`  ✅ Migrated: ${migrated}`);
  console.log(`  ⚠️  Skipped: ${skipped}`);

  return { migrated, skipped };
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting migration from data_store.json to database...\n');

  // Check database configuration
  if (!db.isConfigured()) {
    console.error('❌ Database not configured! Please set the following environment variables:');
    console.error('   - DB_HOST');
    console.error('   - DB_USER');
    console.error('   - DB_PASSWORD');
    console.error('   - DB_NAME');
    process.exit(1);
  }

  // Test database connection
  console.log('🔗 Testing database connection...');
  try {
    await db.testConnection();
    console.log('✅ Database connection successful\n');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }

  // Create database tables
  console.log('📊 Creating database tables...');
  try {
    await db.createTables();
    console.log('✅ Database tables created\n');
  } catch (err) {
    console.error('❌ Failed to create tables:', err.message);
    process.exit(1);
  }

  // Create backup
  const backupPath = createBackup();
  if (!backupPath) {
    console.log('\nℹ️  No data to migrate. You can start using the database directly.');
    process.exit(0);
  }

  // Load data
  console.log('\n📂 Loading data from data_store.json...');
  const data = loadDataStore();

  console.log(`  Found:`);
  console.log(`  - ${data.prefs.filter(p => p.key === 'consent').length} consent preferences`);
  console.log(`  - ${data.memos.length} memories`);
  console.log(`  - ${data.channelModes.length} channel modes (not migrated)`);

  // Migrate consent
  const consentStats = await migrateConsent(data.prefs);

  // Migrate memories
  const memoryStats = await migrateMemories(data.memos);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Consent preferences migrated: ${consentStats.migrated}`);
  console.log(`✅ Memories migrated: ${memoryStats.migrated}`);
  console.log(`⚠️  Items skipped: ${consentStats.skipped + memoryStats.skipped}`);
  console.log(`💾 Backup saved to: ${backupPath}`);
  console.log('='.repeat(60));

  console.log('\n✅ Migration complete!');
  console.log('\nℹ️  Note: Channel modes are NOT migrated as they are being replaced');
  console.log('   with a new system in v2.0. You can delete data_store.json once');
  console.log('   you\'ve verified the migration was successful.');

  console.log('\n📝 Next steps:');
  console.log('   1. Test the bot with the database');
  console.log('   2. Verify all data was migrated correctly');
  console.log('   3. Delete or archive data_store.json');
  console.log('   4. Run: npm run deploy (to deploy new commands)');
  console.log('   5. Restart the bot');

  await db.close();
  process.exit(0);
}

// Run migration
migrate().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
