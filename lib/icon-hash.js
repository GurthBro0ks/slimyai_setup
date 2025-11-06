const sharp = require("sharp");
const imghash = require("imghash");

async function normalize64(buffer, options = {}) {
  const opts = {
    square: true,
    trim: 0.14,
    unsharp: true,
    ...options,
  };

  const base = sharp(buffer).ensureAlpha();
  const meta = await base.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  let crop = {
    left: 0,
    top: 0,
    width,
    height,
  };

  if (opts.square && width > 0 && height > 0) {
    const side = Math.min(width, height);
    const left = Math.max(0, Math.floor((width - side) / 2));
    const top = Math.max(0, Math.floor((height - side) / 2));
    crop = { left, top, width: side, height: side };
  }

  if (opts.trim > 0 && crop.width > 0 && crop.height > 0) {
    const minSide = Math.min(crop.width, crop.height);
    const pad = Math.min(
      Math.max(0, Math.round(minSide * opts.trim)),
      Math.floor(minSide / 2),
    );
    if (pad > 0 && crop.width - 2 * pad > 4 && crop.height - 2 * pad > 4) {
      crop = {
        left: crop.left + pad,
        top: crop.top + pad,
        width: crop.width - 2 * pad,
        height: crop.height - 2 * pad,
      };
    }
  }

  const img = sharp(buffer)
    .ensureAlpha()
    .extract({
      left: crop.left,
      top: crop.top,
      width: Math.max(1, Math.floor(crop.width)),
      height: Math.max(1, Math.floor(crop.height)),
    });

  const processed = opts.unsharp ? img.sharpen().normalize() : img;

  const forHash = await processed.resize(64, 64, { fit: "cover" }).toBuffer();
  let phash = await imghash.hash(forHash, 32, "hex");
  if (phash.length > 64) {
    phash = phash.slice(0, 64);
  }

  const { data, info } = await sharp(forHash)
    .resize(32, 32)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bins = new Array(16).fill(0);
  const channels = info.channels;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const { h, s, v } = rgbToHsv(r, g, b);
    const hb = Math.min(3, Math.floor((h / 360) * 4));
    const vb = Math.min(3, Math.floor(v * 4));
    const sb = Math.min(3, Math.floor(s * 4));
    const idx = hb * 4 + vb; // 16 bins (4 hue * 4 value)
    const weight = 1 + sb * 0.5; // higher saturation contributes slightly more
    bins[idx] += weight;
  }

  const total = bins.reduce((acc, val) => acc + val, 0) || 1;
  const scaled = bins.map((val) =>
    Math.max(0, Math.min(9, Math.round((val / total) * 10))),
  );
  const ahsv = scaled.join("").padEnd(16, "0").slice(0, 16);

  return { phash, ahsv, buf: forHash };
}

function hamming64(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  const A = BigInt("0x" + a);
  const B = BigInt("0x" + b);
  let diff = A ^ B;
  let dist = 0n;
  while (diff) {
    dist += diff & 1n;
    diff >>= 1n;
  }
  return Number(dist);
}

function histDist16(a, b) {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 1;
  let sum = 0;
  for (let i = 0; i < 16; i += 1) {
    const left = Number(a[i]);
    const right = Number(b[i]);
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return 1;
    }
    sum += Math.abs(left - right);
  }
  const maxDiff = 9 * 16;
  return Math.min(1, sum / maxDiff);
}

async function normalizeAndHash(buffer, options = {}) {
  const result = await normalize64(buffer, options);
  return { phash: result.phash, buf: result.buf };
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

module.exports = { normalize64, normalizeAndHash, hamming64, histDist16 };
