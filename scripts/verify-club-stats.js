#!/usr/bin/env node

/**
 * Verify club_latest aggregates for a guild.
 *
 * Usage:
 * node scripts/verify-club-stats.js --guild <GUILD_ID>
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const database = require("../lib/database");
const { getWarnThresholds, formatCompact, formatNumber } = require("../lib/thresholds");
const { getWeekId } = require("../lib/week-anchor");

const OUTPUT_DIR = path.join(process.cwd(), "out");

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

function parseNumber(value) {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}


async function main() {
  const args = parseArgs(process.argv.slice(2));
  const guildId = args.guild;
  const strict = args.strict === true;
  const warnLowOverride = parseNumber(args["warn-low"]);
  const warnHighOverride = parseNumber(args["warn-high"]);

  if (!guildId) {
    console.error("[verify] Missing required --guild <GUILD_ID>");
    process.exit(1);
  }

  if (!database.isConfigured()) {
    console.error(
      "[verify] Database is not configured. Set DB_* environment variables first.",
    );
    process.exit(1);
  }

  await database.initialize();

  // Get thresholds
  const thresholds = await getWarnThresholds(guildId);
  const warnLow = warnLowOverride !== null ? warnLowOverride : thresholds.low;
  const warnHigh = warnHighOverride !== null ? warnHighOverride : thresholds.high;

  // Fetch data (MySQL doesn't support NULLS LAST, use IFNULL to sort nulls to end)
  const rows = await database.query(
    `SELECT member_id, member_key, name_display, total_power, sim_power, latest_at
       FROM club_latest
      WHERE guild_id = ?
      ORDER BY IFNULL(total_power, 0) DESC`,
    [guildId],
  );

  if (!rows.length) {
    console.error(`[verify] No rows found in club_latest for guild ${guildId}.`);
    await database.close();
    process.exit(1);
  }

  // Check distinct week_ids (based on latest_at timestamps)
  const distinctWeekIds = new Set();
  for (const row of rows) {
    if (row.latest_at) {
      const weekId = getWeekId(new Date(row.latest_at));
      distinctWeekIds.add(weekId);
    }
  }

  // Check for distinct member_keys
  const distinctMemberKeys = new Set(
    rows.map((row) => row.member_key).filter(Boolean)
  );

  // Compute aggregates
  let totalPowerSum = 0;
  let simPowerSum = 0;
  let membersWithTotals = 0;
  let membersWithSim = 0;

  for (const row of rows) {
    if (row.total_power !== null && typeof row.total_power !== "undefined") {
      totalPowerSum += Number(row.total_power);
      membersWithTotals += 1;
    }
    if (row.sim_power !== null && typeof row.sim_power !== "undefined") {
      simPowerSum += Number(row.sim_power);
      membersWithSim += 1;
    }
  }

  const memberCount = rows.length;
  const averagePower =
    membersWithTotals > 0 ? totalPowerSum / membersWithTotals : 0;

  // Build output
  const lines = [];
  lines.push(`Guild: ${guildId}`);
  lines.push(`Week IDs: ${Array.from(distinctWeekIds).join(", ")} (count: ${distinctWeekIds.size})`);
  lines.push(`Members (total rows): ${memberCount}`);
  lines.push(`Distinct member_keys: ${distinctMemberKeys.size}`);
  lines.push(`Sum(total_power): ${formatNumber(totalPowerSum)} (${formatCompact(totalPowerSum)})`);
  lines.push(`Sum(sim_power): ${formatNumber(simPowerSum)} (${formatCompact(simPowerSum)})`);
  lines.push(`Average(total_power): ${formatNumber(averagePower)} (${formatCompact(averagePower)})`);
  lines.push(`Members with total_power: ${membersWithTotals}`);
  lines.push(`Members with sim_power: ${membersWithSim}`);
  lines.push(`Members with null sim_power: ${memberCount - membersWithSim}`);
  lines.push(`Range: ≥${formatCompact(warnLow)} and ≤${formatCompact(warnHigh)}`);

  // Top 5 members
  const top5 = rows.slice(0, 5);
  if (top5.length > 0) {
    lines.push("\nTop 5 Members:");
    top5.forEach((row, index) => {
      const total = row.total_power !== null ? formatCompact(row.total_power) : "—";
      const sim = row.sim_power !== null ? formatCompact(row.sim_power) : "—";
      lines.push(`  ${index + 1}. ${row.name_display}: Total ${total}, Sim ${sim}`);
    });
  }

  // Warnings
  const warnings = [];
  if (distinctWeekIds.size > 1) {
    warnings.push(
      `Multiple week IDs detected (${distinctWeekIds.size}): ${Array.from(distinctWeekIds).join(", ")}`
    );
  }
  if (totalPowerSum < warnLow || totalPowerSum > warnHigh) {
    warnings.push(
      `Total power ${formatCompact(totalPowerSum)} outside expected range (${formatCompact(warnLow)}–${formatCompact(warnHigh)})`,
    );
  }
  if (simPowerSum > 0 && totalPowerSum < simPowerSum) {
    warnings.push(
      `Total power ${formatCompact(totalPowerSum)} < sim power ${formatCompact(simPowerSum)}`,
    );
  }

  if (warnings.length) {
    lines.push("\nWarnings:");
    warnings.forEach((warning) => lines.push(`  ⚠️  ${warning}`));
  } else {
    lines.push("\n✅ Status: OK");
  }

  // Output
  const outputText = `${lines.join("\n")}\n`;
  console.log(outputText.trim());

  // Write to file
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0]
    .slice(0, 15);
  const outPath = path.join(OUTPUT_DIR, `verify-${stamp}.txt`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, outputText);
  console.log(`\n[verify] Report written to ${outPath}`);

  await database.close();

  // Exit code: only fail if strict mode AND warnings
  if (strict && warnings.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[verify] Unexpected failure:", err);
  process.exit(1);
});
