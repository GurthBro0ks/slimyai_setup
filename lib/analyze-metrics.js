const db = require("./database");

function normalize(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

async function recordMetrics({
  userId,
  coverage,
  confidences = {},
  radarConf,
  firstRun,
}) {
  const row = {
    icon_conf_weapon: normalize(confidences.weapon),
    icon_conf_armor: normalize(confidences.armor),
    icon_conf_acc1: normalize(confidences.acc1),
    icon_conf_acc2: normalize(confidences.acc2),
    icon_conf_FAME: normalize(confidences.FAME),
    icon_conf_ART: normalize(confidences.ART),
    icon_conf_CIV: normalize(confidences.CIV),
    icon_conf_TECH: normalize(confidences.TECH),
    icon_conf_FTH: normalize(confidences.FTH),
  };

  console.log("[analyze-metrics]", {
    userId,
    coverage,
    radarConf: normalize(radarConf),
    firstRun,
    ...row,
  });

  if (process.env.FEATURE_ANALYZE_METRICS !== "true") return;

  try {
    await db.query(
      `INSERT INTO analyze_metrics
       (user_id, coverage, icon_conf_weapon, icon_conf_armor, icon_conf_acc1, icon_conf_acc2,
        icon_conf_FAME, icon_conf_ART, icon_conf_CIV, icon_conf_TECH, icon_conf_FTH, radar_conf, first_run)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        coverage,
        row.icon_conf_weapon,
        row.icon_conf_armor,
        row.icon_conf_acc1,
        row.icon_conf_acc2,
        row.icon_conf_FAME,
        row.icon_conf_ART,
        row.icon_conf_CIV,
        row.icon_conf_TECH,
        row.icon_conf_FTH,
        normalize(radarConf),
        firstRun ? 1 : 0,
      ],
    );
  } catch (err) {
    console.warn("[analyze-metrics] insert failed", err.message);
  }
}

module.exports = { recordMetrics };
