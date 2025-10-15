#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./restore-database.sh <backup-file>"
  echo "Example: ./restore-database.sh backups/slimy_backup_20251015_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Load environment variables
if [ -f /opt/slimy/app/.env ]; then
  export $(cat /opt/slimy/app/.env | grep -v '^#' | xargs)
fi

echo "⚠️  WARNING: This will REPLACE the current database with the backup!"
echo "Database: ${DB_NAME}"
echo "Backup: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo "🔄 Restoring database..."
gunzip -c "$BACKUP_FILE" | docker exec -i slimy-db mysql \
  -u"${DB_USER}" \
  -p"${DB_PASSWORD}" \
  "${DB_NAME}"

echo "✅ Database restored successfully!"
