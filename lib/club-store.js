const database = require("./database");
const logger = require("./logger");

function ensureDatabaseConfigured() {
  if (!database.isConfigured()) {
    throw new Error("Club analytics requires a configured database");
  }
}

function stripDiscordEmoji(text) {
  return text.replace(/<a?:[^:>]+:\d+>/g, " ");
}

function stripSquareTags(text) {
  return text.replace(/\[[^\]]+\]/g, " ");
}

function stripColonedEmoji(text) {
  return text.replace(/:[^:\s]+:/g, " ");
}

function removeEmojiCharacters(text) {
  return text.replace(/[\p{Extended_Pictographic}]/gu, " ");
}

function canonicalize(name) {
  if (!name) return "";
  let working = String(name).normalize("NFKD");
  working = stripDiscordEmoji(working);
  working = stripSquareTags(working);
  working = stripColonedEmoji(working);
  working = removeEmojiCharacters(working);
  working = working.replace(/[\u0300-\u036f]/g, "");
  working = working.replace(/[^\p{L}\p{N}]+/gu, " ");
  working = working.replace(/\s+/g, " ").trim().toLowerCase();
  return working;
}

async function upsertMembers(guildId, rows) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  if (!Array.isArray(rows) || rows.length === 0) return new Map();

  const sql = `
    INSERT INTO club_members (guild_id, name_canonical, name_display, last_seen)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name_display = VALUES(name_display),
      last_seen = VALUES(last_seen),
      id = LAST_INSERT_ID(id)
  `;

  const memberMap = new Map();
  const seenCanonical = new Set();

  for (const row of rows) {
    const display = row?.display ? String(row.display).trim() : "";
    const canonical = row?.canonical
      ? String(row.canonical)
      : canonicalize(display || row?.name || "");
    if (!canonical) continue;
    if (seenCanonical.has(canonical)) continue;
    seenCanonical.add(canonical);

    const lastSeen = row?.lastSeen instanceof Date ? row.lastSeen : new Date();

    try {
      const result = await database.query(sql, [
        guildId,
        canonical,
        display || canonical,
        lastSeen,
      ]);
      const memberId = result.insertId;
      if (memberId) {
        memberMap.set(canonical, memberId);
      } else {
        const lookup = await database.query(
          "SELECT id FROM club_members WHERE guild_id = ? AND name_canonical = ? LIMIT 1",
          [guildId, canonical],
        );
        if (lookup[0]?.id) {
          memberMap.set(canonical, lookup[0].id);
        }
      }
    } catch (err) {
      logger.error("[club-store] Failed to upsert member", {
        guildId,
        canonical,
        err: err.message,
      });
    }
  }

  return memberMap;
}

async function createSnapshot(
  guildId,
  createdBy,
  notes = null,
  snapshotAt = new Date(),
) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  if (!createdBy) throw new Error("createdBy is required");

  const result = await database.query(
    `INSERT INTO club_snapshots (guild_id, created_by, snapshot_at, notes)
     VALUES (?, ?, ?, ?)`,
    [guildId, createdBy, snapshotAt, notes],
  );

  return {
    snapshotId: result.insertId,
    snapshotAt,
  };
}

async function insertMetrics(snapshotId, entries) {
  ensureDatabaseConfigured();
  if (!snapshotId) throw new Error("snapshotId is required");
  if (!Array.isArray(entries) || entries.length === 0) return;

  const chunks = [];
  const chunkSize = 200;

  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(", ");
    const params = [];
    for (const entry of chunk) {
      if (!entry?.memberId || !entry?.metric) continue;
      params.push(
        snapshotId,
        entry.memberId,
        entry.metric,
        entry.value ?? null,
      );
    }
    if (!params.length) continue;
    await database.query(
      `INSERT INTO club_metrics (snapshot_id, member_id, metric, value)
       VALUES ${placeholders}`,
      params,
    );
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

async function recomputeLatestForGuild(guildId, snapshotAt) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const referenceAt =
    snapshotAt instanceof Date ? snapshotAt : new Date(snapshotAt);

  const [snapshotRow] = await database.query(
    `SELECT id, snapshot_at
     FROM club_snapshots
     WHERE guild_id = ? AND snapshot_at = ?
     ORDER BY id DESC
     LIMIT 1`,
    [guildId, referenceAt],
  );

  if (!snapshotRow) {
    logger.warn("[club-store] No snapshot found for recompute", {
      guildId,
      snapshotAt: referenceAt,
    });
    return;
  }

  const [prevSnapshot] = await database.query(
    `SELECT id, snapshot_at
     FROM club_snapshots
     WHERE guild_id = ?
       AND snapshot_at BETWEEN DATE_SUB(?, INTERVAL 8 DAY) AND DATE_SUB(?, INTERVAL 6 DAY)
     ORDER BY snapshot_at DESC
     LIMIT 1`,
    [guildId, snapshotRow.snapshot_at, snapshotRow.snapshot_at],
  );

  const currentMetrics = await database.query(
    `SELECT m.member_id,
            cm.name_display,
            MAX(CASE WHEN m.metric = 'sim' THEN m.value END) AS sim_power,
            MAX(CASE WHEN m.metric = 'total' THEN m.value END) AS total_power
     FROM club_metrics m
     JOIN club_members cm ON cm.id = m.member_id
     WHERE m.snapshot_id = ?
     GROUP BY m.member_id, cm.name_display`,
    [snapshotRow.id],
  );

  let previousMetricsMap = new Map();
  if (prevSnapshot?.id) {
    const previousMetrics = await database.query(
      `SELECT m.member_id,
              MAX(CASE WHEN m.metric = 'sim' THEN m.value END) AS sim_power,
              MAX(CASE WHEN m.metric = 'total' THEN m.value END) AS total_power
       FROM club_metrics m
       WHERE m.snapshot_id = ?
       GROUP BY m.member_id`,
      [prevSnapshot.id],
    );
    previousMetricsMap = new Map(
      previousMetrics.map((entry) => [entry.member_id, entry]),
    );
  }

  const payload = [];
  for (const row of currentMetrics) {
    const prev = previousMetricsMap.get(row.member_id) || {};
    const simPrev = prev.sim_power ?? null;
    const totalPrev = prev.total_power ?? null;

    payload.push({
      guildId,
      memberId: row.member_id,
      nameDisplay: row.name_display,
      simPower: toNumber(row.sim_power),
      totalPower: toNumber(row.total_power),
      simPrev: toNumber(simPrev),
      totalPrev: toNumber(totalPrev),
      simPct: computePct(row.sim_power, simPrev),
      totalPct: computePct(row.total_power, totalPrev),
      latestAt: snapshotRow.snapshot_at,
    });
  }

  const pool = database.getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM club_latest WHERE guild_id = ?", [
      guildId,
    ]);

    if (payload.length) {
      const placeholders = payload
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const params = [];
      for (const item of payload) {
        params.push(
          item.guildId,
          item.memberId,
          item.nameDisplay,
          item.simPower,
          item.totalPower,
          item.simPrev,
          item.totalPrev,
          item.simPct,
          item.totalPct,
          item.latestAt,
        );
      }
      await connection.query(
        `INSERT INTO club_latest
           (guild_id, member_id, name_display, sim_power, total_power, sim_prev, total_prev, sim_pct_change, total_pct_change, latest_at)
         VALUES ${placeholders}`,
        params,
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    logger.error("[club-store] Failed to recompute latest", {
      guildId,
      error: err.message,
    });
    throw err;
  } finally {
    connection.release();
  }
}

async function getLatestForGuild(guildId) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  return database.query(
    `SELECT cl.member_id,
            cm.name_canonical,
            cl.name_display,
            cl.sim_power,
            cl.total_power,
            cl.sim_prev,
            cl.total_prev,
            cl.sim_pct_change,
            cl.total_pct_change,
            cl.latest_at
     FROM club_latest cl
     JOIN club_members cm ON cm.id = cl.member_id
     WHERE cl.guild_id = ?
     ORDER BY (cl.total_power IS NULL) ASC, cl.total_power DESC, cl.name_display ASC`,
    [guildId],
  );
}

async function getTopMovers(guildId, metric, limit) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 10), 50));
  const column = metric === "sim" ? "sim_power" : "total_power";
  const prevColumn = metric === "sim" ? "sim_prev" : "total_prev";
  const pctColumn = metric === "sim" ? "sim_pct_change" : "total_pct_change";

  const gainers = await database.query(
    `SELECT member_id,
            name_display,
            ${column} AS current_value,
            ${prevColumn} AS previous_value,
            ${pctColumn} AS pct_change
     FROM club_latest
     WHERE guild_id = ?
       AND ${column} IS NOT NULL
       AND ${prevColumn} IS NOT NULL
       AND ${pctColumn} IS NOT NULL
     ORDER BY ${pctColumn} DESC
     LIMIT ${safeLimit}`,
    [guildId],
  );

  const losers = await database.query(
    `SELECT member_id,
            name_display,
            ${column} AS current_value,
            ${prevColumn} AS previous_value,
            ${pctColumn} AS pct_change
     FROM club_latest
     WHERE guild_id = ?
       AND ${column} IS NOT NULL
       AND ${prevColumn} IS NOT NULL
       AND ${pctColumn} IS NOT NULL
     ORDER BY ${pctColumn} ASC
     LIMIT ${safeLimit}`,
    [guildId],
  );

  return {
    gainers,
    losers,
  };
}

async function getAggregates(guildId) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");

  const [row] = await database.query(
    `SELECT
        COUNT(*) AS member_count,
        SUM(CASE WHEN total_power IS NOT NULL THEN 1 ELSE 0 END) AS members_with_totals,
        SUM(COALESCE(total_power, 0)) AS total_power
     FROM club_latest
     WHERE guild_id = ?`,
    [guildId],
  );

  const members = Number(row?.member_count || 0);
  const membersWithTotals = Number(row?.members_with_totals || 0);
  const totalPower = toNumber(row?.total_power);
  const averagePower =
    membersWithTotals > 0 && totalPower !== null
      ? totalPower / membersWithTotals
      : null;

  logger.info("[club-store] Aggregates query result", {
    guildId,
    members,
    membersWithTotals,
    totalPower,
    averagePower,
  });

  return {
    members,
    membersWithTotals,
    totalPower,
    averagePower,
  };
}

async function getLastWeekCanonicalNames(guildId) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const rows = await database.query(
    `SELECT cm.name_canonical
     FROM club_latest cl
     JOIN club_members cm ON cm.id = cl.member_id
     WHERE cl.guild_id = ?`,
    [guildId],
  );

  return new Set(rows.map((row) => row.name_canonical));
}

async function findLikelyMemberId(guildId, canonicalOrAlias) {
  ensureDatabaseConfigured();
  if (!guildId) throw new Error("guildId is required");
  const canonical = canonicalize(canonicalOrAlias);
  if (!canonical) return null;

  const [direct] = await database.query(
    `SELECT id
     FROM club_members
     WHERE guild_id = ? AND name_canonical = ?
     LIMIT 1`,
    [guildId, canonical],
  );
  if (direct?.id) return direct.id;

  const [alias] = await database.query(
    `SELECT member_id
     FROM club_aliases
     WHERE guild_id = ? AND alias_canonical = ?
     LIMIT 1`,
    [guildId, canonical],
  );
  if (alias?.member_id) return alias.member_id;

  const fuzzyPattern = `%${canonical.replace(/\s+/g, "%")}%`;
  const [fuzzy] = await database.query(
    `SELECT id
     FROM club_members
     WHERE guild_id = ?
       AND name_canonical LIKE ?
     ORDER BY last_seen DESC
     LIMIT 1`,
    [guildId, fuzzyPattern],
  );

  return fuzzy?.id || null;
}

async function addAlias(guildId, memberId, aliasCanonical) {
  ensureDatabaseConfigured();
  if (!guildId || !memberId || !aliasCanonical) return;

  await database.query(
    `INSERT INTO club_aliases (guild_id, member_id, alias_canonical)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE member_id = VALUES(member_id)`,
    [guildId, memberId, aliasCanonical],
  );
}

module.exports = {
  canonicalize,
  upsertMembers,
  createSnapshot,
  insertMetrics,
  recomputeLatestForGuild,
  getLatestForGuild,
  getTopMovers,
  getAggregates,
  getLastWeekCanonicalNames,
  findLikelyMemberId,
  addAlias,
};
