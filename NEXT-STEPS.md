# 🚀 Next Steps - Slimy.ai v2.0 Deployment

**Automated upgrade complete!** Follow these steps to complete the deployment.

---

## ✅ Step 1: Database Setup (REQUIRED)

The bot **will not start** without a MySQL database.

### Option A: Cybrancee Panel (Recommended)

1. Log in to your Cybrancee control panel
2. Navigate to **Databases** section
3. Click **"Create Database"**
   - Database name: `slimy_ai_bot`
   - Click **Create**

4. Click **"Create User"**
   - Username: `slimy_bot_user`
   - Password: **Generate secure password** (save it!)
   - Click **Create**

5. **Grant Permissions**
   - Find `slimy_bot_user` in user list
   - Select `slimy_ai_bot` database
   - Grant **ALL PRIVILEGES**
   - Click **Save**

### Option B: Terminal/SSH

```bash
# Connect to MySQL
mysql -u root -p

# Run these commands
CREATE DATABASE slimy_ai_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'slimy_bot_user'@'localhost' IDENTIFIED BY 'YOUR_SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON slimy_ai_bot.* TO 'slimy_bot_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**📖 Detailed instructions:** See `DATABASE-SETUP.md`

---

## ✅ Step 2: Update .env File

Edit your `.env` file and add these lines:

```bash
# Database Configuration (REQUIRED)
DB_HOST=localhost
DB_PORT=3306
DB_USER=slimy_bot_user
DB_PASSWORD=your_password_from_step1
DB_NAME=slimy_ai_bot
```

**Important:** Replace `your_password_from_step1` with the actual password you created.

### Verify Your .env File Contains:

```bash
# Discord
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id

# Database (NEW - REQUIRED)
DB_HOST=localhost
DB_PORT=3306
DB_USER=slimy_bot_user
DB_PASSWORD=your_secure_password
DB_NAME=slimy_ai_bot

# OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o
VISION_MODEL=gpt-4o
IMAGE_MODEL=dall-e-3

# Google Sheets (Optional)
GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json
```

---

## ✅ Step 3: Migrate Data (If Upgrading from v1.x)

**Skip this step if:** You're doing a fresh install.

**Do this step if:** You have existing data in `data_store.json`.

```bash
# The migration script will:
# - Create all database tables automatically
# - Migrate your consent preferences
# - Migrate your memories
# - Create a backup in backups/ folder

node scripts/migrate-to-database.js
```

**Expected output:**
```
🚀 Starting migration from data_store.json to database...
✅ Database connection successful
✅ Database tables created
✅ Backup created: backups/data_store.2025-10-07T12-30-45.json

📋 Migrating consent preferences...
  ✅ Migrated: 5

📝 Migrating memories...
  ✅ Migrated: 23

📊 MIGRATION SUMMARY
✅ Consent preferences migrated: 5
✅ Memories migrated: 23
💾 Backup saved to: backups/data_store.2025-10-07T12-30-45.json

✅ Migration complete!
```

---

## ✅ Step 4: Test Database Connection

Before deploying, verify the database connection works:

```bash
node -e "require('./lib/database').testConnection().then(() => console.log('✅ Database connected!')).catch(e => console.error('❌ Error:', e.message))"
```

**Expected output:** `✅ Database connected!`

**If you see an error:**
- Check your `.env` credentials
- Verify MySQL is running: `systemctl status mysql`
- See DATABASE-SETUP.md troubleshooting section

---

## ✅ Step 5: Deploy Commands to Discord

Deploy the new commands to Discord:

```bash
npm run deploy
```

**Expected output:**
```
Deploying 12 command(s) globally...
✅ Slash commands registered globally.
⏱️  Note: Global commands take ~1 hour to propagate.
```

### For Instant Testing (Optional)

If you want instant command updates for testing in one server:

1. Edit `.env` and add:
   ```bash
   DISCORD_GUILD_ID=your_test_server_id
   ```

2. Run deploy:
   ```bash
   npm run deploy
   ```

3. Commands will update instantly in that server only!

---

## ✅ Step 6: Restart the Bot

### If using PM2:
```bash
pm2 restart slimy-bot

# Check logs
pm2 logs slimy-bot
```

### If using npm start:
```bash
# Stop the bot (Ctrl+C if running)
# Then start it again
npm start
```

**Expected startup logs:**
```
[memory] json-store ready (FIXED VERSION with locking & UUID)
[database] Connection pool initialized
✅ Loaded command: dream
✅ Loaded command: consent
...
✅ Logged in as slimy.ai#1234
📡 Connected to 3 server(s)
```

---

## ✅ Step 7: Test New Features

Test each major feature to verify everything works:

### Test Database Connection
```
/consent status
```
**Expected:** Shows your current consent settings with embeds

### Test Memory System
```
/consent memory enable:true
/remember note:"Testing v2.0 upgrade" tags:"test,v2"
/export
```
**Expected:** Memory saved to database and exported as JSON

### Test Image Generation
```
/dream styles
```
**Expected:** Shows all 10 art styles in an embed

```
/dream create prompt:"A cute robot" style:anime
```
**Expected:** Generates an anime-style image

### Test Google Sheets (If Configured)
```
/consent sheets enable:true
```
**Expected:** Auto-creates a Google Sheet for you

```
/snail analyze
```
*Upload a Super Snail screenshot*
**Expected:** Analyzes stats and saves to your sheet

---

## ✅ Step 8: Verify Everything Works

Run through this checklist:

- [ ] Database connection successful
- [ ] Migration completed (if applicable)
- [ ] Commands deployed
- [ ] Bot started without errors
- [ ] `/consent status` works
- [ ] `/remember` saves to database
- [ ] `/export` retrieves memories
- [ ] `/dream styles` shows 10 styles
- [ ] `/dream create` generates images
- [ ] Google Sheets auto-creation works (if configured)

---

## 🎉 You're Done!

Your bot is now running **slimy.ai v2.0** with:

- ✨ **10 image styles** with `/dream`
- 🧠 **MySQL database** for reliable storage
- 📊 **Auto-created Google Sheets**
- 🤖 **Advanced personality** engine
- 🏷️ **Tag support** in memories
- 📈 **Analytics & logging**

---

## 🐛 Troubleshooting

### Bot won't start - "Database not configured"
- Check `.env` has all DB_* variables
- Verify database exists: `mysql -u slimy_bot_user -p slimy_ai_bot`

### Commands not appearing in Discord
- Wait ~1 hour for global commands
- OR set DISCORD_GUILD_ID for instant updates in one server
- Verify bot has `applications.commands` scope

### "Migration failed" error
- Ensure database is created first
- Check data_store.json exists and is readable
- Look at backup in `backups/` folder

### Google Sheets not working
- Verify GOOGLE_APPLICATION_CREDENTIALS in .env
- Check service account JSON file exists
- Enable Google Sheets API in Google Cloud Console

### Need more help?
- Check `DATABASE-SETUP.md` for database issues
- Check `V2-UPGRADE-COMPLETE.md` for full upgrade details
- Review bot logs: `pm2 logs slimy-bot`

---

## 📚 Additional Resources

- **DATABASE-SETUP.md** - Detailed database setup and troubleshooting
- **V2-UPGRADE-COMPLETE.md** - Complete upgrade summary
- **README.md** - Full documentation and features
- **bot-personality.md** - Customize bot personality
- **.env.example** - All configuration options

---

## ⚠️ Important Notes

1. **Database is REQUIRED** - Bot will not start without it
2. **Global commands** take ~1 hour to update
3. **Keep backups** - Migration creates automatic backups
4. **Test thoroughly** before production use

---

**Need help?** Check the troubleshooting sections in:
- This file (above)
- DATABASE-SETUP.md
- V2-UPGRADE-COMPLETE.md

**Happy bot running! 🐌✨**
