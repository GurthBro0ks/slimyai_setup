#!/usr/bin/env bash
# scripts/dev-local-up.sh
# Stop the remote Cybrancee instance, ensure local DB connectivity,
# install deps if needed, and start the bot locally via PM2.

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log(){ printf '%s\n' "$*"; }
warn(){ printf '⚠️  %s\n' "$*"; }
fail(){ printf '❌ %s\n' "$*" >&2; exit 1; }

# Load .env so we reuse the same credentials.
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
else
  warn ".env not found – relying on environment variables."
fi

DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-slimy_local}
DB_PASSWORD=${DB_PASSWORD:-slimy_local_dev}
DB_NAME=${DB_NAME:-s26873_slimy}

CYBRANCEE_SSH=${CYBRANCEE_SSH:-}
CYBRANCEE_REMOTE_STOP=${CYBRANCEE_REMOTE_STOP:-"pm2 stop slimy-bot"}

log "== Slimy local bring-up =="
log "Project root: $ROOT_DIR"

# If you have a remote stop endpoint, you can set CYBRANCEE_STOP_URL to curl it here.
if [[ -n "${CYBRANCEE_STOP_URL:-}" ]]; then
  log "Calling remote stop URL: $CYBRANCEE_STOP_URL"
  if curl -fsSL "$CYBRANCEE_STOP_URL" >/dev/null; then
    log "Remote stop request sent."
  else
    warn "Remote stop request failed (continuing)."
  fi
else
  warn "CYBRANCEE_STOP_URL not set – skipping remote stop."
fi

# Ensure local MySQL is reachable with app credentials.
log "Checking local MySQL connectivity ($DB_USER@$DB_HOST:$DB_PORT)..."
if MYSQL_PWD="$DB_PASSWORD" mysqladmin --connect-timeout=5 -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ping > /dev/null 2>&1; then
  log "MySQL reachable."
else
  fail "Unable to reach MySQL as $DB_USER@$DB_HOST:$DB_PORT."
fi

# Install dependencies if needed.
if [[ ! -d node_modules ]]; then
  log "Installing npm dependencies (npm ci)..."
  npm ci
else
  log "node_modules present – skipping install."
fi

# Deploy slash commands to the currently configured gateway (helpful when swapping).
log "Deploying slash commands locally..."
npm run deploy --silent || log "Slash command deployment returned non-zero (continuing)."

# Start/restart the local PM2 process.
if pm2 describe slimy-bot > /dev/null 2>&1; then
  log "Restarting existing pm2 process..."
  pm2 restart slimy-bot --update-env
else
  log "Starting pm2 process via ecosystem.config.js ..."
  pm2 start ecosystem.config.js --env production
fi
pm2 save > /dev/null 2>&1 || true

log "✅ Local bot is running under pm2 (slimy-bot)."
log "To follow logs: pm2 logs slimy-bot"
