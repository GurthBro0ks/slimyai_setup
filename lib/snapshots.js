const db = require('./database');

let schemaEnsured = false;

async function ensureSnapshotSchema() {
  if (schemaEnsured) return;

  const alterations = [
    'ALTER TABLE account_snapshots ADD COLUMN guild_id VARCHAR(50) NULL',
    'ALTER TABLE account_snapshots ADD COLUMN finalized_at TIMESTAMP NULL DEFAULT NULL'
  ];

  for (const sql of alterations) {
    try {
      await db.query(sql);
    } catch (err) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        throw err;
      }
    }
  }

  schemaEnsured = true;
}

async function findActiveSnapshot(userId, guildId = null) {
  await ensureSnapshotSchema();

  const existing = await db.query(
    `SELECT id
     FROM account_snapshots
     WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?)
       AND (finalized_at IS NULL)
     ORDER BY id DESC
     LIMIT 1`,
    [userId, guildId]
  );

  return existing.length ? existing[0].id : null;
}

async function getOrCreateSnapshot(userId, guildId = null) {
  const existing = await findActiveSnapshot(userId, guildId);
  if (existing) return existing;

  const result = await db.query(
    'INSERT INTO account_snapshots (user_id, guild_id) VALUES (?, ?)',
    [userId, guildId]
  );
  return result.insertId;
}
async function upsertSnapshotPart(snapshotId, type, imageUrl, fields, quality) {
  await db.query(
    `INSERT INTO snapshot_parts (snapshot_id, part_type, image_url, fields_json, quality_score)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE image_url=VALUES(image_url), fields_json=VALUES(fields_json), quality_score=VALUES(quality_score)`,
    [snapshotId, type, imageUrl, JSON.stringify(fields || {}), quality || 0]
  );
}
async function getSnapshotParts(snapshotId) {
  const rows = await db.query('SELECT * FROM snapshot_parts WHERE snapshot_id=?', [snapshotId]);
  return rows.map(r => ({ ...r, fields: tryParse(r.fields_json) }));
}

async function finalizeSnapshot(snapshotId) {
  await ensureSnapshotSchema();
  await db.query(
    'UPDATE account_snapshots SET finalized_at = NOW() WHERE id = ?',
    [snapshotId]
  );
}

function tryParse(x) {
  try {
    return typeof x === 'object' ? x : JSON.parse(x);
  } catch {
    return {};
  }
}

module.exports = {
  findActiveSnapshot,
  getOrCreateSnapshot,
  upsertSnapshotPart,
  getSnapshotParts,
  finalizeSnapshot
};
