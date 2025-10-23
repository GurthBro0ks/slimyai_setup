const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const baseSheets = require("./sheets");
const { getLatestForGuild } = require("./club-store");
const guildSettings = require("./guild-settings");
const logger = require("./logger");

const DEFAULT_TAB = process.env.GOOGLE_SHEETS_TAB_LATEST || "Club Latest";

function ensureCredentialsConfigured() {
  if (!baseSheets.hasCredentials()) {
    throw new Error("Google Sheets credentials not configured");
  }
}

function readServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    try {
      return JSON.parse(raw);
    } catch {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const resolved = path.resolve(
      process.cwd(),
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    );
    if (!fs.existsSync(resolved)) {
      throw new Error(`Service account file not found: ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  }

  throw new Error("No Google service account configured");
}

function getSheetsClient() {
  const credentials = readServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureTabExists(sheets, spreadsheetId, sheetName) {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title,sheetId))",
  });

  const existing = data.sheets?.find(
    (sheet) => sheet?.properties?.title === sheetName,
  );
  if (existing) return existing.properties.sheetId;

  logger.info("[club-sheets] Creating sheet tab", { sheetName });

  const { data: updateData } = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: {
                rowCount: 500,
                columnCount: 6,
              },
            },
          },
        },
      ],
    },
  });

  const sheetId = updateData?.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error("Failed to create sheet tab");
  }

  return sheetId;
}

function sortByTotalPower(rows) {
  return rows.slice().sort((a, b) => {
    const aVal =
      a.total_power === null || typeof a.total_power === "undefined"
        ? null
        : Number(a.total_power);
    const bVal =
      b.total_power === null || typeof b.total_power === "undefined"
        ? null
        : Number(b.total_power);

    if (bVal === null && aVal === null)
      return a.name_display.localeCompare(b.name_display);
    if (bVal === null) return -1;
    if (aVal === null) return 1;
    if (bVal !== aVal) return bVal - aVal;
    return a.name_display.localeCompare(b.name_display);
  });
}

function formatCellNumber(value) {
  if (value === null || typeof value === "undefined") return "";
  const num = Number(value);
  return Number.isFinite(num) ? num : "";
}

function formatCellPercent(value) {
  if (value === null || typeof value === "undefined") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return Math.round(num * 100) / 100;
}

async function pushLatest(guildId) {
  ensureCredentialsConfigured();
  const { sheetId: spreadsheetId, url: sheetUrl } =
    await guildSettings.getSheetConfig(guildId);

  if (!spreadsheetId) {
    throw new Error(
      "Club spreadsheet is not configured. Use /club-admin stats url:<link> or set GOOGLE_SHEETS_SPREADSHEET_ID.",
    );
  }

  const sheetName = DEFAULT_TAB;
  const sheets = getSheetsClient();

  logger.info("[club-sheets] Preparing to push latest", {
    guildId,
    spreadsheetId,
    sheetUrl: sheetUrl || null,
    sheetName,
  });

  let sheetTabId;
  try {
    sheetTabId = await ensureTabExists(sheets, spreadsheetId, sheetName);
  } catch (err) {
    logger.error("[club-sheets] Failed to ensure tab exists", {
      guildId,
      spreadsheetId,
      sheetName,
      error: err.message,
    });
    const wrapped = new Error(
      `Failed to verify or create tab "${sheetName}" on the configured spreadsheet.`,
    );
    wrapped.cause = err;
    throw wrapped;
  }

  const latestRows = await getLatestForGuild(guildId);
  const sorted = sortByTotalPower(latestRows);

  const values = [
    ["Name", "SIM Power", "Total Power", "Change % from last week"],
  ];

  for (const row of sorted) {
    values.push([
      row.name_display,
      formatCellNumber(row.sim_power),
      formatCellNumber(row.total_power),
      formatCellPercent(row.total_pct_change),
    ]);
  }

  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A:D`,
    });
    logger.info("[club-sheets] Cleared previous latest range", {
      guildId,
      spreadsheetId,
      sheetName,
      clearedRange: "A:D",
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:D${values.length}`,
      valueInputOption: "RAW",
      resource: {
        values,
      },
    });
  } catch (err) {
    logger.error("[club-sheets] Failed to push latest club data", {
      guildId,
      spreadsheetId,
      sheetName,
      error: err.message,
      code: err.code || err?.response?.status || null,
    });
    const isPermError =
      err?.code === 403 ||
      err?.status === 403 ||
      err?.response?.status === 403;
    const message = isPermError
      ? "Google Sheets sync failed: share the spreadsheet with the bot's service account email."
      : `Google Sheets sync failed: ${err.message}`;
    const wrapped = new Error(message);
    wrapped.cause = err;
    wrapped.code = err.code || err?.response?.status || null;
    throw wrapped;
  }

  const rowCount = Math.max(0, values.length - 1);

  const resolvedUrl =
    sheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  logger.info("[club-sheets] Pushed latest club data", {
    guildId,
    rowCount,
    spreadsheetId,
    sheetName,
    sheetTabId,
  });

  return {
    ok: true,
    rowCount,
    sheetName,
    spreadsheetId,
    sheetTabId,
    sheetUrl: resolvedUrl,
  };
}

module.exports = {
  pushLatest,
};
