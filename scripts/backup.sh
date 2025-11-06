#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/admin-api/.env.admin.production}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/slimy}"
MYSQL_DIR="${BACKUP_MYSQL_DIR:-$BACKUP_ROOT/mysql}"
DATA_DIR="${BACKUP_DATA_DIR:-$BACKUP_ROOT/data}"

STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$MYSQL_DIR" "$DATA_DIR"

MYSQL_OUT="$MYSQL_DIR/slimy-${STAMP}.sql.gz"

echo "[backup] MySQL dump -> $MYSQL_OUT"
NODE_ENV=production ENV_FILE="$ENV_FILE" node "$REPO_DIR/scripts/mysql-dump.js" --out "$MYSQL_OUT"

EXPORT_DIR="$DATA_DIR/$STAMP"
echo "[backup] Exporting corrections/personality -> $EXPORT_DIR"
NODE_ENV=production ENV_FILE="$ENV_FILE" node "$REPO_DIR/scripts/export-admin-data.js" --out "$EXPORT_DIR"

echo "[backup] Rotating files older than 14 days in $BACKUP_ROOT"
find "$BACKUP_ROOT" -type f -mtime +14 -print -delete || true
find "$BACKUP_ROOT" -type d -empty -delete || true

echo "[backup] Complete"
