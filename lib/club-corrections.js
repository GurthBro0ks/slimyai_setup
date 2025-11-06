/**
 * Club analytics corrections - admin overrides for bad OCR
 */

const database = require("./database");
const logger = require("./logger");
const { canonicalize } = require("./club-store");
const { parsePower } = require("./numparse");
const { getWeekId } = require("./week-anchor");

function ensureDatabaseConfigured() {
  if (!database.isConfigured()) {
    throw new Error("Club corrections require a configured database");
  }
}

/**
 * Add or update a correction
 *
 * @param {Object} opts - Correction options
 * @param {string} opts.guildId - Guild ID
 * @param {string} opts.weekId - Week ID (e.g., "2025-W43")
 * @param {string} opts.memberKey - Normalized member key
 * @param {string} opts.displayName - Display name for reference
 * @param {'total'|'sim'} opts.metric - Metric type
 * @param {number|string} opts.value - Power value (accepts K/M/B notation)
 * @param {string} [opts.reason] - Reason for correction
 * @param {'sheet'|'command'|'rescan'} [opts.source] - Source of correction
 * @param {string} [opts.createdBy] - User ID or identifier
 * @returns {Promise<{id: number, replaced: boolean}>} Correction ID and whether it replaced existing
 */
async function addCorrection(opts) {
  ensureDatabaseConfigured();

  const {
    guildId,
    weekId,
    memberKey,
    displayName,
    metric,
    value,
    reason = null,
    source = 'command',
    createdBy = null,
  } = opts;

  if (!guildId || !weekId || !memberKey || !displayName || !metric) {
    throw new Error("Missing required fields for correction");
  }

  if (metric !== 'total' && metric !== 'sim') {
    throw new Error(`Invalid metric: ${metric}. Must be 'total' or 'sim'`);
  }

  // Parse the value using our robust parser
  const parseResult = parsePower(value);
  if (parseResult.value === null) {
    throw new Error(
      `Invalid power value: ${value}${parseResult.reason ? ` (${parseResult.reason})` : ''}`
    );
  }

  const numericValue = parseResult.value;

  // Check if a correction already exists
  const [existing] = await database.query(
    `SELECT id FROM club_corrections
     WHERE guild_id = ? AND week_id = ? AND member_key = ? AND metric = ?`,
    [guildId, weekId, memberKey, metric]
  );

  if (existing) {
    // Update existing
    await database.query(
      `UPDATE club_corrections
       SET value = ?, reason = ?, source = ?, created_by = ?, created_at = NOW(), display_name = ?
       WHERE id = ?`,
      [numericValue, reason, source, createdBy, displayName, existing.id]
    );

    logger.info("[club-corrections] Updated correction", {
      id: existing.id,
      guildId,
      weekId,
      memberKey,
      metric,
      value: numericValue,
    });

    return { id: existing.id, replaced: true };
  }

  // Insert new
  const result = await database.query(
    `INSERT INTO club_corrections
       (guild_id, week_id, member_key, display_name, metric, value, reason, source, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, weekId, memberKey, displayName, metric, numericValue, reason, source, createdBy]
  );

  logger.info("[club-corrections] Added correction", {
    id: result.insertId,
    guildId,
    weekId,
    memberKey,
    metric,
    value: numericValue,
  });

  return { id: result.insertId, replaced: false };
}

/**
 * Remove a correction
 *
 * @param {string} guildId - Guild ID
 * @param {string} weekId - Week ID
 * @param {string} memberKey - Member key
 * @param {'total'|'sim'} metric - Metric type
 * @returns {Promise<boolean>} True if deleted
 */
async function removeCorrection(guildId, weekId, memberKey, metric) {
  ensureDatabaseConfigured();

  const result = await database.query(
    `DELETE FROM club_corrections
     WHERE guild_id = ? AND week_id = ? AND member_key = ? AND metric = ?`,
    [guildId, weekId, memberKey, metric]
  );

  const deleted = result.affectedRows > 0;

  if (deleted) {
    logger.info("[club-corrections] Removed correction", {
      guildId,
      weekId,
      memberKey,
      metric,
    });
  }

  return deleted;
}

/**
 * List corrections for a guild and week
 *
 * @param {string} guildId - Guild ID
 * @param {string} [weekId] - Week ID (defaults to current week)
 * @returns {Promise<Array>} List of corrections
 */
async function listCorrections(guildId, weekId = null) {
  ensureDatabaseConfigured();

  const targetWeekId = weekId || getWeekId();

  const corrections = await database.query(
    `SELECT id, guild_id, week_id, member_key, display_name, metric, value, reason, source, created_by, created_at
     FROM club_corrections
     WHERE guild_id = ? AND week_id = ?
     ORDER BY metric, display_name`,
    [guildId, targetWeekId]
  );

  return corrections;
}

/**
 * Get corrections for a specific member
 *
 * @param {string} guildId - Guild ID
 * @param {string} weekId - Week ID
 * @param {string} memberKey - Member key
 * @returns {Promise<{total?: Object, sim?: Object}>} Corrections by metric
 */
async function getCorrectionsForMember(guildId, weekId, memberKey) {
  ensureDatabaseConfigured();

  const corrections = await database.query(
    `SELECT metric, value, reason, source, created_by, created_at
     FROM club_corrections
     WHERE guild_id = ? AND week_id = ? AND member_key = ?`,
    [guildId, weekId, memberKey]
  );

  const result = {};
  for (const corr of corrections) {
    result[corr.metric] = {
      value: Number(corr.value),
      reason: corr.reason,
      source: corr.source,
      createdBy: corr.created_by,
      createdAt: corr.created_at,
    };
  }

  return result;
}

/**
 * Get all corrections for a week (keyed by member_key)
 *
 * @param {string} guildId - Guild ID
 * @param {string} weekId - Week ID
 * @returns {Promise<Map<string, {total?: Object, sim?: Object}>>} Map of member_key to corrections
 */
async function getCorrectionsMap(guildId, weekId) {
  ensureDatabaseConfigured();

  const corrections = await database.query(
    `SELECT member_key, metric, value, reason, source, created_by, created_at, display_name
     FROM club_corrections
     WHERE guild_id = ? AND week_id = ?`,
    [guildId, weekId]
  );

  const map = new Map();
  for (const corr of corrections) {
    if (!map.has(corr.member_key)) {
      map.set(corr.member_key, {});
    }

    map.get(corr.member_key)[corr.metric] = {
      value: Number(corr.value),
      reason: corr.reason,
      source: corr.source,
      createdBy: corr.created_by,
      createdAt: corr.created_at,
      displayName: corr.display_name,
    };
  }

  return map;
}

/**
 * Ingest corrections from Google Sheet
 *
 * @param {string} guildId - Guild ID
 * @param {Array<Array<string>>} rows - Rows from sheet (excluding header)
 * @returns {Promise<{added: number, updated: number, skipped: number, errors: Array}>} Summary
 */
async function ingestFromSheet(guildId, rows) {
  ensureDatabaseConfigured();

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Account for header + 0-index

    // Skip empty rows or inactive status
    if (!row || row.length === 0 || !row[0]) {
      skipped++;
      continue;
    }

    const [weekIdRaw, displayName, metricRaw, valueRaw, reason, updatedBy, status] = row;

    // Skip if status is not "Active" (case-insensitive)
    if (status && status.trim().toLowerCase() !== 'active') {
      skipped++;
      continue;
    }

    // Parse fields
    const weekId = weekIdRaw?.trim() || getWeekId();
    const metric = metricRaw?.trim().toLowerCase();

    if (!displayName || !displayName.trim()) {
      errors.push(`Row ${rowNum}: Missing member name`);
      skipped++;
      continue;
    }

    if (metric !== 'total' && metric !== 'sim') {
      errors.push(`Row ${rowNum}: Invalid metric "${metricRaw}" (must be total or sim)`);
      skipped++;
      continue;
    }

    if (!valueRaw || !valueRaw.toString().trim()) {
      errors.push(`Row ${rowNum}: Missing value`);
      skipped++;
      continue;
    }

    // Parse value
    const parseResult = parsePower(valueRaw);
    if (parseResult.value === null) {
      errors.push(
        `Row ${rowNum}: Invalid value "${valueRaw}"${parseResult.reason ? ` (${parseResult.reason})` : ''}`
      );
      skipped++;
      continue;
    }

    // Normalize member name
    const memberKey = canonicalize(displayName.trim());
    if (!memberKey) {
      errors.push(`Row ${rowNum}: Could not normalize member name "${displayName}"`);
      skipped++;
      continue;
    }

    try {
      const result = await addCorrection({
        guildId,
        weekId,
        memberKey,
        displayName: displayName.trim(),
        metric,
        value: parseResult.value,
        reason: reason?.trim() || null,
        source: 'sheet',
        createdBy: updatedBy?.trim() || 'sheet:unknown',
      });

      if (result.replaced) {
        updated++;
      } else {
        added++;
      }
    } catch (err) {
      errors.push(`Row ${rowNum}: ${err.message}`);
      skipped++;
    }
  }

  logger.info("[club-corrections] Sheet ingestion complete", {
    guildId,
    added,
    updated,
    skipped,
    errorCount: errors.length,
  });

  return { added, updated, skipped, errors };
}

module.exports = {
  addCorrection,
  removeCorrection,
  listCorrections,
  getCorrectionsForMember,
  getCorrectionsMap,
  ingestFromSheet,
};
