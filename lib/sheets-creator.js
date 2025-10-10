// lib/sheets-creator.js - Auto-create Google Sheets for slimy.ai v2.0
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const DRIVE_FILE_FIELDS = 'id,name,parents,appProperties,webViewLink';

function getConfiguredFolderId(explicitFolderId) {
  const envValue = process.env.SHEETS_PARENT_FOLDER_ID || process.env.GOOGLE_SHEETS_FOLDER_ID;
  const folderId = explicitFolderId || (envValue ? envValue.trim() : '');
  return folderId || null;
}

function buildAppProperties({ userId, guildId, username, guildName }) {
  const props = {};
  if (userId) props.userId = String(userId);
  if (guildId) props.guildId = String(guildId);
  if (username) props.username = String(username);
  if (guildName) props.guildName = String(guildName);
  return props;
}

async function moveFileToFolder({ drive, fileId, folderId }) {
  if (!folderId) return;

  const currentParentsResponse = await drive.files.get({
    fileId,
    fields: 'parents',
    supportsAllDrives: true
  });

  const parents = currentParentsResponse.data.parents || [];
  const needsAdd = !parents.includes(folderId);
  const removeParents = parents.filter(parentId => parentId !== folderId);

  if (!needsAdd && removeParents.length === 0) {
    return;
  }

  const updatePayload = {
    fileId,
    supportsAllDrives: true
  };

  if (needsAdd) {
    updatePayload.addParents = folderId;
  }

  if (removeParents.length > 0) {
    updatePayload.removeParents = removeParents.join(',');
  }

  await drive.files.update(updatePayload);
}

async function updateFileMetadata({ drive, fileId, name, appProperties }) {
  const requestBody = {};
  if (name) requestBody.name = name;
  if (appProperties && Object.keys(appProperties).length) {
    requestBody.appProperties = appProperties;
  }

  if (Object.keys(requestBody).length === 0) {
    return;
  }

  await drive.files.update({
    fileId,
    requestBody,
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true
  });
}

async function ensureDriveMetadata({ drive, fileId, folderId, name, appProperties }) {
  await updateFileMetadata({ drive, fileId, name, appProperties });
  if (folderId) {
    await moveFileToFolder({ drive, fileId, folderId });
  }
}

async function findExistingSpreadsheet({ drive, userId, guildId, folderId, title }) {
  const queryParts = [`mimeType='${SPREADSHEET_MIME_TYPE}'`];
  if (folderId) {
    queryParts.push(`'${folderId}' in parents`);
  }
  if (userId) {
    queryParts.push(`appProperties has { key='userId' and value='${userId}' }`);
  }
  if (guildId) {
    queryParts.push(`appProperties has { key='guildId' and value='${guildId}' }`);
  }

  const query = queryParts.join(' and ');

  const response = await drive.files.list({
    q: query,
    fields: `files(${DRIVE_FILE_FIELDS})`,
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const files = response.data.files || [];
  if (files.length > 0) {
    return files[0];
  }

  if (title) {
    const escapedTitle = title.replace(/'/g, "\\'");
    const fallbackQueryParts = [`mimeType='${SPREADSHEET_MIME_TYPE}'`, `name='${escapedTitle}'`];
    if (folderId) {
      fallbackQueryParts.push(`'${folderId}' in parents`);
    }

    const fallbackResponse = await drive.files.list({
      q: fallbackQueryParts.join(' and '),
      fields: `files(${DRIVE_FILE_FIELDS})`,
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    return fallbackResponse.data.files?.[0] || null;
  }

  return null;
}

/**
 * Get Google Sheets credentials
 */
function getCredentials() {
  // Try inline JSON first
  const inlineJSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inlineJSON) {
    try {
      return JSON.parse(inlineJSON);
    } catch {
      try {
        // Try base64-encoded JSON
        const decoded = Buffer.from(inlineJSON, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (err) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is neither valid JSON nor base64-encoded JSON');
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
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  }

  throw new Error('No Google credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON');
}

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
 * Get authenticated Google Sheets API client
 */
function getSheetsClient() {
  const credentials = getCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ]
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Get authenticated Google Drive API client
 */
function getDriveClient() {
  const credentials = getCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ]
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Create a new Google Sheet with proper structure for Super Snail stats
 * @param {Object} options
 * @param {string} options.title - Spreadsheet title
 * @param {string} options.userId - Discord user ID (for ownership tracking)
 * @param {string} options.username - Discord username
 * @param {string} options.guildId - Discord guild ID
 * @param {string} options.guildName - Discord guild name
 * @returns {Object} - { spreadsheetId, url, serviceAccountEmail }
 */
async function createSnailStatsSheet(options) {
  const {
    title,
    userId,
    username,
    guildId,
    guildName,
    parentFolderId
  } = options;

  if (!hasCredentials()) {
    throw new Error('Google Sheets credentials not configured');
  }

  try {
    const sheets = getSheetsClient();
    const drive = getDriveClient();
    const credentials = getCredentials();
    const folderId = getConfiguredFolderId(parentFolderId);

    // Create the spreadsheet
    const spreadsheetTitle = title || `${guildName} - Super Snail Stats - ${username}`;
    const appProperties = buildAppProperties({ userId, guildId, username, guildName });

    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: spreadsheetTitle
        },
        sheets: [
          {
            properties: {
              title: 'Stats History',
              gridProperties: {
                rowCount: 1000,
                columnCount: 14
              }
            }
          },
          {
            properties: {
              title: 'Analysis Log',
              gridProperties: {
                rowCount: 1000,
                columnCount: 10
              }
            }
          },
          {
            properties: {
              title: 'Info',
              gridProperties: {
                rowCount: 20,
                columnCount: 3
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = createResponse.data.spreadsheetId;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    // Add headers to Stats History sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Stats History!A1:N1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Timestamp',
          'User ID',
          'Username',
          'HP',
          'ATK',
          'DEF',
          'RUSH',
          'FAME',
          'TECH',
          'ART',
          'CIV',
          'FTH',
          'Screenshot URL',
          'Notes'
        ]]
      }
    });

    // Add headers to Analysis Log sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Analysis Log!A1:J1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Timestamp',
          'User ID',
          'Username',
          'Analysis Type',
          'Status',
          'Details',
          'AI Model Used',
          'Processing Time (ms)',
          'Error',
          'Screenshot URL'
        ]]
      }
    });

    // Add info to Info sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Info!A1:B10',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Spreadsheet Info', ''],
          ['Created By', 'slimy.ai Discord Bot'],
          ['Discord Server', guildName || 'Unknown'],
          ['Guild ID', guildId || 'Unknown'],
          ['Created For User', username || 'Unknown'],
          ['User ID', userId || 'Unknown'],
          ['Created At', new Date().toISOString()],
          ['Purpose', 'Super Snail Stats Tracking'],
          ['', ''],
          ['Instructions', 'Stats are automatically saved from /snail analyze command']
        ]
      }
    });

    // Format headers (bold)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0, // Stats History
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)'
            }
          },
          {
            repeatCell: {
              range: {
                sheetId: 1, // Analysis Log
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)'
            }
          }
        ]
      }
    });

    // Share with service account (ensure it has edit access)
    const serviceAccountEmail = credentials.client_email;

    await ensureDriveMetadata({
      drive,
      fileId: spreadsheetId,
      folderId,
      name: spreadsheetTitle,
      appProperties
    });

    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        type: 'user',
        role: 'writer',
        emailAddress: serviceAccountEmail
      },
      supportsAllDrives: true
    });

    console.log(`[sheets-creator] Created spreadsheet: ${spreadsheetUrl}`);

    return {
      spreadsheetId,
      url: spreadsheetUrl,
      serviceAccountEmail,
      title: spreadsheetTitle
    };

  } catch (err) {
    console.error('[sheets-creator] Error creating spreadsheet:', err.message);
    throw err;
  }
}

async function ensureSnailStatsSheet(options) {
  const {
    title,
    userId,
    username,
    guildId,
    guildName,
    parentFolderId
  } = options;

  if (!hasCredentials()) {
    throw new Error('Google Sheets credentials not configured');
  }

  const folderId = getConfiguredFolderId(parentFolderId);
  const spreadsheetTitle = title || `${guildName} - Super Snail Stats - ${username}`;
  const appProperties = buildAppProperties({ userId, guildId, username, guildName });
  const credentials = getCredentials();
  const drive = getDriveClient();

  try {
    const existing = await findExistingSpreadsheet({
      drive,
      userId,
      guildId,
      folderId,
      title: spreadsheetTitle
    });

    if (existing) {
      await ensureDriveMetadata({
        drive,
        fileId: existing.id,
        folderId,
        name: spreadsheetTitle,
        appProperties
      });

      return {
        spreadsheetId: existing.id,
        url: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}`,
        serviceAccountEmail: credentials.client_email,
        title: existing.name || spreadsheetTitle,
        existed: true
      };
    }
  } catch (err) {
    console.error('[sheets-creator] Error locating existing spreadsheet:', err.message);
  }

  const created = await createSnailStatsSheet({
    title: spreadsheetTitle,
    userId,
    username,
    guildId,
    guildName,
    parentFolderId: folderId
  });

  return { ...created, existed: false };
}

/**
 * Save stats to an existing spreadsheet
 * @param {Object} options
 * @param {string} options.spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} options.userId - Discord user ID
 * @param {string} options.username - Discord username
 * @param {Object} options.stats - Stats object {hp, atk, def, rush, fame, tech, art, civ, fth}
 * @param {string} options.screenshotUrl - Discord CDN URL to screenshot
 * @param {string} options.notes - Optional notes
 * @returns {boolean} - Success status
 */
async function saveStats(options) {
  const {
    spreadsheetId,
    userId,
    username,
    stats,
    screenshotUrl,
    notes = ''
  } = options;

  if (!hasCredentials()) {
    throw new Error('Google Sheets credentials not configured');
  }

  try {
    const sheets = getSheetsClient();

    const timestamp = new Date().toISOString();
    const row = [
      timestamp,
      userId,
      username,
      stats.hp ?? '',
      stats.atk ?? '',
      stats.def ?? '',
      stats.rush ?? '',
      stats.fame ?? '',
      stats.tech ?? '',
      stats.art ?? '',
      stats.civ ?? '',
      stats.fth ?? '',
      screenshotUrl || '',
      notes
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Stats History!A:N',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row]
      }
    });

    console.log(`[sheets-creator] Saved stats for ${username} to ${spreadsheetId}`);
    return true;

  } catch (err) {
    console.error('[sheets-creator] Error saving stats:', err.message);
    throw err;
  }
}

/**
 * Log analysis to spreadsheet
 * @param {Object} options
 * @param {string} options.spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} options.userId - Discord user ID
 * @param {string} options.username - Discord username
 * @param {string} options.analysisType - Type of analysis performed
 * @param {string} options.status - Status: 'success' or 'failed'
 * @param {string} options.details - Analysis details
 * @param {string} options.model - AI model used
 * @param {number} options.processingTime - Processing time in ms
 * @param {string} options.error - Error message (if failed)
 * @param {string} options.screenshotUrl - Screenshot URL
 * @returns {boolean} - Success status
 */
async function logAnalysis(options) {
  const {
    spreadsheetId,
    userId,
    username,
    analysisType,
    status,
    details,
    model,
    processingTime,
    error,
    screenshotUrl
  } = options;

  if (!hasCredentials()) {
    throw new Error('Google Sheets credentials not configured');
  }

  try {
    const sheets = getSheetsClient();

    const timestamp = new Date().toISOString();
    const row = [
      timestamp,
      userId,
      username,
      analysisType || 'snail-stats',
      status || 'success',
      details || '',
      model || 'gpt-4o',
      processingTime || '',
      error || '',
      screenshotUrl || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Analysis Log!A:J',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row]
      }
    });

    console.log(`[sheets-creator] Logged analysis for ${username} to ${spreadsheetId}`);
    return true;

  } catch (err) {
    console.error('[sheets-creator] Error logging analysis:', err.message);
    throw err;
  }
}

/**
 * Test spreadsheet access
 */
async function testAccess(spreadsheetId) {
  if (!hasCredentials()) {
    throw new Error('Google Sheets credentials not configured');
  }

  try {
    const sheets = getSheetsClient();

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties(title),sheets(properties(title))'
    });

    return {
      success: true,
      title: response.data.properties.title,
      sheets: response.data.sheets.map(s => s.properties.title)
    };

  } catch (err) {
    console.error('[sheets-creator] Access test failed:', err.message);
    throw err;
  }
}

module.exports = {
  hasCredentials,
  createSnailStatsSheet,
  ensureSnailStatsSheet,
  saveStats,
  logAnalysis,
  testAccess
};
module.exports.createSnailStatsSheet = require('./sheets-drive-create').createSnailStatsSheet;
