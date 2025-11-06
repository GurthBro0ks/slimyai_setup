const sharp = require("sharp");

const KEYS = ["FAME", "TECH", "ART", "CIV", "FTH"];

function rect(r, W, H) {
  return {
    left: Math.round(W * r.x),
    top: Math.round(H * r.y),
    width: Math.round(W * r.w),
    height: Math.round(H * r.h),
  };
}

const toNumber = (value) =>
  Math.max(0, parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10) || 0);

function confidence(values) {
  const filled = KEYS.filter((k) => (values[k] || 0) > 0).length;
  return Math.round(100 * (filled / KEYS.length));
}

async function extractRadar(buf, rois, W, H, ocrFn) {
  const crop = await sharp(buf)
    .extract(rect(rois.radar, W, H))
    .png()
    .toBuffer();
  const raw =
    (await ocrFn(crop, {
      system: "Return JSON with numeric FAME,TECH,ART,CIV,FTH. No prose.",
    })) || {};
  const values = Object.fromEntries(KEYS.map((k) => [k, toNumber(raw[k])]));
  const conf = confidence(values);
  const readable = KEYS.every((k) => values[k] > 0);
  return { ...values, confidence: conf, readable };
}

function bottleneckFrom(radar) {
  const items = KEYS.map((k) => [k, radar?.[k] || 0]).filter(([, v]) => v > 0);
  if (!items.length) return null;
  const avg = items.reduce((sum, [, val]) => sum + val, 0) / items.length;
  const [stat, val] = items.sort((a, b) => a[1] - b[1])[0];
  const behindPct =
    avg > 0 ? Math.max(0, Math.round((100 * (avg - val)) / avg)) : 0;
  return { stat, behindPct };
}

module.exports = { extractRadar, bottleneckFrom, KEYS };
