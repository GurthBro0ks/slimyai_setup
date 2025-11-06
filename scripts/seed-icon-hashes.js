const fs = require("fs");
const path = require("path");
require("dotenv").config();
const db = require("../lib/database");
const { normalize64 } = require("../lib/icon-hash");

const atlasRoot = path.resolve(__dirname, "..", "icons");
let lookup = new Map();
let seededCount = 0;

async function main() {
  if (!fs.existsSync(atlasRoot)) {
    console.log(
      "[seed-icon-hashes] No ./icons directory found, nothing to seed.",
    );
    return;
  }

  if (!db.isConfigured || !db.isConfigured()) {
    console.warn(
      "[seed-icon-hashes] Database not configured; skipping seed run.",
    );
    return;
  }

  const rows = await db.query(
    "SELECT id, canonical_name, item_type FROM snail_item_icons",
  );
  lookup = buildLookup(rows);

  await seedFromFolder("gear");
  await seedFromFolder("relic");
  await seedFlatFiles();

  console.log(`[seed-icon-hashes] Seeded ${seededCount} hash variants.`);
}

function buildLookup(rows) {
  const map = new Map();
  for (const row of rows) {
    const slug = makeSlug(row.canonical_name);
    map.set(makeKey(row.item_type, slug), {
      id: row.id,
      canonicalName: row.canonical_name,
      itemType: row.item_type,
    });
  }
  return map;
}

async function seedFromFolder(type) {
  const typeDir = path.join(atlasRoot, type);
  if (!fs.existsSync(typeDir)) return;

  const entries = await fs.promises.readdir(typeDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await seedDirectory(type, entry.name, path.join(typeDir, entry.name));
    } else if (entry.isFile()) {
      await seedFile(type, entry.name, path.join(typeDir, entry.name));
    }
  }
}

async function seedDirectory(type, name, dirPath) {
  const item = resolveItem(type, name);
  if (!item) {
    console.warn(
      `[seed-icon-hashes] Unknown ${type} directory "${name}", skipping.`,
    );
    return;
  }
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    await seedVariantFile(item, path.join(dirPath, file.name));
  }
}

async function seedFile(type, fileName, filePath) {
  const info = parseFlatFile(type, fileName);
  if (!info) return;
  const item = resolveItem(type, info.itemName);
  if (!item) {
    console.warn(
      `[seed-icon-hashes] No DB item for ${type} "${info.itemName}", skipping ${fileName}.`,
    );
    return;
  }
  await seedVariantFile(item, filePath);
}

async function seedFlatFiles() {
  const entries = await fs.promises.readdir(atlasRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^(gear|relic)/i);
    if (!match) continue;
    const type = match[1].toLowerCase();
    await seedFile(type, entry.name, path.join(atlasRoot, entry.name));
  }
}

async function seedVariantFile(item, variantPath) {
  if (!/\.(png|jpe?g)$/i.test(variantPath)) return;
  try {
    const buf = await fs.promises.readFile(variantPath);
    const { phash, ahsv } = await normalize64(buf, {
      trim: 0.12,
      unsharp: true,
    });
    await db.query(
      `INSERT IGNORE INTO snail_item_icon_hashes (item_id, phash, ahsv)
       VALUES (?, ?, ?)`,
      [item.id, phash, ahsv],
    );
    seededCount += 1;
    console.log(
      `[seed-icon-hashes] Seeded ${item.itemType} ${item.canonicalName} <- ${path.relative(atlasRoot, variantPath)}`,
    );
  } catch (err) {
    console.warn(
      `[seed-icon-hashes] Failed to seed ${variantPath}: ${err.message}`,
    );
  }
}

function resolveItem(type, rawName) {
  const attempts = new Set([
    makeSlug(rawName),
    makeSlug(rawName.replace(/_/g, " ")),
    makeSlug(rawName.replace(/-/g, " ")),
  ]);

  for (const slug of attempts) {
    const key = makeKey(type, slug);
    if (lookup.has(key)) return lookup.get(key);
  }
  return null;
}

function parseFlatFile(type, fileName) {
  const parts = fileName.replace(/\.(png|jpe?g)$/i, "").split("_");
  if (!parts.length) return null;
  if (parts[0].toLowerCase() !== type) return null;
  if (parts.length < 3) {
    return { itemName: parts.slice(1).join("_") };
  }
  return { itemName: parts.slice(2).join("_") };
}

function makeKey(type, slug) {
  return `${type.toLowerCase()}|${slug}`;
}

function makeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed-icon-hashes] Unhandled error:", err);
    process.exit(1);
  },
);
