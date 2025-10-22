const fs = require("fs");
const path = require("path");

async function logUnknown(type, slot, buffer) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${type}_${slot || "unknown"}_${stamp}.png`;
    const target = path.join("var", "unknown_crops", name);
    fs.writeFileSync(target, buffer);
    console.log("[unknown-icon]", target);
  } catch (err) {
    console.warn("[unknown-icon] write failed:", err.message);
  }
}

module.exports = { logUnknown };
