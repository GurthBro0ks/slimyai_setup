/**
 * Recompute club_latest from existing club_metrics snapshot (no OCR)
 */

const database = require("./database");
const logger = require("./logger");
const { getWeekId } = require("./week-anchor");
const { getCorrectionsMap } = require("./club-corrections");

/**
 * @typedef {Object} RecomputeOpts
 * @property {string} guildId - Guild ID
 * @property {number} [snapshotId] - Specific snapshot ID (else chooses latest for week)
 * @property {string} [weekId] - Week ID (e.g., "2025-W43"), else current week
 * @property {boolean} [force] - Bypass member-cap guard
 * @property {number} [capHint] - Expected member count for validation
 * @property {function(string):void} [logger] - Custom logger function
 */

/**
 * @typedef {Object} RecomputeResult
 * @property {string} guildId
 * @property {string} weekId
 * @property {number} snapshotId
 * @property {number} members - Total distinct member_keys
 * @property {number} sumTotal - Sum of total_power
 * @property {number} sumSim - Sum of sim_power
 * @property {number} replacedRows - Number of rows written to club_latest
 * @property {string[]} warnings - Warning messages
 */

function ensureDatabaseConfigured() {
  if (!database.isConfigured()) {
    throw new Error("Recompute requires a configured database");
  }
}

function toNumber(value) {
  if (value === null || typeof value === "undefined") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function computePct(current, previous) {
  const curr = toNumber(current);
  const prev = toNumber(previous);
  if (curr === null || prev === null || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : null;
}

/**
 * Recompute club_latest from a snapshot
 *
 * @param {RecomputeOpts} opts - Options
 * @returns {Promise<RecomputeResult>} Result summary
 */
async function recomputeLatest(opts) {
  ensureDatabaseConfigured();

  const {
    guildId,
    snapshotId = null,
    weekId = null,
    force = false,
    capHint = null,
    logger: log = console.log,
  } = opts;

  if (!guildId) {
    throw new Error("guildId is required");
  }

  const warnings = [];

  // Resolve week ID
  const targetWeekId = weekId || getWeekId();
  log(`[recompute] Target week: ${targetWeekId}`);

  // Find the snapshot to use
  let targetSnapshot = null;

  if (snapshotId) {
    // Validate provided snapshot ID
    const [snapshot] = await database.query(
      `SELECT id, guild_id, snapshot_at, notes
       FROM club_snapshots
       WHERE id = ?`,
      [snapshotId]
    );

    if (!snapshot) {
      throw new Error(`Snapshot ID ${snapshotId} not found`);
    }

    if (snapshot.guild_id !== guildId) {
      throw new Error(
        `Snapshot ID ${snapshotId} belongs to guild ${snapshot.guild_id}, not ${guildId}`
      );
    }

    const snapshotWeekId = getWeekId(new Date(snapshot.snapshot_at));
    if (snapshotWeekId !== targetWeekId) {
      warnings.push(
        `Snapshot week ${snapshotWeekId} differs from target week ${targetWeekId}`
      );
    }

    targetSnapshot = snapshot;
  } else {
    // Find the latest snapshot for this guild and week
    // We need to find snapshots that fall within the target week's time window
    const [snapshot] = await database.query(
      `SELECT id, guild_id, snapshot_at, notes
       FROM club_snapshots
       WHERE guild_id = ?
       ORDER BY snapshot_at DESC, id DESC
       LIMIT 1`,
      [guildId]
    );

    if (!snapshot) {
      throw new Error(`No snapshots found for guild ${guildId}`);
    }

    const snapshotWeekId = getWeekId(new Date(snapshot.snapshot_at));
    if (snapshotWeekId !== targetWeekId) {
      warnings.push(
        `Latest snapshot is from week ${snapshotWeekId}, not target week ${targetWeekId}`
      );
    }

    targetSnapshot = snapshot;
  }

  log(
    `[recompute] Using snapshot #${targetSnapshot.id} from ${new Date(targetSnapshot.snapshot_at).toISOString()}`
  );

  // Aggregate metrics from this snapshot using member_key
  const currentMetrics = await database.query(
    `SELECT m.member_key,
            m.member_id,
            cm.name_display,
            MAX(CASE WHEN m.metric = 'sim' THEN m.value END) AS sim_power,
            MAX(CASE WHEN m.metric = 'total' THEN m.value END) AS total_power
     FROM club_metrics m
     JOIN club_members cm ON cm.id = m.member_id
     WHERE m.snapshot_id = ?
     GROUP BY m.member_key, m.member_id, cm.name_display`,
    [targetSnapshot.id]
  );

  const distinctMembers = currentMetrics.length;
  log(`[recompute] Found ${distinctMembers} distinct members`);

  // Fetch corrections for this guild and week
  const correctionsMap = await getCorrectionsMap(guildId, targetWeekId);
  const correctionCount = correctionsMap.size;
  if (correctionCount > 0) {
    log(`[recompute] Loaded ${correctionCount} member corrections`);
  }

  // Member-cap validation
  if (capHint !== null && distinctMembers > capHint + 1 && !force) {
    const memberList = currentMetrics
      .map((m) => m.member_key || m.name_display)
      .sort()
      .slice(0, 50)
      .join(", ");

    throw new Error(
      `Member-cap guard: Parsed ${distinctMembers} members > cap ${capHint} + 1. ` +
        `Likely duplicates/aliases. Use force:true to override. ` +
        `Preview: ${memberList}`
    );
  }

  // Get previous week's snapshot for WoW comparison
  const [prevSnapshot] = await database.query(
    `SELECT id, snapshot_at
     FROM club_snapshots
     WHERE guild_id = ?
       AND snapshot_at BETWEEN DATE_SUB(?, INTERVAL 8 DAY) AND DATE_SUB(?, INTERVAL 6 DAY)
     ORDER BY snapshot_at DESC
     LIMIT 1`,
    [guildId, targetSnapshot.snapshot_at, targetSnapshot.snapshot_at]
  );

  let previousMetricsMap = new Map();
  if (prevSnapshot?.id) {
    log(`[recompute] Found previous snapshot #${prevSnapshot.id} for WoW comparison`);

    const previousMetrics = await database.query(
      `SELECT m.member_key,
              MAX(CASE WHEN m.metric = 'sim' THEN m.value END) AS sim_power,
              MAX(CASE WHEN m.metric = 'total' THEN m.value END) AS total_power
       FROM club_metrics m
       WHERE m.snapshot_id = ?
       GROUP BY m.member_key`,
      [prevSnapshot.id]
    );

    previousMetricsMap = new Map(
      previousMetrics.map((entry) => [entry.member_key, entry])
    );
  } else {
    log(`[recompute] No previous snapshot found for WoW comparison`);
  }

  // Build payload for club_latest
  const payload = [];
  let sumTotal = 0;
  let sumSim = 0;
  let correctionsApplied = 0;

  for (const row of currentMetrics) {
    const prev = previousMetricsMap.get(row.member_key) || {};
    const simPrev = prev.sim_power ?? null;
    const totalPrev = prev.total_power ?? null;

    let simPower = toNumber(row.sim_power);
    let totalPower = toNumber(row.total_power);
    let simCorrected = false;
    let totalCorrected = false;
    let simCorrectionReason = null;
    let totalCorrectionReason = null;

    // Apply corrections if they exist
    const corrections = correctionsMap.get(row.member_key);
    if (corrections) {
      if (corrections.sim) {
        simPower = corrections.sim.value;
        simCorrected = true;
        simCorrectionReason = corrections.sim.reason;
        correctionsApplied++;
      }
      if (corrections.total) {
        totalPower = corrections.total.value;
        totalCorrected = true;
        totalCorrectionReason = corrections.total.reason;
        correctionsApplied++;
      }
    }

    if (totalPower !== null) sumTotal += totalPower;
    if (simPower !== null) sumSim += simPower;

    payload.push({
      guildId,
      memberKey: row.member_key,
      memberId: row.member_id,
      nameDisplay: row.name_display,
      simPower,
      totalPower,
      simPrev: toNumber(simPrev),
      totalPrev: toNumber(totalPrev),
      simPct: computePct(simPower, simPrev),
      totalPct: computePct(totalPower, totalPrev),
      simCorrected,
      totalCorrected,
      simCorrectionReason,
      totalCorrectionReason,
      latestAt: targetSnapshot.snapshot_at,
    });
  }

  log(
    `[recompute] Aggregates: members=${distinctMembers}, totalPower=${sumTotal.toLocaleString()}, simPower=${sumSim.toLocaleString()}`
  );

  if (correctionsApplied > 0) {
    log(`[recompute] Applied ${correctionsApplied} corrections`);
  }

  // Replace club_latest rows for this guild (transaction)
  const pool = database.getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Delete existing
    await connection.query("DELETE FROM club_latest WHERE guild_id = ?", [guildId]);

    // Insert new
    if (payload.length) {
      const placeholders = payload
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const params = [];

      for (const item of payload) {
        params.push(
          item.guildId,
          item.memberKey,
          item.memberId,
          item.nameDisplay,
          item.simPower,
          item.totalPower,
          item.simPrev,
          item.totalPrev,
          item.simPct,
          item.totalPct,
          item.simCorrected,
          item.simCorrectionReason,
          item.totalCorrected,
          item.totalCorrectionReason,
          item.latestAt
        );
      }

      await connection.query(
        `INSERT INTO club_latest
           (guild_id, member_key, member_id, name_display, sim_power, total_power, sim_prev, total_prev, sim_pct_change, total_pct_change, sim_corrected, sim_correction_reason, total_corrected, total_correction_reason, latest_at)
         VALUES ${placeholders}`,
        params
      );
    }

    await connection.commit();
    log(`[recompute] Replaced ${payload.length} rows in club_latest`);
  } catch (err) {
    await connection.rollback();
    logger.error("[recompute] Transaction failed", {
      guildId,
      snapshotId: targetSnapshot.id,
      error: err.message,
    });
    throw err;
  } finally {
    connection.release();
  }

  return {
    guildId,
    weekId: targetWeekId,
    snapshotId: targetSnapshot.id,
    members: distinctMembers,
    sumTotal,
    sumSim,
    replacedRows: payload.length,
    warnings,
  };
}

module.exports = {
  recomputeLatest,
};
