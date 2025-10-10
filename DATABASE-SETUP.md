# Database Setup Guide - Slimy.ai v2.0

This guide will help you set up MySQL/MariaDB for slimy.ai v2.0.

## Prerequisites

- MySQL 5.7+ or MariaDB 10.3+
- Access to Cybrancee database panel or terminal

---

## Option 1: Cybrancee Panel Setup (Recommended)

### Step 1: Create Database

1. Log in to Cybrancee panel
2. Navigate to **Databases** section
3. Click **Create Database**
4. Database name: `slimy_ai_bot`
5. Click **Create**

### Step 2: Create Database User

1. In the Databases section, click **Create User**
2. Username: `slimy_bot_user`
3. Password: Generate a secure password (save it!)
4. Click **Create**

### Step 3: Grant Permissions

1. Go to **Database Users** section
2. Find `slimy_bot_user`
3. Select `slimy_ai_bot` database
4. Grant **ALL PRIVILEGES**
5. Click **Save**

### Step 4: Update .env File

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=slimy_bot_user
DB_PASSWORD=your_generated_password_here
DB_NAME=slimy_ai_bot
```

---

## Option 2: Terminal/SSH Setup

### Step 1: Connect to MySQL

```bash
mysql -u root -p
```

### Step 2: Create Database

```sql
CREATE DATABASE slimy_ai_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 3: Create User

```sql
CREATE USER 'slimy_bot_user'@'localhost' IDENTIFIED BY 'your_secure_password';
```

### Step 4: Grant Permissions

```sql
GRANT ALL PRIVILEGES ON slimy_ai_bot.* TO 'slimy_bot_user'@'localhost';
FLUSH PRIVILEGES;
```

### Step 5: Verify Connection

```sql
USE slimy_ai_bot;
SHOW TABLES;
-- Should be empty initially
```

Exit MySQL:
```sql
EXIT;
```

---

## Database Schema

The bot will automatically create the full schema on first run:

### `users`
Tracks global user settings.

| Column | Type | Notes |
|--------|------|-------|
| user_id | VARCHAR(20) | Discord user ID (PK) |
| username | VARCHAR(100) | Latest seen username |
| global_consent | TINYINT(1) | Server-wide memory consent |
| consent_granted_at | DATETIME | Timestamp consent granted |
| created_at | DATETIME | Auto-set |
| updated_at | DATETIME | Auto-set |

### `guilds`
Catalog of guilds the bot has interacted with.

| Column | Type | Notes |
|--------|------|-------|
| guild_id | VARCHAR(20) | Discord guild ID (PK) |
| guild_name | VARCHAR(100) | Latest name |
| created_at | DATETIME | Auto-set |

### `user_guilds`
Guild-specific preferences (Sheets consent).

| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| user_id | VARCHAR(20) | FK -> users |
| guild_id | VARCHAR(20) | FK -> guilds |
| sheets_consent | TINYINT(1) | Google Sheets enabled |
| sheet_id | VARCHAR(100) | Google Sheet ID |
| created_at | DATETIME | Auto-set |

### `memories`
Server-wide memories saved by users.

| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(36) | UUID primary key |
| user_id | VARCHAR(20) | FK -> users |
| guild_id | VARCHAR(20) | FK -> guilds (nullable) |
| note | TEXT | Memory content |
| tags | JSON | Array of string tags |
| context | JSON | Extra metadata (channel/timestamp) |
| created_at | DATETIME | Auto-set |

### `mode_configs`
Stores channel/category/thread mode overrides.

| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| guild_id | VARCHAR(20) | FK -> guilds |
| channel_id | VARCHAR(20) | Nullable |
| category_id | VARCHAR(20) | Nullable |
| thread_id | VARCHAR(20) | Nullable |
| config | JSON | Mode payload |
| created_at | DATETIME | Auto-set |
| updated_at | DATETIME | Auto-updated |

### `snail_stats`
History of Super Snail analyses.

| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| user_id | VARCHAR(20) | FK -> users |
| guild_id | VARCHAR(20) | FK -> guilds |
| screenshot_url | VARCHAR(500) | Image location |
| hp..fth | INT | Parsed stats |
| confidence | JSON | Confidence scores |
| analysis_text | TEXT | Summary provided |
| saved_to_sheet | TINYINT(1) | Whether synced to Sheets |
| created_at | DATETIME | Auto-set |

### `personality_metrics`
Stores analytics emitted by the personality engine.

| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| user_id | VARCHAR(20) | FK -> users |
| guild_id | VARCHAR(20) | FK -> guilds |
| metric_type | VARCHAR(50) | e.g. response, survey |
| metric_value | JSON | Arbitrary payload |
| recorded_at | DATETIME | Auto-set |

### `image_generation_log`
Audit log for every `/dream` request.

| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| user_id | VARCHAR(20) | FK -> users |
| guild_id | VARCHAR(20) | FK -> guilds |
| channel_id | VARCHAR(20) | Channel used |
| prompt | TEXT | Original prompt |
| enhanced_prompt | TEXT | Prompt with style modifiers |
| style | VARCHAR(50) | Style key |
| rating | VARCHAR(20) | Rating context |
| success | TINYINT(1) | 1 = ok, 0 = failed |
| error_message | TEXT | Failure reason |
| image_url | VARCHAR(500) | Optional CDN URL |
| generated_at | DATETIME | Auto-set |

---

## Migration from File Storage

### Step 1: Backup Current Data

```bash
cp data_store.json data_store.json.backup
```

### Step 2: Run Migration Script

```bash
node scripts/migrate-to-database.js
```

The script will:
- ✅ Create all database tables
- ✅ Migrate consent preferences
- ✅ Migrate memories
- ✅ Create backup in `backups/` directory
- ✅ Show migration summary

### Step 3: Verify Migration

```bash
# Check database
mysql -u slimy_bot_user -p slimy_ai_bot

# Count records
SELECT COUNT(*) FROM user_consent;
SELECT COUNT(*) FROM memories;
```

### Step 4: Test Bot

```bash
# Start bot
npm start

# Test commands
/consent status
/export
```

---

## Troubleshooting

### Connection Error: "Access denied"
- Check DB_USER and DB_PASSWORD in .env
- Verify user has correct permissions
- Run: `FLUSH PRIVILEGES;` in MySQL

### Connection Error: "Unknown database"
- Verify DB_NAME exists
- Create database: `CREATE DATABASE slimy_ai_bot;`

### Migration Error: "Table doesn't exist"
- Tables are auto-created on first connection
- Verify database permissions
- Check logs for SQL errors

### Error: "Too many connections"
- Increase MySQL max_connections
- Reduce connection pool size in lib/database.js

---

## Maintenance

### Backup Database

```bash
mysqldump -u slimy_bot_user -p slimy_ai_bot > backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
mysql -u slimy_bot_user -p slimy_ai_bot < backup_20250101.sql
```

### Clear Old Data

```sql
-- Delete image logs older than 90 days
DELETE FROM image_generation_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Delete personality analytics older than 30 days
DELETE FROM personality_analytics WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

---

## Next Steps

After database setup:

1. ✅ Configure .env with database credentials
2. ✅ Run migration script (if upgrading from v1.x)
3. ✅ Deploy commands: `npm run deploy`
4. ✅ Start bot: `npm start` or `pm2 restart slimy-bot`
5. ✅ Test with: `/consent status`, `/remember`, `/export`

---

## Support

- Check logs: `pm2 logs slimy-bot`
- Test connection: `node -e "require('./lib/database').testConnection()"`
- Database issues: Contact Cybrancee support

---

**🎉 Database setup complete! Your bot is now powered by MySQL.**
