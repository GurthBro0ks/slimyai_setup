// Basic heuristics to classify screenshot types and provide ROI metadata.
// Returns { type, candidates, rois, quality }
const sharp = require("sharp");
const layout = require("./layouts/supersnail.json");

function roiRect(imgW, imgH, r) {
  return {
    left: Math.round(imgW * r.x),
    top: Math.round(imgH * r.y),
    width: Math.round(imgW * r.w),
    height: Math.round(imgH * r.h),
  };
}

async function detectTypeAndRegions(buf) {
  const meta = await sharp(buf).metadata();
  const { width: W, height: H } = meta;

  const radar = layout.radar;
  const load = layout.loadout_buttons;
  const gear = layout.gear_slots;
  const relic = layout.relic_slots;

  const stats = await sharp(buf).stats();
  const rgbMeans = stats.channels.slice(0, 3).map((ch) => ch.mean);
  const brightness = rgbMeans.reduce((sum, val) => sum + val, 0) / 3;
  const aspect = H && W ? H / W : 1;

  const candidates = [];

  if (aspect >= 1.2 || brightness >= 150) {
    candidates.push("STATS_MAIN");
  }
  if (brightness >= 100) {
    candidates.push("LOADOUT_GEAR");
  }
  if (brightness <= 135 || aspect <= 1.05) {
    candidates.push("COMPASS_RELICS");
  }

  if (!candidates.includes("STATS_MAIN")) candidates.push("STATS_MAIN");
  if (!candidates.includes("LOADOUT_GEAR")) candidates.push("LOADOUT_GEAR");
  if (!candidates.includes("COMPASS_RELICS")) candidates.push("COMPASS_RELICS");

  const type = candidates[0] || "COMPASS_RELICS";

  return {
    type,
    candidates,
    rois: { radar, load, gear, relic },
    quality: Math.min(100, Math.round(brightness / 2)),
  };
}

module.exports = { detectTypeAndRegions, roiRect };
