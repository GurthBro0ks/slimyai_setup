# Slimy.AI Discord Bot 🐌

A production-ready Discord bot built with Discord.js v14 that provides AI-powered chat, memory management, personality modes, and game-specific features (Super Snail stats analysis via GPT-4 Vision).

**Version:** 2.1 (Production Ready)
**Status:** ✅ Active Development
**License:** MIT

---

## Features

### 🧠 Memory Management
- **Persistent Memories**: Store and recall information with consent-based privacy
- **Dual Storage**: MySQL database with JSON file fallback
- **Context-Aware**: Separate memories per server (guild) and DMs
- **Export**: Download all memories as JSON

### 💬 AI Chat Integration
- **GPT-4o Powered**: Natural language conversations with context retention
- **Conversation History**: Maintains recent conversation context (16 messages)
- **Mention Support**: Chat by @mentioning the bot
- **Rate Limited**: Prevents abuse with per-user cooldowns
- **TPM Budget**: Tracks tokens per minute (default: 2,000,000 TPM via `OPENAI_TPM_BUDGET`) with automatic throttling and 429 backoff (respects Retry-After header, exponential backoff 1.5x, cap 60s)

### 🎨 Image Generation
- **DALL-E Integration**: Generate images from text prompts
- **Auto-Detection**: Automatically generates images when users describe visual ideas
- **Content Rating**: PG-13 and Unrated modes
- **Usage Tracking**: Logs all generations to database

### 🐌 Super Snail Stats Analysis
- **GPT-4 Vision**: Extract stats from game screenshots automatically
- **Google Sheets Integration**: Auto-create and update personal stat tracking sheets
- **Auto-Detection**: Automatically processes snail screenshots in configured channels
- **Confidence Scores**: Shows detection confidence for each stat

### 🏟️ Club Analytics
- **Commands**: `/club analyze` (preview, manual fixes, confirmation), `/club stats` (embed or CSV export), and `/club-admin` tools for aliases, snapshots, sheet configuration, rollback, corrections, and CSV.
- **Setup**: configure `OPENAI_API_KEY`, Google service account (`GOOGLE_APPLICATION_CREDENTIALS` or inline JSON), optional `CLUB_ROLE_ID`, and run migrations `migrations/2025-10-20-club.sql`, `migrations/2025-10-23-club-member-key.sql`, `migrations/2025-10-23-club-corrections.sql`, and `migrations/2025-10-23-club-corrections-flags.sql`. Sheet links can now be stored per-guild via `/club-admin stats url:<link>` or environment variables.
- **Workflow**: upload up to 10 Manage Members screenshots → OCR + QA preview → fix via OCR boost/manual modal or mention trigger → approve to write snapshot + sheet sync (`Club Latest` tab with **SIM Power**, **Total Power**, and **Change %** columns). Corrected values are badged with asterisks (*).
- **Corrections**: Admins can override bad OCR values via `/club-admin correct` command or by editing the "Corrections" tab in Google Sheets. Corrections are automatically applied during recompute and are tracked with reasons for audit trail.
- **Quality Controls**: Weekly WoW % anchored to **Friday 04:30 America/Los_Angeles** (configurable via `CLUB_WEEK_ANCHOR_DAY/TIME/TZ`), suspicious jump threshold (`CLUB_QA_SUSPICIOUS_JUMP_PCT`), missing-member guard (≥20%), name canonicalization + alias table, ensemble OCR retries, anti-inflation number parser, and sheet sync backstops.
- **Week Anchor**: Default **Fri 04:30 PT** (shows conversions to Detroit/UTC in `/club-stats` footer); WoW calculations use this boundary for consistent week-over-week comparisons.
- **Headless Operations**: Ingest, verify, and recompute without Discord commands:
  ```bash
  export GUILD_ID="1176605506912141444"

  # Ingest screenshots (dry-run first)
  node scripts/ingest-club-screenshots.js \
    --guild "$GUILD_ID" \
    --dir "/opt/slimy/app/screenshots/test" \
    --type both \
    --dry --debug

  # Commit to database (with corrections sync)
  node scripts/ingest-club-screenshots.js \
    --guild "$GUILD_ID" \
    --dir "/opt/slimy/app/screenshots/test" \
    --type both \
    --apply-corrections \
    --commit

  # Verify aggregates (non-strict: warns but exits 0)
  npm run verify:stats

  # Recompute from existing snapshot (no OCR re-run)
  npm run recompute:latest -- --dry         # Preview without writing
  npm run recompute:push                    # Rebuild + sync sheet
  ```

### 🛠️ Operational Updates (Oct 2025)
- **Per-Guild Slash Registration**: Set `DEV_GUILD_IDS` and keep `DEPLOY_GLOBAL_COMMANDS=0`, then run `node scripts/refresh-commands.js` for instant guild sync (global commands disabled to avoid propagation lag).
- **Database Host**: The app now targets the local bridge at `DB_HOST=127.0.0.1` (Docker maps MySQL on localhost).
- **Schema Migration**: Run `mysql -h 127.0.0.1 -u root -pPAw5zMUt slimy_ai_bot < migrations/2025-10-20-club.sql` after provisioning to create the club analytics tables.
- **Process Supervisor**: The bot runs under PM2 (`pm2 start index.js --name slimy-bot`, `pm2 save`, `pm2 startup`) — the old `slimy-bot` Docker container should remain stopped/disabled.
- **Command Deployment**: Replace `npm run deploy` with `node scripts/refresh-commands.js` so required options are auto-normalized before hitting the Discord API.

### 🎭 Personality Engine
- **Configurable Modes**: Customize bot personality per channel/category/thread
- **Multiple Personas**: Mentor, partner, mirror, operator, personality modes
- **Catchphrases**: Dynamic responses based on context
- **Adaptive Tone**: Adjusts based on user interaction patterns

### 📊 Production Monitoring (v2.1)
- **Health Check Endpoints**: HTTP endpoints on port 3000 (`/health`, `/metrics`)
- **Structured Logging**: JSON logs with debug/info/warn/error/critical levels
- **Command Metrics**: Track execution time, success rates, error counts
- **Critical Alerts**: Discord webhook notifications for system errors
- **Diagnostics Command**: Real-time bot health via `/diag`

### 🔒 Security & Reliability (v2.1)
- **Rate Limiting**: Per-user, per-command cooldowns with automatic cleanup
- **Graceful Shutdown**: Proper cleanup of database connections and health server
- **Global Error Handlers**: Catches unhandled rejections and exceptions
- **Database Connection Pooling**: Production-grade MySQL pool with keepAlive
- **Docker Health Checks**: Automated container health monitoring

### 💾 Database & Backups (v2.1)
- **Automated Backups**: Script for daily database backups with 7-day retention
- **One-Command Restore**: Interactive restore script with safety confirmations
- **Schema Auto-Creation**: Automatically creates all required tables on startup

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Docker** 20.10+ and **Docker Compose** v2+
- **Discord Bot Token** (from [Discord Developer Portal](https://discord.com/developers/applications))
- **OpenAI API Key** (optional, from [OpenAI Platform](https://platform.openai.com))

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/slimy-bot.git
   cd slimy-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   nano .env  # Add your Discord token, OpenAI key, etc.
   ```

4. **Create database environment file:**
   ```bash
   cat > .env.db <<EOF
   MYSQL_ROOT_PASSWORD=your_secure_password_here
   MYSQL_DATABASE=slimy_ai_bot
   MYSQL_USER=slimy_bot_user
   MYSQL_PASSWORD=your_secure_password_here
   EOF
   chmod 600 .env .env.db
   ```

5. **Create Docker network:**
   ```bash
   docker network create slimy-net
   ```

6. **Deploy slash commands (guild scoped):**
   ```bash
   # .env
   DEV_GUILD_IDS=1176605506912141444
   DEPLOY_GLOBAL_COMMANDS=0

   node scripts/refresh-commands.js
   ```

7. **Run the club analytics migrations (once per environment):**
   ```bash
   # Initial club analytics tables
   node scripts/run-migration.js migrations/2025-10-20-club.sql

   # Member-key support for one-row-per-member aggregation
   node scripts/run-migration.js migrations/2025-10-23-club-member-key.sql
   ```

   > The automatic table bootstrap now also provisions `guild_settings`; rerun `npm start` or `pm2 restart slimy-bot` if you skip the manual migration step.

8. **Start the bot under PM2 (dependencies stay in Docker):**
   ```bash
   npm install -g pm2
   pm2 start index.js --name slimy-bot
   pm2 save
   pm2 startup systemd  # follow the printed instructions
   ```

9. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   ```

---

## Commands

### Memory Commands
- `/remember <note>` - Store a memory (requires consent)
- `/recall [limit]` - List stored memories (default: 25)
- `/forget <id>` - Delete a specific memory
- `/forget all` - Delete all memories in current context
- `/export memories` - Download all memories as JSON

### Consent Management
- `/consent set <allow>` - Enable/disable memory storage
- `/consent status` - Check current consent status

### Chat Commands
- `/chat <message> [reset]` - Chat with AI
- `@Slimy.ai <message>` - Alternative chat interface (mention the bot)

### Mode Configuration
- `/mode view` - Show current channel modes
- `/mode set <modes>` - Configure channel behavior
- `/mode clear` - Remove all mode configurations

### Super Snail Features
- `/snail analyze <image>` - Review and save one screenshot at a time
- `/snail stats` - Combine saved screenshots into a full report
- `/snail sheet-setup` - Setup Google Sheets integration
- Auto-detection in configured channels

### Club Admin Utilities
- `/club-admin snapshots [limit]` - Share the latest commits in-channel (no admin needed).
- `/club-admin stats` - Broadcast the stored spreadsheet link; admins can add/change it with `url:` or clear it.
- `/club-admin aliases` - Review member canonical names and known aliases.
- `/club-admin export` - Download current club metrics as CSV (admin only).
- `/club-admin rollback` - Restore the previous snapshot (admin only).
- `/club-admin correct <member> <metric> <value> [week] [reason]` - Manually override bad OCR value (admin only).
  - Supports K/M/B notation (e.g., "2.5M")
  - Accepts @mentions or plain text member names
  - Shows "Recompute & Push" button for immediate application
- `/club-admin corrections list [week]` - View active corrections for a week (admin only).
- `/club-admin corrections remove <member> <metric> [week]` - Delete a correction (admin only).
- `/club-admin corrections sync` - Import corrections from Google Sheets "Corrections" tab (admin only).
- `/club-admin rescan-user <member> <image> [metric]` - Re-run OCR on single member (admin only).
  - Useful for fixing bad OCR without full re-ingest
  - Auto-creates correction from freshly scanned value

### Admin Panel

The web-based Admin Panel ships with the bot repository and exposes dashboarding, settings, exports, and backup controls.

| Service | Port | Purpose |
| ------- | ---- | ------- |
| `admin-api` | `127.0.0.1:3080` | Express API (Discord OAuth, RBAC, corrections, tasks, backups) |
| `admin-ui`  | `127.0.0.1:3081` | Next.js UI (login, guild picker, dashboard, settings, usage, exports) |

- **Local development:** `npm run admin:dev` (loads `.env.admin.example`, enables CORS for `http://localhost:3081`).
- **Production:** copy `admin-api/.env.admin.production.example` → `.env.admin.production`, populate secrets, and run behind Caddy or nginx using the manifests in `deploy/`. Cookies are secure, same-origin only, and tied to `admin.slimyai.xyz`.
- **Exports:** Settings → “Exports” provides corrections (CSV/JSON) and personality JSON downloads using authenticated API endpoints.
- **Backups:** Owners can trigger a MySQL dump + data export from the UI. Results stream live via SSE and land under `/var/backups/slimy`. Automated backups are handled by `scripts/backup.sh` and the sample cron entry in `deploy/cron/backup` (14‑day retention).
- See [DEPLOY.md](./DEPLOY.md) for the full runbook (DNS, reverse proxy, systemd/PM2, TLS, restores).

### Image Generation
- `/dream <prompt> [style] [rating]` - Generate images via DALL-E

### Personality Configuration
- `/personality-config reload` - Reload bot personality from `bot-personality.md`

### Admin Commands
- `/usage [window] [start] [end]` - View OpenAI API usage and costs (admin only)
  - Windows: today, 7d, 30d, this_month, custom
  - Displays token usage for gpt-4o-mini and DALL-E 3 image generation
  - **Pricing**: gpt-4o-mini = $0.15/M input + $0.60/M output; DALL-E 3 = $0.04 standard, $0.08 HD per image (env-overridable via `PRICE_4OMINI_IN/OUT`, `PRICE_DALLE3_STANDARD/HD`)
  - Shows cost breakdown by model and grand total

### Diagnostics
- `/diag` - Comprehensive bot health check (uptime, memory, database, metrics)

---

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive deployment guide including:
- Pre-deployment checklist
- Environment configuration
- Database setup
- Health monitoring
- Rollback procedures
- Troubleshooting

### Quick Production Deploy

```bash
# Navigate to app directory
cd /opt/slimy/app

# Configure environment
cp .env.example .env
nano .env  # Add production credentials

# Create network and start services
docker network create slimy-net
docker compose up -d

# Verify health
curl http://localhost:3000/health

# Create initial backup
./scripts/backup-database.sh
```

---

## Architecture

### Core Components

- **index.js** - Main entry point, singleton guard, command loader, event handlers
- **lib/database.js** - MySQL connection pooling, schema management, data access layer
- **lib/memory.js** - JSON file storage with file locking (fallback when DB unavailable)
- **lib/modes.js** - Channel/category/thread mode configuration system
- **lib/personality-engine.js** - Dynamic personality based on `bot-personality.md`
- **lib/openai.js** - Shared OpenAI client for chat, vision, image generation

### Monitoring System (v2.1)

- **lib/health-server.js** - Express HTTP server for health checks and metrics
- **lib/metrics.js** - In-memory command execution tracking
- **lib/logger.js** - Structured JSON logging to files
- **lib/alert.js** - Critical error alerting via Discord webhooks
- **lib/rate-limiter.js** - Per-user command cooldowns with auto-cleanup

### Data Flow

```
User → Discord → index.js → Command Handler → Database/Memory
                          ↓
                    Metrics Tracking
                          ↓
                    Logging & Alerts
```

---

## Environment Variables

See [`.env.example`](./.env.example) for complete documentation.

**Required:**
- `DISCORD_TOKEN` - Bot token
- `DISCORD_CLIENT_ID` - Application ID

**Database (Recommended):**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

**AI Features (Optional):**
- `OPENAI_API_KEY` - For chat, vision, image generation

**Monitoring (Production):**
- `HEALTH_PORT=3000` - Health check endpoint port
- `LOG_LEVEL=info` - Logging verbosity
- `ERROR_WEBHOOK_URL` - Discord webhook for alerts

---

## Testing

### Memory Tests
```bash
npm run test:memory
```

### Stress Test Suite
```bash
node stress-test-suite.js
```

**v2.1 Target:** ≥95% pass rate (up from 89.2% in v2.0)

### Manual Testing Checklist
- [ ] All slash commands respond correctly
- [ ] Memory persistence across restarts
- [ ] Database connection stable
- [ ] Health endpoints return 200 OK
- [ ] Rate limiting prevents spam
- [ ] Logs written to files
- [ ] Graceful shutdown works

---

## Monitoring & Maintenance

### Health Monitoring

**HTTP Endpoints:**
```bash
# System health
curl http://localhost:3000/health

# Command metrics
curl http://localhost:3000/metrics
```

**Discord Diagnostics:**
```
/diag
```

**Log Files:**
```bash
tail -f logs/combined.log   # All logs
tail -f logs/error.log      # Errors only
```

### Database Backups

**Create backup:**
```bash
./scripts/backup-database.sh
```

**Restore backup:**
```bash
./scripts/restore-database.sh backups/slimy_backup_20251015_120000.sql.gz
```

**Automated backups (cron):**
```bash
crontab -e
# Add: 0 2 * * * /opt/slimy/app/scripts/backup-database.sh
```

### Performance Metrics

View real-time metrics:
- Success rates per command
- Average execution time
- Error counts and types
- Memory usage trends

---

## Development

### Adding a New Command

1. Create `commands/yourcommand.js`:
```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yourcommand')
    .setDescription('Description here'),

  async execute(interaction) {
    await interaction.reply('Response here');
  }
};
```

2. Deploy to Discord:
```bash
npm run deploy
```

3. Restart bot:
```bash
npm start  # or docker compose restart bot
```

### Project Structure

```
slimy-bot/
├── commands/           # Slash command handlers
├── handlers/           # Event handlers (mention, snail-auto-detect)
├── lib/               # Core libraries
│   ├── database.js    # MySQL data layer
│   ├── memory.js      # JSON file storage
│   ├── modes.js       # Mode configuration
│   ├── personality-engine.js
│   ├── health-server.js    # v2.1
│   ├── metrics.js          # v2.1
│   ├── logger.js           # v2.1
│   ├── alert.js            # v2.1
│   └── rate-limiter.js     # v2.1
├── scripts/           # Utility scripts
│   ├── backup-database.sh   # v2.1
│   └── restore-database.sh  # v2.1
├── tests/             # Test suites
├── index.js           # Main entry point
├── deploy-commands.js # Command registration
├── docker-compose.yml # Production deployment
├── Dockerfile         # Container build
├── bot-personality.md # Personality config (v2.1)
└── DEPLOYMENT.md      # Deployment guide (v2.1)
```

---

## Configuration Files

### bot-personality.md
Centralized personality configuration for consistent bot behavior:
- Base personality and core values
- Tone guidelines (PG-13, Unrated, Professional)
- Catchphrases and responses
- Context-specific behaviors
- Adaptation signals

Edit this file and reload with `/personality-config reload` (no restart needed).

### CLAUDE.md
Project instructions for Claude Code AI assistant when working with this codebase.

---

## Troubleshooting

### Bot won't start
- Check logs: `docker compose logs bot`
- Verify `DISCORD_TOKEN` in `.env`
- Ensure database is healthy: `docker compose ps`

### Slash commands not appearing
- Global deployment takes ~1 hour
- Use `DISCORD_GUILD_ID` for instant testing
- Re-deploy: `npm run deploy`

### Database connection failed
- Verify `.env` credentials match `.env.db`
- Check database container: `docker compose ps db`
- Test connection: `docker exec -it slimy-db mysql -u slimy_bot_user -p`

### Health check failing
- Verify health server started: `docker compose logs bot | grep "Health check server"`
- Check `HEALTH_PORT=3000` in `.env`
- Manual test: `curl -v http://localhost:3000/health`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive troubleshooting guide.

---

## Changelog

### v2.1 (2025-10-15) - Production Ready Release

**🎉 New Features:**
- HTTP health check endpoints (`/health`, `/metrics`)
- Structured JSON logging system
- Command execution metrics tracking
- Critical error alerting via Discord webhooks
- Per-user, per-command rate limiting
- Automated database backup/restore scripts
- Docker health checks for bot container
- Bot personality configuration system

**🔧 Improvements:**
- Production-grade database connection pooling
- Graceful shutdown with resource cleanup
- Global error handlers for unhandled rejections
- Enhanced `/diag` command with metrics
- Backward-compatible module export aliases
- Comprehensive deployment documentation

**🐛 Bug Fixes:**
- Fixed memory persistence race conditions
- Fixed duplicate command loading
- Fixed channel mode filter bug
- Security: Removed google-service-account.json from git

**📊 Test Results:**
- Stress test pass rate: Expected 95%+ (up from 89.2%)
- All memory persistence tests passing
- Production deployment verified

### v2.0 (2025-10-09)
- Initial production-ready release
- MySQL database integration
- GPT-4o vision for Super Snail stats
- Comprehensive test suite

---

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

---

## License

MIT License - See LICENSE file for details

---

## Support

**Documentation:**
- [Deployment Guide](./DEPLOYMENT.md)
- [Project Instructions](./CLAUDE.md)

**Getting Help:**
- GitHub Issues: https://github.com/yourusername/slimy-bot/issues
- Use `/diag` command for bot diagnostics

---

**Built with ❤️ for the ADHD community and Super Snail players**
