const db = require("./database");
const { normalize64, hamming64, histDist16 } = require("./icon-hash");

let visionFallback = async () => null;
let warnedMultiHashFailure = false;

function setVisionFallback(fn) {
  if (typeof fn === "function") {
    visionFallback = fn;
  }
}

async function fetchAtlas(itemType) {
  if (!db.isConfigured || !db.isConfigured()) return [];

  try {
    const rows = await db.query(
      `SELECT i.id,
              i.canonical_name,
              i.item_slot,
              i.phash AS base_phash,
              h.phash AS extra_phash,
              h.ahsv AS extra_ahsv
         FROM snail_item_icons i
    LEFT JOIN snail_item_icon_hashes h ON h.item_id = i.id
        WHERE i.item_type = ?`,
      [itemType],
    );
    return hydrateAtlas(rows);
  } catch (err) {
    if (!warnedMultiHashFailure) {
      console.warn(
        "[icon-match] Multi-hash lookup failed, falling back to legacy hashes:",
        err.message,
      );
      warnedMultiHashFailure = true;
    }
    try {
      const legacy = await db.query(
        "SELECT id, canonical_name, item_slot, phash FROM snail_item_icons WHERE item_type=?",
        [itemType],
      );
      return legacy.map((row) => ({
        id: row.id,
        canonicalName: row.canonical_name,
        itemSlot: row.item_slot,
        hashes: row.phash
          ? [{ phash: row.phash, ahsv: null, source: "legacy" }]
          : [],
      }));
    } catch (legacyErr) {
      console.error(
        "[icon-match] Legacy icon lookup failed:",
        legacyErr.message,
      );
      return [];
    }
  }
}

function hydrateAtlas(rows) {
  const byId = new Map();
  for (const row of rows) {
    const existing = byId.get(row.id) || {
      id: row.id,
      canonicalName: row.canonical_name,
      itemSlot: row.item_slot,
      hashes: [],
      _baseAdded: false,
    };

    if (!existing._baseAdded && row.base_phash) {
      existing.hashes.push({
        phash: row.base_phash,
        ahsv: null,
        source: "base",
      });
      existing._baseAdded = true;
    }

    if (row.extra_phash) {
      const already = existing.hashes.some(
        (entry) => entry.phash === row.extra_phash,
      );
      if (!already) {
        existing.hashes.push({
          phash: row.extra_phash,
          ahsv: row.extra_ahsv || null,
          source: "atlas",
        });
      }
    }

    byId.set(row.id, existing);
  }

  return Array.from(byId.values()).map((item) => {
    delete item._baseAdded;
    return item;
  });
}

function computeConfidence(dist, histDelta, slotHint) {
  const accessoryBump = slotHint && /^acc/i.test(slotHint) ? 2 : 0;
  const basePenalty = dist * 1.2;
  const histPenalty = (histDelta || 0) * 25;
  const raw = 100 - (basePenalty + histPenalty) + accessoryBump;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function evaluateVariant(phash, ahsv, atlas, slotHint) {
  const scores = [];
  for (const item of atlas) {
    if (slotHint && item.itemSlot && item.itemSlot !== slotHint) continue;
    for (const hash of item.hashes) {
      const dist = hamming64(phash, hash.phash);
      const histDelta = hash.ahsv && ahsv ? histDist16(ahsv, hash.ahsv) : 0;
      const confidence = computeConfidence(dist, histDelta, slotHint);
      scores.push({
        canonicalName: item.canonicalName,
        confidence,
        dist,
        histDelta,
        phash,
        ahsv,
        itemSlot: item.itemSlot || null,
        source: hash.source,
      });
    }
  }

  if (scores.length === 0) return null;

  scores.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.dist !== b.dist) return a.dist - b.dist;
    return (a.histDelta || 0) - (b.histDelta || 0);
  });

  return scores[0];
}

async function matchCrop(
  cropBuffer,
  itemType,
  slotHint,
  { allowFallback = true } = {},
) {
  const atlas = await fetchAtlas(itemType);
  const variants = [
    { name: "trim12", opts: { trim: 0.12, unsharp: true } },
    { name: "trim06", opts: { trim: 0.06, unsharp: true } },
    { name: "trim20", opts: { trim: 0.2, unsharp: true } },
    { name: "noTrim", opts: { trim: 0, unsharp: true } },
  ];

  let best = null;
  let chosenVariant = null;

  for (const variant of variants) {
    const normalized = await normalize64(cropBuffer, variant.opts);
    const candidate = evaluateVariant(
      normalized.phash,
      normalized.ahsv,
      atlas,
      slotHint,
    );
    if (!candidate) continue;
    if (!best || candidate.confidence > best.confidence) {
      best = { ...candidate, phash: normalized.phash, ahsv: normalized.ahsv };
      chosenVariant = variant.name;
    }
  }

  if (!best || best.confidence < 40) {
    if (allowFallback) {
      const vision = await visionFallback(cropBuffer, itemType, slotHint);
      if (vision) {
        return {
          ...vision,
          phash: null,
          ahsv: null,
          variant: "vision-fallback",
        };
      }
    }
    return {
      canonical_name: "Unknown",
      confidence: 0,
      dist: null,
      phash: null,
      ahsv: null,
      variant: chosenVariant,
    };
  }

  if (best.confidence < 70 && allowFallback) {
    const vision = await visionFallback(cropBuffer, itemType, slotHint);
    if (vision) {
      return {
        ...vision,
        phash: best.phash,
        ahsv: best.ahsv,
        dist: best.dist,
        variant: "vision-fallback",
      };
    }
  }

  return {
    canonical_name: best.canonicalName,
    confidence: best.confidence,
    dist: best.dist,
    phash: best.phash,
    ahsv: best.ahsv,
    variant: chosenVariant,
    source: best.source,
  };
}

async function matchCropToItem(cropBuffer, itemType, slotHint, options) {
  return matchCrop(cropBuffer, itemType, slotHint, options);
}

module.exports = { matchCrop, matchCropToItem, setVisionFallback };
