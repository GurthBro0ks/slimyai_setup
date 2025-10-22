const { getCachedOrFetch } = require("./cache-manager");

async function enrichStats(stats) {
  const bosses = await getCachedOrFetch(
    `bosses:range:${bossBucket(stats)}`,
    async () => [
      { name: "Apostle Japan 1-5", pass: true },
      { name: "Apostle Westurope 4+", pass: false, need: { FAME: 60000 } },
    ],
    86400,
  );

  const gear = await getCachedOrFetch(
    `gear:simple:${gearTier(stats)}`,
    async () => [
      { name: "Norris-chuck", tier: "Red", reason: "Progression ATK" },
      { name: "Bloodfang", tier: "Orange", reason: "Budget/Crit" },
    ],
    86400,
  );

  const relics = await getCachedOrFetch(
    `relics:affct:${affctGap(stats)}`,
    async () => [
      { slot: "FAME", name: "Great Wall", gain: "+12k FAME" },
      { slot: "FTH", name: "Cross of Faith", gain: "+15k FTH" },
    ],
    86400,
  );

  const bottleneck = identifyBottleneck(stats);
  const nextSteps = [
    `Raise ${bottleneck.stat} via ${relics[0]?.name || "best-in-slot relic"}`,
    `Upgrade gear to ${gear[0]?.name || "S-tier"}`,
  ];

  return {
    canBeatBosses: bosses.filter((b) => b.pass).map((b) => b.name),
    gearSuggestions: gear,
    relicPriorities: relics,
    bottleneck,
    nextSteps,
  };
}

function identifyBottleneck(stats) {
  const affcts = {
    FAME: toNumber(stats.FAME),
    TECH: toNumber(stats.TECH),
    ART: toNumber(stats.ART),
    CIV: toNumber(stats.CIV),
    FTH: toNumber(stats.FTH),
  };

  const entries = Object.entries(affcts).filter(([, value]) =>
    Number.isFinite(value),
  );
  if (entries.length === 0) {
    return { stat: "FAME", behindPct: 0 };
  }

  entries.sort((a, b) => a[1] - b[1]);
  const [stat, value] = entries[0];
  const avg = entries.reduce((sum, [, val]) => sum + val, 0) / entries.length;
  const behindPct =
    avg > 0 ? Math.max(0, Math.round(((avg - value) / avg) * 100)) : 0;

  return { stat, behindPct };
}

function toNumber(input) {
  const num = Number(input);
  return Number.isFinite(num) ? num : 0;
}

function bossBucket(stats) {
  return `${Math.floor(toNumber(stats.ATK) / 100000)}-${Math.floor(toNumber(stats.DEF) / 100000)}`;
}

function gearTier(stats) {
  return toNumber(stats.ATK) > 600000 ? "late" : "mid";
}

function affctGap(stats) {
  return identifyBottleneck(stats).stat;
}

module.exports = {
  enrichStats,
  identifyBottleneck,
};
