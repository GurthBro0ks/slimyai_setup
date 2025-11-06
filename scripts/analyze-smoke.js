const fs = require("fs");
const sharp = require("sharp");
const { detectTypeAndRegions } = require("../lib/screen-detector");
const { extractRadar } = require("../lib/radar-extractor");
const {
  detectActiveLoadout,
  extractGearIcons,
} = require("../lib/loadout-extractor");
const { extractRelicIcons } = require("../lib/compass-extractor");
const layout = require("../lib/layouts/supersnail.json");

(async () => {
  const images = [
    { path: "./test_imgs/stats_main.png" },
    { path: "./test_imgs/loadout_gear.png" },
    { path: "./test_imgs/compass_relics.png" },
  ].filter((f) => fs.existsSync(f.path));

  if (!images.length) {
    console.log("No test images found in ./test_imgs/* — skipping.");
    process.exit(0);
  }

  for (const im of images) {
    const buf = fs.readFileSync(im.path);
    const meta = await sharp(buf).metadata();
    const { width: W, height: H } = meta;
    const det = await detectTypeAndRegions(buf);
    console.log("TYPE:", det.type, "W×H=", W, H);

    if (det.type === "STATS_MAIN") {
      const ocrFn = async () => ({
        FAME: 56460,
        TECH: 53509,
        ART: 54554,
        CIV: 53318,
        FTH: 54733,
      });
      const radar = await extractRadar(buf, det.rois, W, H, ocrFn);
      console.log("RADAR:", radar);
    }
    if (det.type === "LOADOUT_GEAR") {
      const slot = await detectActiveLoadout(buf, layout, W, H);
      const gear = await extractGearIcons(buf, layout.gear_slots, W, H);
      console.log("LOADOUT:", slot, gear);
    }
    if (det.type === "COMPASS_RELICS") {
      const rel = await extractRelicIcons(buf, layout.relic_slots, W, H);
      console.log("RELICS:", rel);
    }
  }
  process.exit(0);
})();
