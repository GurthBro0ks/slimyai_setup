const { google } = require("googleapis");

async function appendRecommendations(spreadsheetId, sheetName, rows) {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({
    version: "v4",
    auth: await auth.getClient(),
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

function recsToRows(userTag, recs) {
  return recs.map((rec, idx) => [
    userTag,
    rec.bottleneck?.stat ?? "",
    rec.upgrade ?? rec.name ?? "",
    rec.cost ?? "",
    rec.expectedGain ?? "",
    idx + 1,
    rec.timeToComplete ?? "",
    rec.notes ?? "",
  ]);
}

module.exports = {
  appendRecommendations,
  recsToRows,
};
