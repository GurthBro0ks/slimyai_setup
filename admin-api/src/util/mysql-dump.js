"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseDatabaseUrl(dbUrlValue) {
  if (!dbUrlValue) {
    throw new Error("DB_URL is not configured");
  }
  return new URL(dbUrlValue);
}

function ensureDirectory(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function runMysqlDump(options = {}, handlers = {}) {
  return new Promise((resolve, reject) => {
    const outputPath = options.outputPath;
    if (!outputPath) {
      return reject(new Error("outputPath is required for backup"));
    }

    const dbUrlValue = options.dbUrl || process.env.DB_URL || process.env.DATABASE_URL;
    const parsed = parseDatabaseUrl(dbUrlValue);
    const database = parsed.pathname.replace(/^\//, "");
    if (!database) {
      return reject(new Error("Database name missing in DB_URL"));
    }

    ensureDirectory(path.dirname(outputPath));

    handlers.onStdout?.(`backup: writing to ${outputPath}`);

    const dumpArgs = [
      "-h",
      parsed.hostname,
      "-P",
      parsed.port || "3306",
      "-u",
      decodeURIComponent(parsed.username || ""),
      "--single-transaction",
      "--hex-blob",
      "--routines",
      "--triggers",
      "--skip-lock-tables",
      "--set-gtid-purged=OFF",
      database,
    ];

    const spawnEnv = { ...process.env };
    if (parsed.password) {
      spawnEnv.MYSQL_PWD = decodeURIComponent(parsed.password);
    }

    const dump = spawn("mysqldump", dumpArgs, {
      env: spawnEnv,
    });
    const gzip = spawn("gzip", ["-c"]);

    dump.stdout.pipe(gzip.stdin);

    dump.stderr.on("data", (chunk) => {
      handlers.onStderr?.(chunk.toString());
    });

    gzip.stderr.on("data", (chunk) => {
      handlers.onStderr?.(chunk.toString());
    });

    const outputStream = fs.createWriteStream(outputPath);
    gzip.stdout.pipe(outputStream);

    const cleanupOnError = (err) => {
      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch {
        // ignore cleanup errors
      }
      reject(err);
    };

    dump.on("error", cleanupOnError);
    gzip.on("error", cleanupOnError);
    outputStream.on("error", cleanupOnError);

    let dumpCode = null;
    let gzipCode = null;

    const finalize = () => {
      if (dumpCode === 0 && gzipCode === 0) {
        handlers.onStdout?.("backup: mysqldump completed successfully");
        resolve({ exitCode: 0 });
      } else if (dumpCode !== null && dumpCode !== 0) {
        cleanupOnError(new Error(`mysqldump exited with code ${dumpCode}`));
      } else if (gzipCode !== null && gzipCode !== 0) {
        cleanupOnError(new Error(`gzip exited with code ${gzipCode}`));
      }
    };

    dump.on("close", (code) => {
      dumpCode = code;
      finalize();
    });

    gzip.on("close", (code) => {
      gzipCode = code;
      finalize();
    });
  });
}

module.exports = {
  runMysqlDump,
};
