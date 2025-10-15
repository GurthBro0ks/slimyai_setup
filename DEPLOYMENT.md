# Deployment Guide - Slimy.AI Bot v2.1

This guide covers deploying Slimy.AI to production using Docker Compose with MySQL backend.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Steps](#deployment-steps)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Health Monitoring](#health-monitoring)
6. [Rollback Procedure](#rollback-procedure)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## Pre-Deployment Checklist

Before deploying to production, verify:

### Required Credentials
- [ ] Discord bot token (`DISCORD_TOKEN`)
- [ ] Discord client ID (`DISCORD_CLIENT_ID`)
- [ ] OpenAI API key (`OPENAI_API_KEY`) - optional but recommended
- [ ] MySQL root password (in `.env.db`)
- [ ] Database user credentials (`DB_USER`, `DB_PASSWORD`)

### Infrastructure
- [ ] Docker Engine 20.10+ installed
- [ ] Docker Compose v2+ installed
- [ ] External network `slimy-net` created: `docker network create slimy-net`
- [ ] Persistent directories created:
  - `/opt/slimy/ops/mysql` - Database files
  - `/opt/slimy/ops/logs` - Application logs
  - `/opt/slimy/ops/bot-data` - JSON data storage

### Security
- [ ] `.env` file has secure passwords (min 16 chars, mixed case, numbers, symbols)
- [ ] `google-service-account.json` NOT in git (check `.gitignore`)
- [ ] File permissions set: `chmod 600 .env .env.db google-service-account.json`
- [ ] Ports bound to localhost only (127.0.0.1) in docker-compose.yml

### Configuration
- [ ] `.env` file created from `.env.example`
- [ ] `.env.db` file created with MySQL root password
- [ ] Discord slash commands registered: `npm run deploy`
- [ ] Bot has necessary Discord permissions:
  - Send Messages
  - Read Message History
  - Use Slash Commands
  - Attach Files
  - Embed Links

### Testing
- [ ] Run stress test suite: `node stress-test-suite.js` (should pass ≥95%)
- [ ] Run memory tests: `npm run test:memory`
- [ ] Test database connection: `node -e "require('./lib/database').testConnection().then(() => console.log('✅ DB OK'))"`
- [ ] Review logs for errors: `tail -f logs/combined.log`

---

## Deployment Steps

### Initial Deployment

1. **Clone Repository and Navigate to Directory**
   ```bash
   cd /opt/slimy/app
   git pull origin main  # or your deployment branch
   ```

2. **Install Dependencies**
   ```bash
   npm ci --only=production
   ```

3. **Configure Environment**
   ```bash
   # Copy example files
   cp .env.example .env

   # Edit .env with your credentials
   nano .env

   # Create database environment file
   cat > .env.db <<EOF
   MYSQL_ROOT_PASSWORD=your_secure_root_password_here
   MYSQL_DATABASE=slimy_ai_bot
   MYSQL_USER=slimy_bot_user
   MYSQL_PASSWORD=PAw5zMUtPAw5zMUt
   EOF

   # Secure the files
   chmod 600 .env .env.db
   ```

4. **Create Docker Network (First Time Only)**
   ```bash
   docker network create slimy-net
   ```

5. **Deploy Slash Commands to Discord**
   ```bash
   npm run deploy
   ```

   **Note:** Global commands take ~1 hour to propagate. For instant testing, set `DISCORD_GUILD_ID` in `.env` to deploy to a specific server.

6. **Start Services**
   ```bash
   docker compose up -d
   ```

7. **Verify Deployment**
   ```bash
   # Check container status
   docker compose ps

   # Check logs
   docker compose logs -f bot

   # Test health endpoint
   curl http://localhost:3000/health

   # Test metrics endpoint
   curl http://localhost:3000/metrics
   ```

8. **Create Initial Database Backup**
   ```bash
   ./scripts/backup-database.sh
   ```

### Updates and Re-Deployment

1. **Create Pre-Update Backup**
   ```bash
   ./scripts/backup-database.sh
   ```

2. **Pull Latest Code**
   ```bash
   git pull origin main
   ```

3. **Update Dependencies**
   ```bash
   npm ci --only=production
   ```

4. **Rebuild and Restart Containers**
   ```bash
   docker compose up -d --build
   ```

5. **Update Slash Commands (if commands changed)**
   ```bash
   npm run deploy
   ```

6. **Verify Health**
   ```bash
   curl http://localhost:3000/health
   docker compose logs -f bot | head -n 50
   ```

---

## Environment Configuration

### Required Variables

```bash
# Discord (Required)
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id

# Database (Required for production)
DB_HOST=db
DB_PORT=3306
DB_USER=slimy_bot_user
DB_PASSWORD=secure_password_here
DB_NAME=slimy_ai_bot
DB_CONNECTION_LIMIT=10
```

### Optional but Recommended

```bash
# OpenAI (Enables AI features)
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o
VISION_MODEL=gpt-4o

# Monitoring
HEALTH_PORT=3000
LOG_LEVEL=info
ERROR_WEBHOOK_URL=https://discord.com/api/webhooks/...  # For alerts
```

### Advanced Configuration

```bash
# Google Sheets (for Super Snail stats)
GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json
SHEETS_PARENT_FOLDER_ID=your_folder_id

# Testing (instant command deployment)
DISCORD_GUILD_ID=your_test_server_id
```

---

## Database Setup

### Database Structure

The bot auto-creates these tables on first run:
- `users` - User profiles and consent
- `guilds` - Discord server metadata
- `user_guilds` - Per-guild user settings (sheets consent, sheet IDs)
- `memories` - User memory storage
- `mode_configs` - Channel personality configurations
- `snail_stats` - Super Snail stat analysis history
- `personality_metrics` - Personality engine usage tracking
- `image_generation_log` - DALL-E generation history

### Manual Database Access

**Via Adminer Web UI:**
```bash
# Access at http://localhost:8080
# Login with credentials from .env
```

**Via Docker CLI:**
```bash
docker exec -it slimy-db mysql -u slimy_bot_user -p slimy_ai_bot
```

### Database Backups

**Automated Backups:**
```bash
# Manual backup
./scripts/backup-database.sh

# Setup cron job (daily at 2 AM)
crontab -e
0 2 * * * /opt/slimy/app/scripts/backup-database.sh >> /opt/slimy/ops/logs/backup.log 2>&1
```

**Restore from Backup:**
```bash
./scripts/restore-database.sh backups/slimy_backup_20251015_120000.sql.gz
```

⚠️ **Warning:** Restoring will REPLACE the current database!

---

## Health Monitoring

### Health Check Endpoints

**Health Status:**
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-15T12:00:00.000Z",
  "uptime": 12345,
  "memory": {
    "heapUsed": 64,
    "heapTotal": 94,
    "rss": 120
  },
  "database": "connected"
}
```

**Metrics:**
```bash
curl http://localhost:3000/metrics
```

Response:
```json
{
  "uptime": 12345,
  "commands": {
    "chat": {
      "count": 150,
      "successCount": 148,
      "errorCount": 2,
      "avgTime": "245ms",
      "successRate": "98.7%"
    }
  },
  "errors": { ... },
  "summary": {
    "totalCommands": 300,
    "totalErrors": 5,
    "successRate": "98.3%"
  }
}
```

### Discord Diagnostics

Use the `/diag` slash command in Discord for real-time diagnostics:
- Bot uptime
- Memory usage
- Database connection status
- Database record counts
- Command statistics
- Top 3 most used commands
- Git commit hash
- WebSocket ping
- Health endpoint URLs

### Log Files

Logs are stored in `/opt/slimy/ops/logs/`:
- `combined.log` - All log levels (info, warn, error, critical)
- `error.log` - Errors and critical issues only

**Monitor logs in real-time:**
```bash
tail -f /opt/slimy/ops/logs/combined.log
tail -f /opt/slimy/ops/logs/error.log
```

### Docker Health Checks

Docker automatically monitors container health:
```bash
docker compose ps  # Shows health status
docker inspect slimy-bot | grep -A 10 Health
```

### Critical Error Alerts

Set `ERROR_WEBHOOK_URL` to receive Discord notifications for:
- Unhandled promise rejections
- Uncaught exceptions
- Database connection failures
- Critical system errors

---

## Rollback Procedure

If deployment fails or causes issues:

### Quick Rollback

1. **Stop Current Containers**
   ```bash
   docker compose down
   ```

2. **Restore Previous Code**
   ```bash
   git log --oneline -n 5  # Find previous commit
   git checkout <previous-commit-hash>
   ```

3. **Restore Database (if schema changed)**
   ```bash
   ./scripts/restore-database.sh backups/slimy_backup_<timestamp>.sql.gz
   ```

4. **Rebuild and Start**
   ```bash
   docker compose up -d --build
   ```

5. **Verify Health**
   ```bash
   curl http://localhost:3000/health
   docker compose logs bot
   ```

### Partial Rollback (Environment Only)

If only configuration caused the issue:
```bash
# Restore previous .env
cp .env.bak .env

# Restart without rebuilding
docker compose restart bot
```

---

## Troubleshooting

### Bot Won't Start

**Check logs:**
```bash
docker compose logs bot
```

**Common issues:**
- Missing `DISCORD_TOKEN` → Add to `.env`
- Database not ready → Wait for `slimy-db` to be healthy
- Port 3000 in use → Change `HEALTH_PORT` in `.env`
- Node modules missing → Run `npm ci` and rebuild

### Slash Commands Not Appearing

**Global deployment delay:**
- Global commands take up to 1 hour to propagate
- Use `DISCORD_GUILD_ID` for instant testing

**Verify registration:**
```bash
npm run deploy
# Look for "✅ Successfully registered X application commands"
```

**Clear and re-register:**
```bash
node clear-commands.js
npm run deploy
```

### Database Connection Failed

**Check database container:**
```bash
docker compose ps db
docker compose logs db
```

**Test connection manually:**
```bash
docker exec -it slimy-db mysql -u slimy_bot_user -p
# Enter password from .env
```

**Verify credentials:**
- `.env` has correct `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `.env.db` has matching `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`

### High Memory Usage

**Check current usage:**
```bash
curl http://localhost:3000/metrics | jq .memory
```

**Investigate:**
- Large conversation histories (auto-cleared, but check)
- Memory leaks (restart bot: `docker compose restart bot`)
- Too many concurrent users (increase resources or optimize)

**Restart bot:**
```bash
docker compose restart bot
```

### Health Check Failing

**Manual test:**
```bash
curl -v http://localhost:3000/health
```

**If endpoint not responding:**
- Check health-server started: `docker compose logs bot | grep "Health check server"`
- Verify `HEALTH_PORT=3000` in `.env`
- Check port mapping in `docker-compose.yml`

**If database shows disconnected:**
```bash
docker compose restart db bot
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor `/diag` command output
- Check error logs: `tail -f logs/error.log`

**Weekly:**
- Review metrics: `curl http://localhost:3000/metrics`
- Verify backups exist: `ls -lh backups/`
- Check disk usage: `df -h /opt/slimy/ops/`

**Monthly:**
- Update dependencies: `npm update` (test first!)
- Review and update `.env` if new variables added
- Audit Google service account permissions
- Review database size and optimize if needed

### Performance Optimization

**Database optimization:**
```bash
docker exec -it slimy-db mysql -u root -p
OPTIMIZE TABLE memories, snail_stats, image_generation_log;
```

**Log rotation:**
```bash
# Setup logrotate for application logs
sudo nano /etc/logrotate.d/slimy-bot
```

Example logrotate config:
```
/opt/slimy/ops/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    copytruncate
}
```

**Docker cleanup:**
```bash
# Remove old images
docker image prune -a

# Remove unused volumes
docker volume prune
```

### Updating Node.js

```bash
# Update Dockerfile
FROM node:20-bullseye  # or latest LTS

# Rebuild
docker compose up -d --build
```

### Scaling Considerations

For high-traffic servers (500+ concurrent users):
- Increase `DB_CONNECTION_LIMIT` (default: 10)
- Add resource limits in `docker-compose.yml`
- Monitor metrics closely
- Consider Redis for session storage (future enhancement)

---

## Support

**Issue Tracking:**
- GitHub Issues: https://github.com/yourusername/slimy-bot/issues

**Logs for Bug Reports:**
```bash
# Gather diagnostic info
curl http://localhost:3000/health > health.json
curl http://localhost:3000/metrics > metrics.json
docker compose logs bot > bot.log
# Attach to issue (sanitize sensitive data first!)
```

**Emergency Contact:**
- Review error webhook alerts
- Check `logs/error.log` for stack traces
- Use `/diag` command for real-time status

---

**Last Updated:** 2025-10-15 (v2.1)
