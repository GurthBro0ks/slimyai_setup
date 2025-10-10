require('dotenv').config();
const {google} = require('googleapis');
const m = require('mysql2/promise');

(async () => {
  const db = await m.createPool({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT||3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });
  const [rows] = await db.query(
    "SELECT user_id, guild_id, sheet_id FROM user_guilds WHERE sheet_id IS NOT NULL AND sheet_id<>'' LIMIT 1"
  );
  if (!rows.length) { console.log('ℹ️ No sheet_id to verify yet.'); process.exit(0); }

  const {sheet_id, user_id, guild_id} = rows[0];

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({version:'v4', auth: client});

  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheet_id,
    range: 'Analysis Log!A:F',
    valueInputOption: 'RAW',
    requestBody: { values: [[now, user_id, guild_id, '', 'verify-ok', '']] }
  });

  console.log('✅ Append ok on sheet:', sheet_id);
  process.exit(0);
})().catch(e => { console.error('❌', e.response?.data || e); process.exit(1); });
