#!/usr/bin/env node

/**
 * Headless ingest pipeline mirroring /club analyze.
 *
 * Usage:
 * node scripts/ingest-club-screenshots.js \
 *   --guild <GUILD_ID> \
 *   --dir "/opt/slimy/app/screenshots/test" \
 *   --type both \
 *   --commit \
 *   [--dry] [--limit 10] [--log out/ingest-run-YYYYMMDD.md] \
 *   [--apply-corrections] [--cap-hint <N>] [--force-commit]
 *
 * Flags:
 *   --apply-corrections: Sync corrections from Google Sheet before ingesting
 */

const fs = require("fs");
const path = require("path");
const logger = require("../lib/logger");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const database = require("../lib/database");
const guildSettings = require("../lib/guild-settings");
const {
  canonicalize,
  upsertMembers,
  createSnapshot,
  insertMetrics,
  recomputeLatestForGuild,
  getAggregates,
} = require("../lib/club-store");
const { pushLatest, syncCorrectionsFromSheet } = require("../lib/club-sheets");
const {
  parseManageMembersImage,
  parseManageMembersImageEnsemble,
} = require("../lib/club-vision");

const DEFAULT_LIMIT = 10;
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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

function ensure(value, message) {
  if (!value) {
    console.error(`[ingest] ${message}`);
    process.exit(1);
  }
  return value;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y"].includes(normalized);
  }
  return Boolean(value);
}

function toDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  const buffer = fs.readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function parseImage(filePath, forcedMetric, useEnsemble) {
  const dataUrl = toDataUrl(filePath);
  if (useEnsemble) {
    return parseManageMembersImageEnsemble(dataUrl, forcedMetric);
  }
  return parseManageMembersImage(dataUrl, forcedMetric);
}

function mergeRows(targetMap, metric, rows, sourceLabel) {
  for (const row of rows) {
    const display = String(row?.display || row?.name || "").trim();
    const canonical = row?.canonical || canonicalize(display);
    const value =
      row?.value !== null && typeof row?.value !== "undefined"
        ? Number(row.value)
        : null;
    const confidence =
      typeof row?.confidence === "number"
        ? Math.max(0, Math.min(1, row.confidence))
        : 0;

    if (!canonical || value === null || !Number.isFinite(value)) continue;

    const existing = targetMap.get(canonical);
    if (!existing) {
      targetMap.set(canonical, {
        display: display || canonical,
        metrics: {
          [metric]: {
            value,
            confidence,
            sources: new Set([sourceLabel]),
          },
        },
      });
      continue;
    }

    if (!existing.metrics[metric]) {
      existing.metrics[metric] = {
        value,
        confidence,
        sources: new Set([sourceLabel]),
      };
      if (
        display &&
        display.length >= (existing.display || canonical).length
      ) {
        existing.display = display;
      }
      continue;
    }

    const metricEntry = existing.metrics[metric];
    if (value > metricEntry.value) {
      metricEntry.value = value;
    }
    if (confidence > metricEntry.confidence) {
      metricEntry.confidence = confidence;
    }
    metricEntry.sources.add(sourceLabel);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const guildId = ensure(args.guild, "Missing required --guild");
  const dirPath = ensure(args.dir, "Missing required --dir");
  const runType = (args.type || "both").toLowerCase();
  const commitFlag = toBoolean(args.commit);
  const dryRun = toBoolean(args.dry);
  const limit = args.limit ? Number(args.limit) : DEFAULT_LIMIT;
  const logPath = args.log ? path.resolve(args.log) : null;
  const useEnsemble = process.env.CLUB_USE_ENSEMBLE === "1";
  const applyCorrections = toBoolean(args["apply-corrections"]);

  if (dryRun && commitFlag) {
    console.warn(
      "[ingest] --dry specified with --commit; proceeding in dry mode only.",
    );
  }

  const effectiveCommit = commitFlag && !dryRun;

  if (!database.isConfigured()) {
    console.error(
      "[ingest] Database is not configured. Ensure DB_* env vars are set.",
    );
    process.exit(1);
  }

  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    console.error(`[ingest] Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  const imageFiles = fs
    .readdirSync(resolvedDir)
    .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined)
    .map((name) => path.join(resolvedDir, name));

  if (!imageFiles.length) {
    console.error("[ingest] No image files found to ingest.");
    process.exit(1);
  }

  await database.initialize();

  // Sync corrections from Google Sheet if requested
  if (applyCorrections && !dryRun) {
    try {
      console.log("[ingest] Syncing corrections from Google Sheet...");
      const syncResult = await syncCorrectionsFromSheet(guildId);
      console.log(
        `[ingest] Corrections synced: added=${syncResult.added}, updated=${syncResult.updated}, skipped=${syncResult.skipped}`,
      );
      if (syncResult.errors.length > 0) {
        console.warn(
          `[ingest] Corrections sync had ${syncResult.errors.length} errors:`,
        );
        for (const error of syncResult.errors.slice(0, 5)) {
          console.warn(`  - ${error}`);
        }
        if (syncResult.errors.length > 5) {
          console.warn(
            `  ... and ${syncResult.errors.length - 5} more errors`,
          );
        }
      }
    } catch (err) {
      console.error(
        `[ingest] Failed to sync corrections: ${err.message}. Continuing with ingest...`,
      );
    }
  } else if (applyCorrections && dryRun) {
    console.log("[ingest] --apply-corrections ignored in dry run mode");
  }

  const metricsMap = new Map();
  let simPages = 0;
  let totalPages = 0;

  for (const filePath of imageFiles) {
    const sourceLabel = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    const forcedMetric =
      runType === "sim"
        ? "sim"
        : runType === "total"
          ? "total"
          : null;

    try {
      const result = await parseImage(filePath, forcedMetric, useEnsemble);
      const metric = result.metric || forcedMetric || "total";
      if (metric === "sim") {
        simPages += 1;
      } else {
        totalPages += 1;
      }
      mergeRows(metricsMap, metric, result.rows || [], sourceLabel);
      logger.debug("[ingest] Parsed image", {
        filePath,
        metric,
        rows: result.rows?.length || 0,
      });
    } catch (err) {
      console.error(
        `[ingest] Failed to parse ${sourceLabel}: ${err.message}`,
      );
      process.exit(1);
    }
  }

  const uniqueMembers = metricsMap.size;

  if (uniqueMembers < 3) {
    console.error(
      `[ingest] Parsed fewer than 3 members (${uniqueMembers}). Aborting.`,
    );
    process.exit(1);
  }

  // Member-cap sanity check (placeholder for future OCR-based cap detection)
  // TODO: Extract cap from "Manage Members NN/NN" header using OCR
  const capHint = args["cap-hint"] ? Number(args["cap-hint"]) : null;
  const forceCommit = toBoolean(args["force-commit"]);

  if (capHint !== null && uniqueMembers > capHint + 1 && !forceCommit) {
    console.error(
      `\n[ingest] ❌ Member-cap guard: Parsed ${uniqueMembers} members > cap ${capHint} + 1.`,
    );
    console.error(
      `[ingest] Likely duplicates/aliases detected. Commit blocked.`,
    );
    console.error(`[ingest] Use --force-commit to override this check.\n`);

    // Show preview of parsed members
    const memberList = Array.from(metricsMap.keys())
      .sort()
      .slice(0, 100)
      .join(", ");
    console.error(`[ingest] Preview of parsed members (first 100):`);
    console.error(`[ingest] ${memberList}`);

    process.exit(1);
  }

  let totalPowerSum = 0;
  let membersWithTotals = 0;

  for (const entry of metricsMap.values()) {
    const totalMetric = entry.metrics.total;
    if (totalMetric && Number.isFinite(totalMetric.value)) {
      totalPowerSum += totalMetric.value;
      membersWithTotals += 1;
    }
  }

  const averagePower =
    membersWithTotals > 0 ? totalPowerSum / membersWithTotals : 0;

  const summaryLines = [];
  summaryLines.push("=== Headless Club Ingest ===");
  summaryLines.push(`Guild: ${guildId}`);
  summaryLines.push(`Directory: ${resolvedDir}`);
  summaryLines.push(`Images processed: ${imageFiles.length}`);
  summaryLines.push(
    `Pages (total/sim): ${totalPages}/${simPages} | Members parsed: ${uniqueMembers}`,
  );
  summaryLines.push(
    `Totals: SUM=${totalPowerSum.toLocaleString("en-US")} | AVG=${averagePower.toLocaleString("en-US")} | Members with totals=${membersWithTotals}`,
  );

  let sheetSummary = "Sheet sync skipped (dry run)";
  let sheetResult = null;

  if (effectiveCommit) {
    try {
      const memberRows = [];
      for (const [canonical, entry] of metricsMap.entries()) {
        memberRows.push({
          canonical,
          display: entry.display || canonical,
        });
      }

      const memberMap = await upsertMembers(guildId, memberRows);

      const metricsPayload = [];
      for (const [canonical, entry] of metricsMap.entries()) {
        const memberId =
          memberMap.get(canonical) ||
          (await upsertMembers(guildId, [
            { canonical, display: entry.display || canonical },
          ])).get(canonical);
        if (!memberId) continue;

        if (entry.metrics.sim?.value) {
          metricsPayload.push({
            memberId,
            memberKey: canonical,
            metric: "sim",
            value: entry.metrics.sim.value,
          });
        }
        if (entry.metrics.total?.value) {
          metricsPayload.push({
            memberId,
            memberKey: canonical,
            metric: "total",
            value: entry.metrics.total.value,
          });
        }
      }

      if (!metricsPayload.length) {
        throw new Error("No metric rows assembled after parsing.");
      }

      const notes = `headless-ingest:${resolvedDir}`;
      const { snapshotId, snapshotAt } = await createSnapshot(
        guildId,
        "headless-cli",
        notes,
      );

      await insertMetrics(snapshotId, metricsPayload);
      await recomputeLatestForGuild(guildId, snapshotAt);

      sheetResult = await pushLatest(guildId);
      sheetSummary = `Sheet ${sheetResult.spreadsheetId} (${sheetResult.sheetName}) ← ${sheetResult.rowCount} rows`;

      summaryLines.push(
        `Snapshot #${snapshotId} committed at ${snapshotAt.toISOString()}`,
      );
      summaryLines.push(sheetSummary);
    } catch (err) {
      console.error(`[ingest] Commit failed: ${err.message}`);
      process.exit(1);
    }
  }

  const aggregates = await getAggregates(guildId);
  if (!effectiveCommit) {
    summaryLines.push(sheetSummary);
  }
  summaryLines.push(
    `Post-commit aggregates → Members=${aggregates.members}, SUM=${(aggregates.totalPower || 0).toLocaleString("en-US")}, AVG=${(aggregates.averagePower || 0).toLocaleString("en-US")}`,
  );

  console.log(summaryLines.join("\n"));

  if (logPath) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `${summaryLines.join("\n")}\n`);
  }

  if (effectiveCommit && sheetResult?.ok === false) {
    process.exit(1);
  }

  await database.close().catch(() => {});
}

main().catch((err) => {
  console.error("[ingest] Unexpected failure:", err);
  process.exit(1);
});
