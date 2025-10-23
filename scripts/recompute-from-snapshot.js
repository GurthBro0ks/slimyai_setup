#!/usr/bin/env node

/**
 * Recompute club_latest from existing snapshot (no OCR re-run)
 *
 * Usage:
 * node scripts/recompute-from-snapshot.js \
 *   --guild <GUILD_ID> [--snapshot <ID> | --latest] \
 *   [--week <YYYY-Www>] [--rebuild-wow] [--push-sheet] [--force] [--dry] \
 *   [--cap-hint <N>] [--json out/recompute-YYYYMMDD.json]
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const database = require("../lib/database");
const { recomputeLatest } = require("../lib/recompute-latest");
const { pushLatest } = require("../lib/club-sheets");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y"].includes(normalized);
  }
  return Boolean(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const guildId = args.guild;
  const snapshotId = args.snapshot ? Number(args.snapshot) : null;
  const useLatest = toBoolean(args.latest);
  const weekId = args.week || null;
  const rebuildWow = toBoolean(args["rebuild-wow"]);
  const pushSheet = toBoolean(args["push-sheet"]);
  const force = toBoolean(args.force);
  const dryRun = toBoolean(args.dry);
  const capHint = args["cap-hint"] ? Number(args["cap-hint"]) : null;
  const jsonOutPath = args.json || null;

  if (!guildId) {
    console.error("[recompute] Missing required --guild <GUILD_ID>");
    console.error("\nUsage:");
    console.error(
      "  node scripts/recompute-from-snapshot.js --guild <GUILD_ID> [--snapshot <ID> | --latest]"
    );
    console.error("    [--week <YYYY-Www>] [--rebuild-wow] [--push-sheet] [--force] [--dry]");
    console.error("    [--cap-hint <N>] [--json <path>]");
    process.exit(1);
  }

  if (!database.isConfigured()) {
    console.error("[recompute] Database is not configured. Set DB_* environment variables.");
    process.exit(1);
  }

  await database.initialize();

  console.log("=== Recompute club_latest ===");
  console.log(`Guild: ${guildId}`);
  console.log(`Snapshot: ${snapshotId || (useLatest ? "latest" : "auto-detect")}`);
  console.log(`Week: ${weekId || "current"}`);
  console.log(`Rebuild WoW: ${rebuildWow ? "yes" : "no (WoW already in recompute)"}`);
  console.log(`Push Sheet: ${pushSheet ? "yes" : "no"}`);
  console.log(`Force: ${force ? "yes" : "no"}`);
  console.log(`Cap Hint: ${capHint !== null ? capHint : "none"}`);
  console.log(`Dry Run: ${dryRun ? "yes" : "no"}\n`);

  if (dryRun) {
    console.log("[recompute] DRY RUN: No changes will be made.\n");
  }

  const recomputeOpts = {
    guildId,
    force,
    capHint,
    logger: (msg) => console.log(msg),
  };

  if (snapshotId) {
    recomputeOpts.snapshotId = snapshotId;
  }

  if (weekId) {
    recomputeOpts.weekId = weekId;
  }

  let result = null;

  if (dryRun) {
    // In dry run, just fetch and display snapshot info without writing
    try {
      // Simulate the resolution without writing
      console.log("[recompute] Simulating snapshot resolution...");

      const targetSnapshotId = snapshotId || null;
      let snapshot = null;

      if (targetSnapshotId) {
        [snapshot] = await database.query(
          `SELECT id, guild_id, snapshot_at, notes
           FROM club_snapshots
           WHERE id = ?`,
          [targetSnapshotId]
        );
      } else {
        [snapshot] = await database.query(
          `SELECT id, guild_id, snapshot_at, notes
           FROM club_snapshots
           WHERE guild_id = ?
           ORDER BY snapshot_at DESC, id DESC
           LIMIT 1`,
          [guildId]
        );
      }

      if (!snapshot) {
        throw new Error(`No snapshot found`);
      }

      const metrics = await database.query(
        `SELECT m.member_key,
                MAX(CASE WHEN m.metric = 'sim' THEN m.value END) AS sim_power,
                MAX(CASE WHEN m.metric = 'total' THEN m.value END) AS total_power
         FROM club_metrics m
         WHERE m.snapshot_id = ?
         GROUP BY m.member_key`,
        [snapshot.id]
      );

      const members = metrics.length;
      let sumTotal = 0;
      let sumSim = 0;

      for (const m of metrics) {
        if (m.total_power) sumTotal += Number(m.total_power);
        if (m.sim_power) sumSim += Number(m.sim_power);
      }

      console.log(`\n[recompute] Dry Run Summary:`);
      console.log(`  Snapshot ID: ${snapshot.id}`);
      console.log(`  Snapshot At: ${new Date(snapshot.snapshot_at).toISOString()}`);
      console.log(`  Members: ${members}`);
      console.log(`  Sum Total: ${sumTotal.toLocaleString()}`);
      console.log(`  Sum SIM: ${sumSim.toLocaleString()}`);

      if (capHint !== null && members > capHint + 1 && !force) {
        console.error(
          `\n[recompute] ⚠️ Member-cap guard: ${members} > ${capHint} + 1. Use --force to override.`
        );
        process.exit(1);
      }

      result = {
        guildId,
        weekId: weekId || "current",
        snapshotId: snapshot.id,
        members,
        sumTotal,
        sumSim,
        replacedRows: 0,
        warnings: [],
        dryRun: true,
      };
    } catch (err) {
      console.error(`[recompute] Dry run failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Actual recompute
    try {
      result = await recomputeLatest(recomputeOpts);
    } catch (err) {
      console.error(`[recompute] Failed: ${err.message}`);
      await database.close();
      process.exit(1);
    }
  }

  // Display summary
  console.log("\n=== Recompute Summary ===");
  console.log(`Guild: ${result.guildId}`);
  console.log(`Week ID: ${result.weekId}`);
  console.log(`Snapshot ID: ${result.snapshotId}`);
  console.log(`Members: ${result.members}`);
  console.log(`Sum Total Power: ${result.sumTotal.toLocaleString()}`);
  console.log(`Sum SIM Power: ${result.sumSim.toLocaleString()}`);

  if (!dryRun) {
    console.log(`Replaced Rows: ${result.replacedRows}`);
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
  }

  // Push to sheet if requested and not dry run
  if (pushSheet && !dryRun) {
    console.log("\n[recompute] Pushing to sheet...");
    try {
      const sheetResult = await pushLatest(guildId);
      console.log(
        `[recompute] ✅ Sheet updated: ${sheetResult.rowCount} rows → ${sheetResult.sheetUrl}`
      );
    } catch (err) {
      console.error(`[recompute] ❌ Sheet push failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Write JSON output if requested
  if (jsonOutPath) {
    const resolved = path.resolve(jsonOutPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(result, null, 2));
    console.log(`\n[recompute] JSON written to ${resolved}`);
  }

  await database.close();

  console.log("\n✅ Recompute completed successfully");
  process.exit(0);
}

main().catch((err) => {
  console.error("[recompute] Unexpected failure:", err);
  process.exit(1);
});
