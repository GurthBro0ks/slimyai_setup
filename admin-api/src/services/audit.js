"use strict";

const database = require("../../lib/database");
const config = require("../config");

async function recordAudit({ adminId, action, guildId = null, payload = null }) {
  if (!config.audit.enabled) return;
  if (!database.isConfigured()) return;
  if (!adminId || !action) return;

  const jsonPayload =
    payload === null || typeof payload === "undefined"
      ? null
      : JSON.stringify(payload);

  await database.query(
    `INSERT INTO admin_audit_log (admin_id, action, guild_id, payload)
     VALUES (?, ?, ?, ?)`,
    [adminId, action, guildId || null, jsonPayload],
  );
}

module.exports = {
  recordAudit,
};
