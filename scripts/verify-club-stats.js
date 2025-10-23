#!/usr/bin/env node

/**
 * Verify club_latest aggregates for each guild.
 *
 * Prints a summary of members, total power, and sim power,
 * and warns if totals look suspicious. Persists the previous
 * run in var/verify-club-stats.json for ±30% regression checks.
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const database = require("../lib/database");

const OUTPUT_DIR = path.join(__dirname, "..", "var");
const SNAPSHOT_PATH = path.join(OUTPUT_DIR, "verify-club-stats.json");
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function formatNumber(value) {
  if (value == null) return "0";
  return NUMBER_FORMAT.format(Math.round(value));
}

async function loadPreviousSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return {};
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[verify-club-stats] Failed to read previous snapshot: ${err.message}`,
    );
    return {};
  }
}

async function saveSnapshot(snapshot) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`[verify-club-stats] Wrote snapshot → ${SNAPSHOT_PATH}`);
}

async function main() {
  if (!database.isConfigured()) {
    console.error(
      "[verify-club-stats] Database is not configured. Set DB_* env vars first.",
    );
    process.exit(1);
  }

  await database.initialize();

  const rows = await database.query(
    `SELECT guild_id,
            COUNT(*) AS members,
            SUM(COALESCE(total_power, 0)) AS total_power,
            SUM(COALESCE(sim_power, 0)) AS sim_power
       FROM club_latest
   GROUP BY guild_id
   ORDER BY guild_id`,
  );

  if (!rows.length) {
    console.log("[verify-club-stats] No data available in club_latest.");
    await database.close();
    process.exit(0);
  }

  const previous = await loadPreviousSnapshot();
  const snapshot = {
    generatedAt: new Date().toISOString(),
    guilds: {},
  };

  console.log("=== Club Stats Verification ===");
  for (const row of rows) {
    const guildId = row.guild_id;
    const members = Number(row.members || 0);
    const totalPower = Number(row.total_power || 0);
    const simPower = Number(row.sim_power || 0);

    const warnings = [];

    if (totalPower < simPower) {
      warnings.push(
        "total_power < sim_power (did we ingest totals before sim?)",
      );
    }

    const previousEntry = previous?.guilds?.[guildId];
    if (previousEntry?.totalPower) {
      const delta =
        (totalPower - previousEntry.totalPower) / previousEntry.totalPower;
      if (Math.abs(delta) > 0.3) {
        const pct = (delta * 100).toFixed(1);
        warnings.push(`total_power changed ${pct}% vs previous snapshot`);
      }
    }

    const lineParts = [
      `Guild ${guildId}`,
      `members=${members}`,
      `total=${formatNumber(totalPower)}`,
      `sim=${formatNumber(simPower)}`,
    ];
    if (warnings.length) {
      lineParts.push(`WARN → ${warnings.join("; ")}`);
    } else {
      lineParts.push("OK");
    }
    console.log(lineParts.join(" | "));

    snapshot.guilds[guildId] = {
      members,
      totalPower,
      simPower,
      recordedAt: snapshot.generatedAt,
    };
  }

  await saveSnapshot(snapshot);
  await database.close();
}

main().catch((err) => {
  console.error("[verify-club-stats] Unexpected failure:", err);
  process.exit(1);
});
