"use strict";

const fs = require("fs/promises");
const path = require("path");

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, serialized, "utf8");
}

module.exports = { readJson, writeJson };
