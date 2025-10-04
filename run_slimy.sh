#!/usr/bin/env bash
# run_slimy.sh - MULTI-SERVER VERSION

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/runner.log"
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

pause(){ echo; read -r -p "Press ENTER to close..." _; }
fail(){ echo "❌ $*"; pause; exit 1; }
trap 'echo "❌ Failed at line $LINENO (exit $?)"; pause' ERR

echo "==== $(date) :: Slimy launcher starting ===="
echo "📜 Log: $LOG_FILE"

# --- Inject latest NVM Node bin ---
LATEST_NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -n1 || true)"
if [ -n "${LATEST_NODE_BIN:-}" ] && [ -d "$LATEST_NODE_BIN" ]; then
  export PATH="$LATEST_NODE_BIN:$PATH"
fi

echo "PATH=$PATH"
echo "node=$(command -v node) | npm=$(command -v npm) | pm2=$(command -v pm2)"

# --- Tool checks ---
for bin in node npm pm2; do
  command -v "$bin" >/dev/null || fail "Missing '$bin' in PATH"
done
echo "node: $(node -v), npm: $(npm -v), pm2: $(pm2 -v)"

# --- Project files ---
for f in index.js ecosystem.config.js deploy-commands.js; do
  [ -f "$f" ] || fail "Missing file: $f"
done
echo "Files OK."

# --- .env & required vars ---
[ -f .env ] || fail ".env not found"
set -a; . ./.env; set +a
: "${DISCORD_TOKEN:?Missing DISCORD_TOKEN in .env}"
: "${DISCORD_CLIENT_ID:?Missing DISCORD_CLIENT_ID in .env}"

# DISCORD_GUILD_ID is now OPTIONAL (only needed for guild-specific deployments)
if [ -n "${DISCORD_GUILD_ID:-}" ]; then
  echo "ENV OK (CLIENT=$DISCORD_CLIENT_ID, GUILD=$DISCORD_GUILD_ID - guild deployment mode)"
else
  echo "ENV OK (CLIENT=$DISCORD_CLIENT_ID - global deployment mode)"
fi

# --- Dependencies ---
if [ ! -d node_modules ]; then
  echo "Installing npm dependencies…"
  npm ci || npm i
else
  echo "node_modules present; skipping install."
fi

# --- Deploy slash commands ---
echo "Deploying commands..."
node deploy-commands.js
echo "✅ Commands deployed."

# --- PM2 start/restart ---
if pm2 describe slimy-bot >/dev/null 2>&1; then
  echo "Restarting slimy-bot (update env)…"
  pm2 restart slimy-bot --update-env
else
  echo "Starting slimy-bot via ecosystem.config.js…"
  pm2 start ecosystem.config.js --env production
fi
pm2 save || true
echo "✅ PM2 running."

echo
echo "Tailing PM2 logs (Ctrl+C to stop)…"
pm2 logs slimy-bot --lines 80 || true
pause
