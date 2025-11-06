const { google } = require("googleapis");

async function getClients() {
  const auth = new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
  const client = await auth.getClient();
  return {
    drive: google.drive({ version: "v3", auth: client }),
    sheets: google.sheets({ version: "v4", auth: client }),
  };
}

// Safe, idempotent creator; returns spreadsheetId
async function createSnailStatsSheet({
  username,
  userId,
  guildId: _guildId,
  guildName,
}) {
  const { drive, sheets } = await getClients();
  const parent = process.env.SHEETS_PARENT_FOLDER_ID;
  const title =
    `Super Snail Stats - ${username || userId}${guildName ? ` @ ${guildName}` : ""}`.slice(
      0,
      120,
    );

  const {
    data: { id: spreadsheetId },
  } = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: parent ? [parent] : undefined,
    },
    fields: "id",
  });

  // optional header
  await sheets.spreadsheets.values
    .update({
      spreadsheetId,
      range: "Analysis Log!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            "timestamp",
            "user_id",
            "guild_id",
            "file_url",
            "text",
            "confidence",
          ],
        ],
      },
    })
    .catch(() => {});

  return spreadsheetId;
}

module.exports = { createSnailStatsSheet };
