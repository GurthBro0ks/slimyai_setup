const sharp = require("sharp");
const { roiRect } = require("./screen-detector");
const { matchCrop } = require("./icon-match");
const { logUnknown } = require("./unknown-logger");

async function extractRelicIcons(buf, relicSlots, W, H) {
  const out = [];
  for (const [affct, r] of Object.entries(relicSlots)) {
    const inner = shrinkRect(r, 0.02);
    const crop = await sharp(buf)
      .extract(roiRect(W, H, inner))
      .png()
      .toBuffer();
    const match = await matchCrop(crop, "relic", affct);
    if (match.canonical_name === "Unknown" || match.confidence < 60) {
      await logUnknown("relic", affct, crop);
    }
    out.push({
      item_type: "relic",
      item_slot: affct,
      canonical_name: match.canonical_name,
      confidence: match.confidence,
    });
  }
  return out;
}

function shrinkRect(rect, amount = 0.02) {
  const shrink = Math.max(0, Math.min(amount, rect.w / 2, rect.h / 2));
  return {
    x: rect.x + shrink,
    y: rect.y + shrink,
    w: Math.max(0.001, rect.w - shrink * 2),
    h: Math.max(0.001, rect.h - shrink * 2),
  };
}
module.exports = { extractRelicIcons };
