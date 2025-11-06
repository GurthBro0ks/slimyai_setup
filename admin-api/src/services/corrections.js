"use strict";

const { getWeekId } = require("../../lib/week-anchor");
const corrections = require("../../lib/club-corrections");
const database = require("../../lib/database");
const slimyCore = require("@slimy/core");

async function listCorrections(guildId, weekId = null) {
  return corrections.listCorrections(guildId, weekId);
}

async function createCorrection(guildId, payload, { userId = null } = {}) {
  const weekId = payload.weekId || getWeekId();
  const memberKey =
    payload.memberKey ||
    slimyCore.normalizeMemberKey(payload.displayName || payload.memberInput);

  if (!memberKey) {
    throw new Error("Unable to determine member key");
  }

  const result = await corrections.addCorrection({
    guildId,
    weekId,
    memberKey,
    displayName: payload.displayName || payload.memberInput || memberKey,
    metric: payload.metric,
    value: payload.value,
    reason: payload.reason || null,
    source: payload.source || "admin-ui",
    createdBy: userId,
  });

  return result;
}

async function deleteCorrectionById(guildId, correctionId) {
  if (!database.isConfigured()) {
    throw new Error("Database not configured");
  }

  const rows = await database.query(
    `SELECT week_id, member_key, metric
     FROM club_corrections
     WHERE id = ? AND guild_id = ?
     LIMIT 1`,
    [correctionId, guildId],
  );

  if (!rows.length) {
    return false;
  }

  const row = rows[0];
  return corrections.removeCorrection(
    guildId,
    row.week_id,
    row.member_key,
    row.metric,
  );
}

async function fetchCorrectionsForExport(guildId) {
  if (!database.isConfigured()) {
    throw new Error("Database not configured");
  }

  const rows = await database.query(
    `SELECT id, guild_id, week_id, member_key, display_name, metric, value, reason, source, created_by, created_at
       FROM club_corrections
      WHERE guild_id = ?
      ORDER BY week_id DESC, display_name ASC, metric ASC`,
    [guildId],
  );

  return rows;
}

function correctionsToCsv(rows) {
  const header = [
    "id",
    "guild_id",
    "week_id",
    "member_key",
    "display_name",
    "metric",
    "value",
    "reason",
    "source",
    "created_by",
    "created_at",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    const values = header.map((key) => {
      const value = row[key];
      if (value === null || typeof value === "undefined") return "";
      const stringValue = String(value);
      if (stringValue.includes(",") || stringValue.includes("\"")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    lines.push(values.join(","));
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  listCorrections,
  createCorrection,
  deleteCorrectionById,
  fetchCorrectionsForExport,
  correctionsToCsv,
};
