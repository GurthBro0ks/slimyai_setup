const fs = require("fs");
const path = require("path");

const STORE_DIR = path.join(__dirname, "..", "var");
const STORE_PATH = path.join(STORE_DIR, "personality-adjustments.json");

function ensureDir() {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function loadAdjustments() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = safeParse(raw, {});
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // ignore read errors (file likely missing)
  }
  return {};
}

function saveAdjustments(data) {
  ensureDir();
  const payload = {};
  for (const [key, record] of Object.entries(data || {})) {
    if (!key) continue;
    if (
      record &&
      typeof record === "object" &&
      typeof record.value !== "undefined"
    ) {
      payload[key] = {
        value: record.value,
        updatedAt: Number(record.updatedAt) || Date.now(),
        updatedBy: record.updatedBy || null,
        updatedByTag: record.updatedByTag || null,
      };
    }
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2));
}

function setAdjustment(parameter, value, metadata = {}) {
  if (!parameter) return null;
  const adjustments = loadAdjustments();
  adjustments[parameter] = {
    value,
    updatedAt: Date.now(),
    updatedBy: metadata.updatedBy || null,
    updatedByTag: metadata.updatedByTag || null,
  };
  saveAdjustments(adjustments);
  return adjustments[parameter];
}

function clearAdjustment(parameter) {
  if (!parameter) return false;
  const adjustments = loadAdjustments();
  if (!(parameter in adjustments)) return false;
  delete adjustments[parameter];
  saveAdjustments(adjustments);
  return true;
}

function getAllAdjustments() {
  return loadAdjustments();
}

function mergeAdjustments(config) {
  const adjustments = loadAdjustments();
  return {
    ...(config || {}),
    adjustments,
  };
}

module.exports = {
  STORE_PATH,
  loadAdjustments,
  saveAdjustments,
  setAdjustment,
  clearAdjustment,
  getAllAdjustments,
  mergeAdjustments,
};
