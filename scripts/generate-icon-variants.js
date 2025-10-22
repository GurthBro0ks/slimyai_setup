const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ICON_REGEX = /^(gear|relic)_(\w+?)_(.+?)\.(png|jpe?g)$/i;
const root = path.resolve(__dirname, "..", "icons");

async function main() {
  if (!fs.existsSync(root)) {
    console.error("[generate-icon-variants] icons directory not found");
    process.exit(1);
  }

  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(ICON_REGEX);
    if (!match) continue;

    const [, type, slot, canon] = match;
    const slug = makeSlug(canon);
    const targetDir = path.join(root, type.toLowerCase(), slug);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const source = path.join(root, entry.name);
    await ensureVariant(path.join(targetDir, "base.png"), () =>
      copyFile(source),
    );
    await ensureVariant(
      path.join(targetDir, `${slot.toLowerCase()}-bright.png`),
      () => transform(source, { brightness: 1.1, saturation: 1.05 }),
    );
    await ensureVariant(
      path.join(targetDir, `${slot.toLowerCase()}-contrast.png`),
      () => transform(source, { brightness: 0.95, contrast: 1.2 }),
    );
  }
  console.log("[generate-icon-variants] Variants ensured.");
}

async function copyFile(src) {
  const buf = await fs.promises.readFile(src);
  return buf;
}

async function transform(
  src,
  { brightness = 1, saturation = 1, contrast = 1 },
) {
  const pipeline = sharp(src)
    .ensureAlpha()
    .resize({ width: 128, height: 128, fit: "cover" })
    .modulate({
      brightness,
      saturation,
    });
  return pipeline
    .linear([contrast, contrast, contrast, 1], [0, 0, 0, 0])
    .png()
    .toBuffer();
}

async function ensureVariant(dest, producer) {
  try {
    await fs.promises.access(dest, fs.constants.F_OK);
    return;
  } catch (_) {
    // continue
  }
  const buf = await producer();
  await fs.promises.writeFile(dest, buf);
  console.log("[generate-icon-variants] wrote", path.relative(root, dest));
}

function makeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main().catch((err) => {
  console.error("[generate-icon-variants] failed:", err);
  process.exit(1);
});
