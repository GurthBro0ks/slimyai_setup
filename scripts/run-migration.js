#!/usr/bin/env node

/**
 * Run a SQL migration file
 *
 * Usage:
 * node scripts/run-migration.js <migration-file.sql>
 */

const fs = require("fs");
const path = require("path");
const database = require("../lib/database");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

async function runMigration(filePath) {
  if (!database.isConfigured()) {
    console.error("[migration] Database is not configured");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`[migration] File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`[migration] Reading: ${resolvedPath}`);
  const sql = fs.readFileSync(resolvedPath, "utf8");

  // Remove comments and split by semicolons
  const cleanedSql = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = cleanedSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!statements.length) {
    console.log("[migration] No statements to execute");
    return;
  }

  await database.initialize();

  console.log(`[migration] Executing ${statements.length} statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`\n[migration] Statement ${i + 1}/${statements.length}:`);
    console.log(stmt.substring(0, 100) + (stmt.length > 100 ? "..." : ""));

    try {
      await database.query(stmt);
      console.log(`✓ Success`);
    } catch (err) {
      console.error(`✗ Failed: ${err.message}`);

      // Continue on "duplicate column" or "duplicate key" errors
      if (
        err.message.includes("Duplicate column") ||
        err.message.includes("Duplicate key") ||
        err.message.includes("already exists")
      ) {
        console.log("  (Continuing - column/key already exists)");
        continue;
      }

      // Exit on other errors
      console.error("\n[migration] Migration failed. Stopping.");
      process.exit(1);
    }
  }

  console.log("\n[migration] ✅ Migration completed successfully");
  await database.close();
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-migration.js <migration-file.sql>");
  process.exit(1);
}

runMigration(args[0]).catch((err) => {
  console.error("[migration] Unexpected error:", err);
  process.exit(1);
});
