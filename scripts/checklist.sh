#!/usr/bin/env bash
set -euo pipefail
RED=$(printf '\033[31m'); GREEN=$(printf '\033[32m'); YELLOW=$(printf '\033[33m'); NC=$(printf '\033[0m')
ok(){ echo "${GREEN}✔${NC} $*"; }
warn(){ echo "${YELLOW}●${NC} $*"; }
bad(){ echo "${RED}✖${NC} $*"; }

# Env keys
need=(DISCORD_TOKEN DB_HOST DB_NAME DB_USER DB_PASSWORD GOOGLE_APPLICATION_CREDENTIALS SHEETS_PARENT_FOLDER_ID)
miss=0
for k in "${need[@]}"; do
  if grep -qE "^$k=" .env; then ok ".env has $k"; else warn ".env missing $k"; miss=1; fi
done

# DB ping
node - <<'NODE' >/dev/null && echo -e "DB: ${GREEN}ok${NC}" || { echo -e "DB: ${RED}fail${NC}"; exit 1; }
require('dotenv').config();
const m=require('mysql2/promise');
(async()=>{const db=await m.createConnection({
  host:process.env.DB_HOST, port:+(process.env.DB_PORT||3306),
  user:process.env.DB_USER, password:process.env.DB_PASSWORD, database:process.env.DB_NAME
}); await db.query('SELECT 1'); await db.end();})();
NODE

# Consent summary quick look
mysql -e "SELECT * FROM v_guild_consent_summary ORDER BY pct_effective DESC, consent_on DESC, guild_name LIMIT 10" "${DB_NAME:-s26873_slimy}" >/dev/null 2>&1 && ok "consent summary view" || warn "consent summary view not available"

# Sheets append test (non-fatal)
node scripts/verify-sheets.js >/dev/null 2>&1 && ok "sheets append test" || warn "sheets append test skipped/failed"

# PM2 state
pm2 ls >/dev/null 2>&1 && ok "PM2 running" || warn "PM2 not running"
