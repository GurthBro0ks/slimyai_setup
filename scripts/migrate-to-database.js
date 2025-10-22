// scripts/migrate-to-database.js
require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const db = require("../lib/database");

async function migrate() {
  console.log("🚀 Starting migration from data_store.json to database...");

  // 1. Initialize and test the database connection
  db.initialize();
  if (!db.isConfigured()) {
    console.error(
      "❌ Database is not configured. Please check your .env file.",
    );
    process.exit(1);
  }

  try {
    await db.testConnection();
    console.log("✅ Database connection successful");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  // 2. Read the old JSON data file
  const dataStorePath = path.join(__dirname, "..", "data_store.json");
  let oldData;
  try {
    const fileContent = await fs.readFile(dataStorePath, "utf8");
    oldData = JSON.parse(fileContent);
    console.log("✅ Successfully read data_store.json");
  } catch (err) {
    console.error(`❌ Could not read or parse data_store.json: ${err.message}`);
    process.exit(1);
  }

  // 3. Create a backup
  const backupsDir = path.join(__dirname, "..", "backups");
  await fs.mkdir(backupsDir, { recursive: true });
  const backupFile = `data_store.backup.${new Date().toISOString().replace(/:/g, "-")}.json`;
  await fs.copyFile(dataStorePath, path.join(backupsDir, backupFile));
  console.log(`✅ Backup created: backups/${backupFile}`);

  // Migration counters
  const summary = {
    consent: 0,
    memories: 0,
    modes: 0,
  };

  // 4. Migrate Data
  // Migrate User Consent
  if (oldData.prefs && Array.isArray(oldData.prefs)) {
    console.log("📋 Migrating consent preferences...");
    for (const pref of oldData.prefs) {
      // Assuming pref has userId, guildId, and hasConsented properties
      if (pref.userId && pref.guildId) {
        await db.setUserConsent(pref.userId, pref.guildId, !!pref.hasConsented);
        summary.consent++;
      }
    }
    console.log(`  -> Migrated ${summary.consent} consent records.`);
  }

  // Migrate Memories
  if (oldData.memos && Array.isArray(oldData.memos)) {
    console.log("📝 Migrating memories...");
    for (const memo of oldData.memos) {
      await db.saveMemory(
        memo.userId,
        memo.guildId || null,
        memo.content,
        memo.tags || [],
        memo.context || {},
      );
      summary.memories++;
    }
    console.log(`  -> Migrated ${summary.memories} memories.`);
  }

  // Migrate Channel Modes
  if (oldData.channelModes && Array.isArray(oldData.channelModes)) {
    console.log("🔧 Migrating channel modes...");
    for (const modeData of oldData.channelModes) {
      if (
        modeData.targetId &&
        modeData.guildId &&
        modeData.targetType &&
        modeData.modes
      ) {
        await db.setChannelModes(
          modeData.targetId,
          modeData.guildId,
          modeData.targetType,
          modeData.modes,
        );
        summary.modes++;
      }
    }
    console.log(`  -> Migrated ${summary.modes} channel mode settings.`);
  }

  // Final Summary
  console.log(`
📊 MIGRATION SUMMARY
✅ Consent preferences migrated: ${summary.consent}
✅ Memories migrated: ${summary.memories}
✅ Channel modes migrated: ${summary.modes}
💾 Backup saved to: backups/${backupFile}

✅ Migration complete!
    `);
}

migrate()
  .then(() => {
    console.log("Script finished successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ MIGRATION FAILED:", err);
    process.exit(1);
  });
