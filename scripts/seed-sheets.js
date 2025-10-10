require('dotenv').config();
const {google} = require('googleapis');
const m = require('mysql2/promise');
const { createSnailStatsSheet } = require('../lib/sheets-drive-create');

(async () => {
  if (!process.env.SHEETS_PARENT_FOLDER_ID) throw new Error('SHEETS_PARENT_FOLDER_ID missing');
  const db = await m.createPool({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT||3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });

  const [rows] = await db.query(`
    SELECT u.user_id, u.username, ug.guild_id, g.guild_name, ug.sheet_id
    FROM users u
    JOIN user_guilds ug ON ug.user_id = u.user_id
    LEFT JOIN guilds g   ON g.guild_id = ug.guild_id
    WHERE u.global_consent = 1
  `);

  let created=0, skipped=0;
  for (const r of rows) {
    if (r.sheet_id && r.sheet_id.trim()) { skipped++; continue; }
    const spreadsheetId = await createSnailStatsSheet({
      username: r.username, userId: r.user_id, guildId: r.guild_id, guildName: r.guild_name
    });
    await db.query('UPDATE user_guilds SET sheet_id=? WHERE user_id=? AND guild_id=?',
                   [spreadsheetId, r.user_id, r.guild_id]);
    created++;
  }
  console.log(`✅ Seed complete. Created ${created}, skipped ${skipped}.`);
  process.exit(0);
})().catch(e => { console.error('❌', e.response?.data || e); process.exit(1); });
