# Admin Panel Deployment (admin.slimyai.xyz)

This document describes how to promote the Slimy Admin Panel from local development to the production host at `admin.slimyai.xyz`.

## 1. DNS & Pre-Requisites

1. Point the `admin.slimyai.xyz` A record in IONOS to the production server IP.
2. Ensure Node 18+, npm/pnpm, `mysqldump`, `gzip`, and either **Caddy** or **nginx + certbot** are installed (see sections below).
3. Copy `admin-api/.env.admin.production.example` to `/opt/slimy/app/admin-api/.env.admin.production` and fill in:
   - `JWT_SECRET` (32+ random characters)
   - Discord OAuth client credentials
   - `DB_URL` for the production MySQL instance
   - Paths to Google Sheets credentials (`GOOGLE_SHEETS_CREDENTIALS`)
   - `COOKIE_DOMAIN=admin.slimyai.xyz`, `COOKIE_SECURE=true`
   - `CORS_ENABLED=false`, `ALLOWED_ORIGIN=https://admin.slimyai.xyz`
   - Backup locations (defaults: `/var/backups/slimy/...`)
4. Update the Discord developer portal redirect URI to `https://admin.slimyai.xyz/api/auth/callback`.

## 2. One-Shot Bootstrap (Recommended Quick Start)

For a streamlined setup, use the bootstrap script which automates most of the manual steps below:

```bash
cd /opt/slimy/app
git pull
npm run admin:bootstrap
```

This script will:
- Create backup directories (`/var/backups/slimy/{mysql,data}`) with proper ownership
- Fix ownership of `admin-api` and `admin-ui` folders to `slimy:slimy`
- Create `.env.admin.production` from example (if missing) with sensible defaults
- Install and configure Caddy (default) or nginx (if `USE_NGINX=1`)
- Install systemd service units for `admin-api` and `admin-ui`
- Install Node dependencies and build the admin UI
- Enable and start the services
- Configure firewall rules (if ufw is present)

**After bootstrap completes:**

1. Edit the production environment file to fill in required secrets:
   ```bash
   nano /opt/slimy/app/admin-api/.env.admin.production
   ```
   Fill in: `JWT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DB_URL`, and `GOOGLE_SHEETS_CREDENTIALS`

2. Restart the services:
   ```bash
   sudo systemctl restart admin-api admin-ui
   ```

3. Verify deployment:
   ```bash
   # Check HTTP → HTTPS redirect
   curl -I http://admin.slimyai.xyz

   # Verify security headers
   curl -I https://admin.slimyai.xyz | egrep -i 'strict-transport|x-frame-options|x-content-type|referrer-policy|permissions-policy'

   # Check service status
   sudo systemctl status admin-api admin-ui
   ```

**Using nginx instead of Caddy:**
```bash
USE_NGINX=1 npm run admin:bootstrap
```

## 3. Reverse Proxy (TLS + HSTS)

### Option A – Caddy (recommended)

1. Install Caddy (`sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https` then follow https://caddyserver.com/docs/install).
2. Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`:
   ```bash
   sudo cp /opt/slimy/app/deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
3. Caddy will request certificates automatically and forward traffic:
   - API → `127.0.0.1:3080` with `flush_interval 100ms` for SSE
   - UI  → `127.0.0.1:3081`
4. Logs are written to `/var/log/caddy/admin.access.log` in JSON.

### Option B – nginx + certbot

1. Run the helper script (installs nginx & certbot, links the config, and obtains certs):
   ```bash
   sudo bash /opt/slimy/app/deploy/scripts/setup-nginx-admin.sh
   ```
2. The script copies `deploy/nginx-admin.conf`, enables the site, and requests certificates for `admin.slimyai.xyz`.
3. SSE is supported via `proxy_buffering off` and `proxy_read_timeout 3600s` on `/api/` and `/tasks/` locations.

## 4. Application Services

Two options are provided: **systemd** (preferred) or **PM2**.

### systemd

1. Copy unit files and reload:
   ```bash
   sudo cp /opt/slimy/app/deploy/systemd/admin-api.service /etc/systemd/system/
   sudo cp /opt/slimy/app/deploy/systemd/admin-ui.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```
2. Enable and start:
   ```bash
   sudo systemctl enable --now admin-api
   sudo systemctl enable --now admin-ui
   ```
   Each service reads `/opt/slimy/app/admin-api/.env.admin.production`, runs with `NODE_ENV=production`, restarts on failure, and logs via `journalctl -u admin-api` / `admin-ui`.

### PM2 (alternative)

1. Install PM2 (`npm install -g pm2`).
2. Start processes with the included configs:
   ```bash
   pm2 start /opt/slimy/app/deploy/pm2/admin-api.json
   pm2 start /opt/slimy/app/deploy/pm2/admin-ui.json
   pm2 save
   ```
   Set `ENV_FILE` to point at the production env file before starting.

## 5. Building the Admin UI

1. From `/opt/slimy/app` run:
   ```bash
   npm install
   npm run build # builds Next.js for production (if not already part of CI)
   ```
2. The systemd service uses `next start -p 3081 -r admin-ui` which serves the production build.

## 6. Security Defaults

- `admin-api` disables CORS unless `CORS_ENABLED=true`.
- Cookies are `secure`, `httpOnly`, `sameSite=lax`, and scoped to `admin.slimyai.xyz`.
- Helmet enforces HSTS (`max-age=31536000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
- Permissions-Policy locks down geolocation, microphone, and camera.
- SSE headers (`text/event-stream`, `Cache-Control: no-cache`) are compatible with the provided proxy configs.

## 7. Backups & Restores

### Manual/Scheduled Backups

- `scripts/backup.sh` performs:
  1. `mysqldump --single-transaction … | gzip` → `${BACKUP_MYSQL_DIR}/slimy-YYYYMMDD-HHMMSS.sql.gz`
  2. Exports per-guild corrections/personality JSON/CSV to `${BACKUP_DATA_DIR}/YYYYMMDD-HHMMSS/`
  3. Rotates files older than 14 days

- Example cron entry (`deploy/cron/backup`):
  ```bash
  ENV_FILE=/opt/slimy/app/admin-api/.env.admin.production /opt/slimy/app/scripts/backup.sh >> /var/log/slimy/backup.log 2>&1
  ```

### Restore Cheatsheet

- Restore database:
  ```bash
  gunzip -c /var/backups/slimy/mysql/slimy-YYYYMMDD-HHMMSS.sql.gz | \
    mysql -h <host> -P <port> -u <user> -p slimy
  ```
- Corrections/personality JSON/CSV can be re-imported via the Admin UI exports or directly via SQL.

## 8. Smoke Test Checklist

1. Visit `https://admin.slimyai.xyz` → TLS valid, HSTS header present.
2. Complete Discord OAuth; cookies appear with `Secure` + `SameSite=Lax` + domain `admin.slimyai.xyz`.
3. Run Verify/Recompute from the dashboard; SSE log stream works behind the proxy.
4. Download corrections/performance exports (CSV/JSON) from the Settings page.
5. Trigger “MySQL Dump” (owner view); watch logs stream and confirm a new file in `/var/backups/slimy`.
6. Restart services (`sudo systemctl restart admin-api admin-ui`) and confirm auto-recovery.

## 9. Troubleshooting

- **CORS errors:** ensure `CORS_ENABLED=false` in production; only same-origin requests are accepted.
- **OAuth redirect mismatch:** update the Discord application to `https://admin.slimyai.xyz/api/auth/callback`.
- **SSE hangs:** confirm the reverse proxy disables buffering (Caddy `flush_interval`, nginx `proxy_buffering off`).
- **Missing DB_URL:** both API and backup scripts rely on `.env.admin.production`—verify `DB_URL` is present.

---

For additional operational tips, see `README.md` (Admin Panel section) and `UPDATES.md` for release notes.
