#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const database = require("../lib/database");

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

function writeFileSync(targetPath, contents) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
}

function toCsv(rows, header) {
  const safe = (value) => {
    if (value === null || typeof value === "undefined") return "";
    const text = String(value);
    if (text.includes(",") || text.includes("\"")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => safe(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function exportData(outDir) {
  await database.initialize();

  const guilds = await database.query(
    "SELECT guild_id FROM guilds ORDER BY guild_id ASC",
  );

  const header = [
    "id",
    "guild_id",
    "week_id",
    "member_key",
    "display_name",
    "metric",
    "value",
    "reason",
    "source",
    "created_by",
    "created_at",
  ];

  for (const guild of guilds) {
    const guildId = guild.guild_id;
    const corrections = await database.query(
      `SELECT id, guild_id, week_id, member_key, display_name, metric, value, reason, source, created_by, created_at
         FROM club_corrections
        WHERE guild_id = ?
        ORDER BY week_id DESC, display_name ASC, metric ASC`,
      [guildId],
    );

    const personalityRows = await database.query(
      `SELECT profile_json
         FROM guild_personality
        WHERE guild_id = ?
        LIMIT 1`,
      [guildId],
    );

    const guildDir = path.join(outDir, guildId);

    writeFileSync(
      path.join(guildDir, "corrections.json"),
      JSON.stringify(corrections, null, 2),
    );
    writeFileSync(
      path.join(guildDir, "corrections.csv"),
      toCsv(corrections, header),
    );

    const personalityPayload = personalityRows[0]?.profile_json
      ? JSON.parse(personalityRows[0].profile_json)
      : {};
    writeFileSync(
      path.join(guildDir, "personality.json"),
      JSON.stringify(personalityPayload, null, 2),
    );
  }

  await database.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(
    args.out || args.output || path.join(process.cwd(), "out", "exports"),
  );

  await exportData(outDir);
}

main().catch((err) => {
  console.error("[export-admin-data] Failed:", err.message || err);
  process.exit(1);
});
