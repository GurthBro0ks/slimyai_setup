#!/usr/bin/env node

/**
 * Quick health check for club_latest power sums.
 * Persists last run results and warns on significant deviations.
 *
 * Usage:
 * node scripts/quick-sum.js --guild <GUILD_ID>
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const database = require("../lib/database");

const OUTPUT_DIR = path.join(process.cwd(), "out");
const HISTORY_FILE = path.join(OUTPUT_DIR, "quick-sum.json");
const DEVIATION_THRESHOLD = 0.3; // ±30%

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

function formatNumber(value, digits = 0) {
  if (value === null || typeof value === "undefined") return "0";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatCompact(value) {
  if (value === null || typeof value === "undefined") return "0";
  const num = Number(value);
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toString();
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return {};
  }
  try {
    const content = fs.readFileSync(HISTORY_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.warn(`[quick-sum] Failed to load history: ${err.message}`);
    return {};
  }
}

function saveHistory(history) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const guildId = args.guild;

  if (!guildId) {
    console.error("[quick-sum] Missing required --guild <GUILD_ID>");
    process.exit(1);
  }

  if (!database.isConfigured()) {
    console.error(
      "[quick-sum] Database is not configured. Set DB_* environment variables first.",
    );
    process.exit(1);
  }

  await database.initialize();

  const rows = await database.query(
    `SELECT total_power, sim_power
       FROM club_latest
      WHERE guild_id = ?`,
    [guildId],
  );

  if (!rows.length) {
    console.error(
      `[quick-sum] No rows found in club_latest for guild ${guildId}.`,
    );
    await database.close();
    process.exit(1);
  }

  let totalPowerSum = 0;
  let simPowerSum = 0;

  for (const row of rows) {
    if (row.total_power !== null && typeof row.total_power !== "undefined") {
      totalPowerSum += Number(row.total_power);
    }
    if (row.sim_power !== null && typeof row.sim_power !== "undefined") {
      simPowerSum += Number(row.sim_power);
    }
  }

  const history = loadHistory();
  const priorRun = history[guildId];

  const warnings = [];

  // Check if total < sim
  if (simPowerSum > 0 && totalPowerSum < simPowerSum) {
    warnings.push(
      `Total power (${formatCompact(totalPowerSum)}) < sim power (${formatCompact(simPowerSum)})`,
    );
  }

  // Check deviation from prior run
  if (priorRun) {
    const priorTotal = priorRun.totalPowerSum || 0;
    const priorSim = priorRun.simPowerSum || 0;

    if (priorTotal > 0) {
      const totalDeviation = Math.abs(totalPowerSum - priorTotal) / priorTotal;
      if (totalDeviation > DEVIATION_THRESHOLD) {
        const pct = (totalDeviation * 100).toFixed(1);
        warnings.push(
          `Total power deviated ${pct}% from prior run (was ${formatCompact(priorTotal)}, now ${formatCompact(totalPowerSum)})`,
        );
      }
    }

    if (priorSim > 0) {
      const simDeviation = Math.abs(simPowerSum - priorSim) / priorSim;
      if (simDeviation > DEVIATION_THRESHOLD) {
        const pct = (simDeviation * 100).toFixed(1);
        warnings.push(
          `Sim power deviated ${pct}% from prior run (was ${formatCompact(priorSim)}, now ${formatCompact(simPowerSum)})`,
        );
      }
    }
  }

  // Output results
  console.log(`Guild: ${guildId}`);
  console.log(`Members: ${rows.length}`);
  console.log(`Sum(total_power): ${formatNumber(totalPowerSum)}`);
  console.log(`Sum(sim_power): ${formatNumber(simPowerSum)}`);

  if (warnings.length) {
    console.log("\nWarnings:");
    warnings.forEach((warning) => console.log(`⚠️  ${warning}`));
  } else {
    console.log("\n✅ Status: OK");
  }

  // Save current run to history
  history[guildId] = {
    timestamp: new Date().toISOString(),
    totalPowerSum,
    simPowerSum,
    memberCount: rows.length,
  };
  saveHistory(history);

  console.log(`\n[quick-sum] History updated: ${HISTORY_FILE}`);

  await database.close();

  if (warnings.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[quick-sum] Unexpected failure:", err);
  process.exit(1);
});
