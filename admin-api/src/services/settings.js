"use strict";

const guildSettings = require("../../lib/guild-settings");
const { getWarnThresholds } = require("../../lib/thresholds");
const slimyCore = require("@slimy/core");

function toNumber(value) {
  if (value === null || typeof value === "undefined") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function getSettings(guildId, { includeTest = false } = {}) {
  const map = await guildSettings.getGuildSettings(guildId);
  const sheetUrl = map.get("club_sheet_url") || null;
  const sheetId = map.get("club_sheet_id") || null;
  const weekWindow = toNumber(map.get("week_window_days"));
  const warnLow = toNumber(map.get("warn_total_low"));
  const warnHigh = toNumber(map.get("warn_total_high"));
  const tokensPerMinute = toNumber(map.get("openai_tpm"));

  const response = {
    sheetUrl,
    sheetId,
    weekWindowDays: weekWindow,
    thresholds: {
      warnLow,
      warnHigh,
    },
    tokensPerMinute,
    resolvedThresholds: await getWarnThresholds(guildId),
  };

  if (includeTest && sheetId && slimyCore.testSheetAccess) {
    try {
      const result = await slimyCore.testSheetAccess(sheetId);
      response.sheetTest = { ok: true, title: result.title };
    } catch (err) {
      response.sheetTest = { ok: false, error: err.message };
    }
  }

  return response;
}

async function updateSettings(guildId, payload) {
  const { sheetUrl, weekWindowDays, thresholds, tokensPerMinute, testSheet } =
    payload;

  if (typeof sheetUrl !== "undefined") {
    const normalized = guildSettings.normalizeSheetInput(sheetUrl);
    if (normalized.url || normalized.sheetId) {
      await guildSettings.setSheetConfig(guildId, {
        url: normalized.url,
        sheetId: normalized.sheetId,
      });
    } else {
      await guildSettings.clearSheetConfig(guildId);
    }
  }

  if (typeof weekWindowDays !== "undefined") {
    if (weekWindowDays === null) {
      await guildSettings.clearGuildSetting(guildId, "week_window_days");
    } else {
      await guildSettings.setGuildSetting(
        guildId,
        "week_window_days",
        String(weekWindowDays),
      );
    }
  }

  if (thresholds && typeof thresholds === "object") {
    if (typeof thresholds.warnLow !== "undefined") {
      if (thresholds.warnLow === null) {
        await guildSettings.clearGuildSetting(guildId, "warn_total_low");
      } else {
        await guildSettings.setGuildSetting(
          guildId,
          "warn_total_low",
          String(thresholds.warnLow),
        );
      }
    }
    if (typeof thresholds.warnHigh !== "undefined") {
      if (thresholds.warnHigh === null) {
        await guildSettings.clearGuildSetting(guildId, "warn_total_high");
      } else {
        await guildSettings.setGuildSetting(
          guildId,
          "warn_total_high",
          String(thresholds.warnHigh),
        );
      }
    }
  }

  if (typeof tokensPerMinute !== "undefined") {
    if (tokensPerMinute === null) {
      await guildSettings.clearGuildSetting(guildId, "openai_tpm");
    } else {
      await guildSettings.setGuildSetting(
        guildId,
        "openai_tpm",
        String(tokensPerMinute),
      );
    }
  }

  return getSettings(guildId, { includeTest: Boolean(testSheet) });
}

module.exports = {
  getSettings,
  updateSettings,
};
