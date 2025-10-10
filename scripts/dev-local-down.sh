#!/usr/bin/env bash
# scripts/dev-local-down.sh
# Stop the local PM2 process, push git changes, and restart the Cybrancee host.

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log(){ printf '%s\n' "$*"; }
warn(){ printf '⚠️  %s\n' "$*"; }
fail(){ printf '❌ %s\n' "$*" >&2; exit 1; }

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

CYBRANCEE_START_URL=${CYBRANCEE_START_URL:-}

log "== Slimy handover to Cybrancee =="
log "Project root: $ROOT_DIR"

# Stop local PM2 process if it exists.
if pm2 describe slimy-bot > /dev/null 2>&1; then
  log "Stopping local pm2 process (slimy-bot)..."
  pm2 stop slimy-bot || true
  pm2 delete slimy-bot || true
  pm2 save > /dev/null 2>&1 || true
  log "Local pm2 process stopped."
else
  warn "pm2 process 'slimy-bot' not found – skipping local stop."
fi

# Check for pending git changes.
if git status --porcelain | grep -q .; then
  log "Committing local changes..."
  git add -A
  COMMIT_MSG="local-sync $(date -Iseconds)"
  git commit -m "$COMMIT_MSG"
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  log "Pushing branch $CURRENT_BRANCH..."
  git push origin "$CURRENT_BRANCH"
else
  log "No local git changes to push."
fi

# Trigger remote start action if a hook is provided.
if [[ -n "$CYBRANCEE_START_URL" ]]; then
  log "Calling remote start URL: $CYBRANCEE_START_URL"
  if curl -fsSL "$CYBRANCEE_START_URL" >/dev/null; then
    log "Remote start request sent."
  else
    warn "Remote start request failed."
  fi
else
  warn "CYBRANCEE_START_URL not set – relying on git webhook/automation."
fi

log "✅ Local environment handed off."
