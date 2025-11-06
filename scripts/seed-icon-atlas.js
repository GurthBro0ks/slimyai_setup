const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const db = require("../lib/database");
const { normalizeAndHash } = require("../lib/icon-hash");

(async () => {
  const dir = "./icons";
  if (!fs.existsSync(dir)) {
    console.log("No ./icons folder to seed from.");
    process.exit(0);
  }
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
  for (const f of files) {
    const m = f.match(/^(gear|relic)_(\w+?)_(.+?)\.(png|jpe?g)$/i);
    if (!m) {
      console.log("skip", f);
      continue;
    }
    const [, item_type, item_slot, canonical_name] = m;
    const buf = fs.readFileSync(path.join(dir, f));
    const { phash } = await normalizeAndHash(buf);
    const meta = await sharp(buf).metadata();
    try {
      await db.query(
        `INSERT INTO snail_item_icons (item_type,item_slot,canonical_name,phash,width,height)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE phash=VALUES(phash), width=VALUES(width), height=VALUES(height)`,
        [
          item_type.toLowerCase(),
          item_slot,
          canonical_name.replace(/_/g, " "),
          phash,
          meta.width || 64,
          meta.height || 64,
        ],
      );
      console.log("seeded", f);
    } catch (e) {
      console.log("skip/dup", f, e.message);
    }
  }
  process.exit(0);
})();
