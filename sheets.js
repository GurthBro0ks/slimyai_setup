// lib/sheets.js - Google Sheets integration for Super Snail stats
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

/**
 * Check if Google Sheets credentials are configured
 */
function hasCredentials() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  );
}

/**
 * Get credentials setup instructions
 */
function getSetupInstructions() {
  return `
📋 **Google Sheets Setup Instructions**

To save Super Snail stats to Google Sheets, you need:

1. **Create a Google Cloud Project:**
   - Go to https://console.cloud.google.com
   - Create a new project or select existing

2. **Enable Google Sheets API:**
   - In your project, go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

3. **Create Service Account:**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Name it "slimy-bot" and create
   - Click on the service account, go to "Keys" tab
   - Click "Add Key" > "Create new key" > JSON
   - Download the JSON file

4. **Configure Environment Variables:**

   **Option A:** Save the JSON file as google-service-account.json in bot directory
   \`\`\`bash
   # In .env file:
   GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json
   SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
   \`\`\`

   **Option B:** Use inline JSON (for Pterodactyl/Docker)
   \`\`\`bash
   # In .env file:
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
   SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
   \`\`\`

5. **Create Spreadsheet & Share:**
   - Create a new Google Sheet
   - Copy the spreadsheet ID from the URL
   - Share the sheet with the service account email (found in JSON file)
   - Give it "Editor" access

6. **Restart Bot:**
   \`\`\`bash
   pm2 restart slimy-bot
   \`\`\`
`;
}

/**
 * Read service account credentials from environment
 */
function _readServiceAccountCreds() {
  // Try inline JSON first
  const inlineJSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inlineJSON) {
    try {
      return JSON.parse(inlineJSON);
    } catch {
      try {
        // Try base64-encoded JSON
        const decoded = Buffer.from(inlineJSON, "base64").toString("utf8");
        return JSON.parse(decoded);
      } catch {
        throw new Error(
          "GOOGLE_SERVICE_ACCOUNT_JSON is neither valid JSON nor base64-encoded JSON",
        );
      }
    }
  }

  // Try file path
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFilePath) {
    const fullPath = path.resolve(process.cwd(), keyFilePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Service account file not found at: ${fullPath}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  }

  throw new Error(
    "No Google credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON",
  );
}

/**
 * Get authenticated Google Sheets client
 */
function _getAuthenticatedClient() {
  const credentials = _readServiceAccountCreds();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Ensure the "Super Snail Stats" sheet exists
 */
async function _ensureSheetExists(sheets, spreadsheetId) {
  const SHEET_NAME = "Super Snail Stats";

  try {
    // Get spreadsheet metadata
    const { data } = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title,sheetId))",
    });

    // Check if sheet exists
    const sheetExists = data.sheets?.some(
      (s) => s.properties.title === SHEET_NAME,
    );

    if (!sheetExists) {
      console.log(`[sheets] Creating "${SHEET_NAME}" sheet...`);

      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_NAME,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 13,
                  },
                },
              },
            },
          ],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:M1`,
        valueInputOption: "RAW",
        resource: {
          values: [
            [
              "Timestamp",
              "User ID",
              "Username",
              "HP",
              "ATK",
              "DEF",
              "RUSH",
              "FAME",
              "TECH",
              "ART",
              "CIV",
              "FTH",
              "Screenshot URL",
            ],
          ],
        },
      });

      console.log(`[sheets] Created "${SHEET_NAME}" sheet with headers`);
    }

    return SHEET_NAME;
  } catch (err) {
    console.error("[sheets] Error ensuring sheet exists:", err.message);
    throw err;
  }
}

/**
 * Save Super Snail stats to Google Sheets
 * @param {Object} options
 * @param {string} options.userId - Discord user ID
 * @param {string} options.username - Discord username
 * @param {Object} options.stats - Stats object {hp, atk, def, rush, fame, tech, art, civ, fth}
 * @param {string} options.screenshotUrl - Discord CDN URL to screenshot
 * @param {number} [options.timestamp] - Unix timestamp (defaults to now)
 */
async function saveSnailStats({
  userId,
  username,
  stats,
  screenshotUrl,
  timestamp,
}) {
  if (!hasCredentials()) {
    throw new Error("Google Sheets credentials not configured");
  }

  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("SHEETS_SPREADSHEET_ID not set in .env");
  }

  try {
    const sheets = _getAuthenticatedClient();
    const sheetName = await _ensureSheetExists(sheets, spreadsheetId);

    // Prepare row data
    const ts = timestamp ? new Date(timestamp) : new Date();
    const row = [
      ts.toISOString(),
      userId,
      username,
      stats.hp ?? "",
      stats.atk ?? "",
      stats.def ?? "",
      stats.rush ?? "",
      stats.fame ?? "",
      stats.tech ?? "",
      stats.art ?? "",
      stats.civ ?? "",
      stats.fth ?? "",
      screenshotUrl || "",
    ];

    // Append row to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:M`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [row],
      },
    });

    console.log(`[sheets] Saved stats for ${username} (${userId})`);
    return { success: true, sheetName };
  } catch (err) {
    console.error("[sheets] Error saving stats:", err.message);
    throw err;
  }
}

/**
 * Retrieve recent stats from Google Sheets
 * @param {Object} options
 * @param {string} [options.userId] - Filter by user ID (optional)
 * @param {number} [options.limit] - Number of entries to return (default: 5)
 */
async function getRecentStats({ userId, limit = 5 } = {}) {
  if (!hasCredentials()) {
    throw new Error("Google Sheets credentials not configured");
  }

  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("SHEETS_SPREADSHEET_ID not set in .env");
  }

  try {
    const sheets = _getAuthenticatedClient();
    const sheetName = "Super Snail Stats";

    // Fetch all data
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:M`,
    });

    const rows = data.values || [];
    if (rows.length <= 1) {
      return []; // No data (only headers or empty)
    }

    // Parse rows (skip header)
    const headers = rows[0];
    const entries = rows.slice(1).map((row) => ({
      timestamp: row[0] || "",
      userId: row[1] || "",
      username: row[2] || "",
      stats: {
        hp: row[3] || null,
        atk: row[4] || null,
        def: row[5] || null,
        rush: row[6] || null,
        fame: row[7] || null,
        tech: row[8] || null,
        art: row[9] || null,
        civ: row[10] || null,
        fth: row[11] || null,
      },
      screenshotUrl: row[12] || "",
    }));

    // Filter by userId if specified
    let filtered = userId
      ? entries.filter((e) => e.userId === userId)
      : entries;

    // Sort by timestamp descending (most recent first)
    filtered.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // Limit results
    return filtered.slice(0, limit);
  } catch (err) {
    console.error("[sheets] Error retrieving stats:", err.message);
    throw err;
  }
}

module.exports = {
  hasCredentials,
  getSetupInstructions,
  saveSnailStats,
  getRecentStats,
};
