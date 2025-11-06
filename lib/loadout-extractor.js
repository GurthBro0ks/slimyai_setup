const sharp = require("sharp");
const { roiRect } = require("./screen-detector");
const { matchCrop } = require("./icon-match");
const { logUnknown } = require("./unknown-logger");

async function detectActiveLoadout(buf, layout, W, H) {
  const { y, diam, x_left, x_mid, x_right } = layout.loadout_buttons;
  const centers = [
    { slot: "A", x: x_left, y },
    { slot: "B", x: x_mid, y },
    { slot: "C", x: x_right, y },
  ];
  let best = { slot: "A", red: 0 };
  for (const c of centers) {
    const rect = circleRect(W, H, c.x, y, diam);
    const stats = await averageRGB(buf, rect);
    const redness = stats.r - Math.max(stats.g, stats.b);
    if (redness > best.red) best = { slot: c.slot, red: redness };
  }
  return best.slot;
}

async function extractGearIcons(buf, gearSlots, W, H) {
  const out = [];
  for (const [slot, r] of Object.entries(gearSlots)) {
    const inner = shrinkRect(r, 0.02);
    const crop = await sharp(buf)
      .extract(roiRect(W, H, inner))
      .png()
      .toBuffer();
    const match = await matchCrop(crop, "gear", slot);
    if (match.canonical_name === "Unknown" || match.confidence < 60) {
      await logUnknown("gear", slot, crop);
    }
    out.push({
      item_type: "gear",
      item_slot: slot,
      canonical_name: match.canonical_name,
      confidence: match.confidence,
    });
  }
  return out;
}

function circleRect(W, H, xRel, yRel, diamRel) {
  const dW = Math.round(W * diamRel);
  const dH = Math.round(W * diamRel);
  return {
    left: Math.round(W * xRel - dW / 2),
    top: Math.round(H * yRel - dH / 2),
    width: dW,
    height: dH,
  };
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

async function averageRGB(buf, rect) {
  const { left, top, width, height } = rect;
  const stats = await sharp(buf).extract({ left, top, width, height }).stats();
  return {
    r: stats.channels[0].mean,
    g: stats.channels[1].mean,
    b: stats.channels[2].mean,
  };
}

module.exports = { detectActiveLoadout, extractGearIcons };
