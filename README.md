# Slimy.ai Discord Bot - v2.0

A powerful AI-powered Discord bot with advanced memory, image generation, and personality features.

## 🎉 What's New in v2.0

### 🎨 Enhanced Image Generation
- **10 artistic styles** with `/dream` command (up from 4)
- New styles: anime, watercolor, 3D render, pixel art, sketch, cinematic
- View all styles with `/dream styles`
- Database logging for analytics

### 🧠 Advanced Memory System
- **Database-powered** storage (MySQL/MariaDB required)
- **Server-wide** consent management
- Tag support for organization
- Context tracking (channel, timestamp)
- Enhanced export with embeds

### 📊 Google Sheets Integration
- **Auto-create** spreadsheets with one click
- Automatic stats saving from Super Snail analysis
- Progress tracking over time
- Pre-configured tabs and headers

### 🤖 Personality Engine
- Context-aware responses
- 4 personality modes: mentor, partner, mirror, operator
- 3 content ratings: default, pg13, unrated
- Catchphrase rotation (no repetition!)
- User pattern detection

---

## 🛠 Recent Maintenance (Oct 2025)

- Replaced deprecated `ephemeral` options with `MessageFlags` so `/dream`, `/consent`, `/remember`, `/export`, and `/forget` stay compatible with the latest Discord API.
- Added fallback logic for memory and consent flows: when the database pool is unavailable the bot transparently uses the JSON store, keeping development servers functional.
- Introduced `db.initialize()` and safer `LIMIT` handling to harden database calls on startup.
- Sanitised the sample Google service account file and removed oversized backups from git; supply a real key before enabling `/consent sheets`.
- Expanded `.gitignore` to keep future local archives (e.g. `app-files-backup.tar.gz`) out of commits.

After pulling new changes, run `npm run deploy` to refresh slash commands before restarting the bot.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL 5.7+ or MariaDB 10.3+
- Discord Bot Token
- OpenAI API Key

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up MySQL database:**
```bash
# See DATABASE-SETUP.md for detailed instructions
mysql -u root -p
CREATE DATABASE slimy_ai_bot;
CREATE USER 'slimy_bot_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON slimy_ai_bot.* TO 'slimy_bot_user'@'localhost';
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Migrate data (if upgrading from v1.x):**
```bash
node scripts/migrate-to-database.js
```

5. **Deploy commands:**
```bash
npm run deploy
```

6. **Start the bot:**
```bash
npm start
# Or with PM2:
pm2 start ecosystem.config.js
```

---

## 📋 Commands

### 🎨 Image Generation
- `/dream` - Generate AI images with 10 artistic styles
- `/dream styles` - View all available art styles

### 🧠 Memory System
- `/consent status` - View your consent settings
- `/consent memory` - Enable/disable server-wide memory
- `/consent sheets` - Set up Google Sheets integration
- `/remember` - Save a note with optional tags
- `/export` - Export your memories as JSON
- `/forget` - Delete memories by ID or all

### 💬 Chat & Personality
- `/chat` - Chat with the AI assistant
- `/mode` - Set channel/category modes
- `/personality-config` - Admin panel for viewing analytics and running tests

### 🐌 Super Snail Tools
- `/snail analyze` - Analyze Super Snail screenshots with GPT-4 Vision
- `/snail calc` - Calculate tier costs
- `/snail sheet` - View saved stats from Google Sheets
- Stats automatically log to the database; enable Google Sheets with `/consent sheets`

### 🔧 Diagnostics
- `/diag` - Bot diagnostics and status

---

## 🗄️ Database Setup

The bot **requires** a MySQL/MariaDB database. See **DATABASE-SETUP.md** for:
- Cybrancee panel setup (recommended)
- Terminal/SSH setup instructions
- Database schema details
- Migration guide from v1.x
- Troubleshooting tips

### Local quick-start (dev)

1. Make sure MySQL is running on `127.0.0.1:3306` (e.g. `mysqladmin ping -uroot -proot`).
2. Provision the schema + user with mysql2:

```bash
DB_HOST=127.0.0.1 \
DB_PORT=3306 \
DB_NAME=s26873_slimy \
DB_USER=slimy_local \
DB_PASSWORD=slimy_local_dev \
DB_ADMIN_USER=root \
DB_ADMIN_PASSWORD=root \
node - <<'NODE'
const mysql = require('mysql2/promise');
(async () => {
  const env = process.env;
  const host = env.DB_HOST || '127.0.0.1';
  const port = Number(env.DB_PORT || 3306);
  const db   = env.DB_NAME || 's26873_slimy';
  const user = env.DB_USER || 'slimy_local';
  const pass = env.DB_PASSWORD || 'slimy_local_dev';
  const adminUser = env.DB_ADMIN_USER || 'root';
  const adminPass = env.DB_ADMIN_PASSWORD || '';

  const admin = await mysql.createConnection({ host, port, user: adminUser, password: adminPass });
  const safeDb = db.replace(/`/g, '``');
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${safeDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const hostTarget of ['localhost', '127.0.0.1', '%']) {
    await admin.query(`CREATE USER IF NOT EXISTS ?@'${hostTarget}' IDENTIFIED BY ?`, [user, pass]);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${safeDb}\`.* TO ?@'${hostTarget}'`, [user]);
  }
  await admin.query('FLUSH PRIVILEGES');
  await admin.end();

  const app = await mysql.createConnection({ host, port, user, password: pass, database: db });
  await app.query('SELECT 1');
  await app.end();
  console.log('✅ Database ready');
})();
NODE
```

3. Update `.env` (or use the defaults above) and run `node scripts/migrate-to-database.js`.

### Workflow scripts

- `scripts/dev-local-up.sh` – Optional helper that can hit a remote stop URL (`CYBRANCEE_STOP_URL`), verifies local MySQL connectivity, deploys slash commands, and starts the bot locally via pm2.
- `scripts/dev-local-down.sh` – Stops the local pm2 process, commits & pushes any pending git changes, then optionally hits a remote start URL (`CYBRANCEE_START_URL`).

Example environment variables:

```bash
export CYBRANCEE_STOP_URL="https://panel.cybrancee.example/api/stop"
export CYBRANCEE_START_URL="https://panel.cybrancee.example/api/start"
```

---

## 🎨 Personality Configuration

Customize the bot's personality by editing `bot-personality.md`:

```markdown
## Base Personality
Describe Slimy.ai's default voice and priorities.

## Traits
- Warm and approachable: ...
- Adaptive communicator: ...

## Tone Guidelines
- Keep language natural and direct
- Mix short punchy lines with deeper dives when needed

## Catchphrases
- Let's dive in!
- Here’s the vibe.
- Real talk.

## Context Behaviors
### When the user is overwhelmed
Provide reassurance and a small next step.

## Adaptation Rules
- Mirror the user’s energy level within reason
- Offer encouragement when frustration keywords appear
```

---

## 🔧 Configuration

### Required Environment Variables
```bash
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id

# Database (REQUIRED for v2.0)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=slimy_local
DB_PASSWORD=slimy_local_dev
DB_NAME=s26873_slimy

# OpenAI
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4o
VISION_MODEL=gpt-4o
IMAGE_MODEL=dall-e-3
```

### Optional Configuration
```bash
# Google Sheets
GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json
SHEETS_PARENT_FOLDER_ID=your_drive_folder_id

# Personality
PERSONALITY_CONFIG=./bot-personality.md
```

### Google Sheets Provisioning
- Ensure the service account JSON is available at the path set in `GOOGLE_APPLICATION_CREDENTIALS`.
- Set `SHEETS_PARENT_FOLDER_ID` to the Drive folder where per-user spreadsheets should live.
- Seed or repair per-user sheets at any time:
  ```bash
  node scripts/seed-sheets.js
  ```
- Sanity-check Drive access and append permissions:
  ```bash
  node scripts/verify-sheets.js
  ```
- To execute the full workflow (install deps, seed, restart, verify) run the `run-all` helper:
  ```bash
  # run-all
  set -euo pipefail

  npm install --silent googleapis mysql2 dotenv

  if grep -q '^GOOGLE_APPLICATION_CREDENTIALS=' .env; then
    sed -i 's|^GOOGLE_APPLICATION_CREDENTIALS=.*|GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json|' .env
  else
    echo 'GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json' >> .env
  fi

  if grep -q '^SHEETS_PARENT_FOLDER_ID=' .env; then
    sed -i 's|^SHEETS_PARENT_FOLDER_ID=.*|SHEETS_PARENT_FOLDER_ID=1ivR2dyxdQ1W3cNPOSKGYLdIceanJ5Epc|' .env
  else
    echo 'SHEETS_PARENT_FOLDER_ID=1ivR2dyxdQ1W3cNPOSKGYLdIceanJ5Epc' >> .env
  fi

  node scripts/seed-sheets.js
  pm2 restart slimyai --update-env
  node scripts/verify-sheets.js

  echo '✅ Sheets seeded and verified. Try /consent status then /snail analyze in Discord.'
  ```

---

## 📊 Features

### Memory System
- **Server-wide consent** management
- **Tagging** for organization
- **Context tracking** (channel, timestamp)
- **Database storage** with MySQL
- **Export** as JSON with embeds

### Image Generation
- **10 artistic styles**: standard, poster, neon, photoreal, anime, watercolor, 3d-render, pixel, sketch, cinematic
- **Database logging** for analytics
- **Rate limiting** (10s cooldown)
- **Error handling** with retry

### Google Sheets Integration
- **Auto-create** spreadsheets
- **Multiple tabs**: Stats History, Analysis Log, Info
- **Automatic saving** from `/snail analyze`
- **Service account** permission setup
- **Per-user folders** seeded via `scripts/seed-sheets.js`
- **One-tap verification** with `scripts/verify-sheets.js`

### Personality Engine
- **Context-aware** prompts
- **4 modes**: mentor, partner, mirror, operator
- **3 ratings**: default, pg13, unrated
- **Catchphrase rotation**
- **User pattern** detection

---

## 🔄 Migration from v1.x

If upgrading from v1.x:

1. **Backup your data:**
```bash
cp data_store.json data_store.json.backup
```

2. **Set up database** (see DATABASE-SETUP.md)

3. **Run migration:**
```bash
node scripts/migrate-to-database.js
```

The script will:
- Create all database tables
- Migrate consent preferences
- Migrate memories
- Create backup automatically
- Show detailed statistics

---

## 🐛 Troubleshooting

### Database Connection Issues
- Verify credentials in `.env`
- Check MySQL is running: `systemctl status mysql`
- Test connection: `node -e "require('./lib/database').testConnection()"`
- See DATABASE-SETUP.md for more help

### Command Not Found
- Run: `npm run deploy`
- Wait ~1 hour for global commands (or use DISCORD_GUILD_ID for instant updates)
- Restart bot after deploying

### Migration Errors
- Ensure database is created first
- Check file permissions on data_store.json
- Check migration logs for specific errors

---

## 📁 Project Structure

```
slimy.ai/
├── commands/          # Discord slash commands
│   ├── dream.js       # Image generation (10 styles)
│   ├── consent.js     # Consent management
│   ├── remember.js    # Memory storage
│   ├── chat.js        # AI chat
│   └── ...
├── lib/              # Core libraries
│   ├── database.js   # MySQL abstraction
│   ├── personality-engine.js  # Personality system
│   ├── sheets-creator.js      # Google Sheets
│   └── ...
├── scripts/          # Utility scripts
│   ├── migrate-to-database.js # Data migration
│   ├── seed-sheets.js        # Provision per-user Google Sheets
│   ├── verify-sheets.js      # Smoke-test Drive append access
│   └── test-dream-styles.js   # Generate sample images for every style
├── .env              # Environment config
├── bot-personality.md # Personality config
└── DATABASE-SETUP.md  # Database guide
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📜 License

MIT License - See LICENSE file for details

---

## 🙏 Credits

- Powered by OpenAI GPT-4 and DALL-E 3
- Built with Discord.js
- Google Sheets API integration
- MySQL/MariaDB database

---

## 📞 Support

- **Documentation:** See DATABASE-SETUP.md and V2-UPGRADE-COMPLETE.md
- **Logs:** `pm2 logs slimy-bot`
- **Issues:** Check GitHub issues
- **Database Help:** See DATABASE-SETUP.md troubleshooting section

---

## 🎉 v2.0 Highlights

- ✨ **10 image styles** with `/dream`
- 🧠 **MySQL database** for reliable storage
- 📊 **Auto-create** Google Sheets
- 🤖 **Advanced personality** engine
- 🏷️ **Tag support** in memories
- 📈 **Analytics** and logging
- 🔧 **Improved** error handling
- 📚 **Better** documentation

**Happy bot running! 🐌✨**
