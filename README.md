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

6. **Deploy slash commands:**
   ```bash
   npm run deploy
   ```

7. **Start the bot:**
   ```bash
   # Development (local)
   npm start

   # Production (Docker)
   docker compose up -d
   ```

8. **Verify health:**
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

### Image Generation
- `/dream <prompt> [style] [rating]` - Generate images via DALL-E

### Personality Configuration
- `/personality-config reload` - Reload bot personality from `bot-personality.md`

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
