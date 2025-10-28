"use strict";

const database = require("../../lib/database");
const { getWeekId } = require("../../lib/week-anchor");
const { getWarnThresholds } = require("../../lib/thresholds");
const guildSettings = require("../../lib/guild-settings");

function toNumber(value) {
  if (value === null || typeof value === "undefined") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function getHealth(guildId) {
  if (!database.isConfigured()) {
    throw new Error("Database not configured");
  }

  const [aggregate] = await database.query(
    `SELECT
        COUNT(*) AS members,
        SUM(total_power) AS total_power_sum,
        SUM(sim_power) AS sim_power_sum,
        MAX(latest_at) AS latest_at
     FROM club_latest
     WHERE guild_id = ?`,
    [guildId],
  );

  const [snapshot] = await database.query(
    `SELECT snapshot_at
     FROM club_snapshots
     WHERE guild_id = ?
     ORDER BY snapshot_at DESC
     LIMIT 1`,
    [guildId],
  );

  const settings = await guildSettings.getGuildSettings(guildId);
  const lastSheetPush = settings?.last_sheet_push_at || null;

  const latestAt = aggregate?.latest_at || null;
  const weekId = latestAt ? getWeekId(new Date(latestAt)) : null;

  const thresholds = await getWarnThresholds(guildId);

  return {
    guildId,
    weekId,
    members: aggregate ? Number(aggregate.members || 0) : 0,
    totalPower: toNumber(aggregate?.total_power_sum),
    simPower: toNumber(aggregate?.sim_power_sum),
    latestAt,
    lastSnapshotAt: snapshot?.snapshot_at || null,
    lastSheetPushAt: lastSheetPush,
    thresholds,
  };
}

module.exports = {
  getHealth,
};
