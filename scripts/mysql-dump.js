#!/usr/bin/env node

"use strict";

const path = require("path");

const { runMysqlDump } = require("../admin-api/src/util/mysql-dump");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out || args.output;
  if (!outPath) {
    console.error("Usage: node scripts/mysql-dump.js --out /path/to/file.sql.gz");
    process.exit(1);
  }

  const resolved = path.resolve(outPath);
  await runMysqlDump(
    { outputPath: resolved },
    {
      onStdout: (line) => process.stdout.write(`${line}\n`),
      onStderr: (line) => process.stderr.write(`${line}\n`),
    },
  );
}

main().catch((err) => {
  console.error("[mysql-dump] Failed:", err.message || err);
  process.exit(1);
});
