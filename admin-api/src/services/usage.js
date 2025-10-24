"use strict";

const slimyCore = require("@slimy/core");

const usageLib = slimyCore.usage;

async function getUsage(guildId, { window = "7d", startDate = null, endDate = null } = {}) {
  if (!usageLib) {
    throw new Error("Usage module not available");
  }

  const { startDate: start, endDate: end } = usageLib.parseWindow(
    window,
    startDate,
    endDate,
  );

  const [apiData, localImageStats] = await Promise.all([
    usageLib.fetchOpenAIUsage(start, end),
    usageLib.fetchLocalImageStats(guildId, start, end),
  ]);

  const aggregated = usageLib.aggregateUsage(apiData, localImageStats);

  return {
    window,
    startDate: start,
    endDate: end,
    apiRaw: apiData,
    localImageStats,
    aggregated,
  };
}

module.exports = {
  getUsage,
};
