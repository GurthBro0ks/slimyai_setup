#!/bin/bash
set -e

# Configuration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/slimy/app/backups"
RETENTION_DAYS=7

# Load environment variables
if [ -f /opt/slimy/app/.env ]; then
  export $(cat /opt/slimy/app/.env | grep -v '^#' | xargs)
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
echo "🔄 Creating database backup..."
docker exec slimy-db mysqldump \
  -u"${DB_USER}" \
  -p"${DB_PASSWORD}" \
  "${DB_NAME}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  | gzip > "$BACKUP_DIR/slimy_backup_$DATE.sql.gz"

# Verify backup was created
if [ -f "$BACKUP_DIR/slimy_backup_$DATE.sql.gz" ]; then
  BACKUP_SIZE=$(du -h "$BACKUP_DIR/slimy_backup_$DATE.sql.gz" | cut -f1)
  echo "✅ Backup created: slimy_backup_$DATE.sql.gz ($BACKUP_SIZE)"
else
  echo "❌ Backup failed!"
  exit 1
fi

# Clean up old backups
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# List remaining backups
echo "📊 Current backups:"
ls -lh "$BACKUP_DIR" | grep "\.sql\.gz$" || echo "No backups found"

echo "✅ Backup complete!"
