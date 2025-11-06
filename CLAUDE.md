# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Slimy.ai**, a Discord bot built with Discord.js v14 that provides AI-powered chat, memory management, personality modes, and game-specific features (Super Snail stats analysis via GPT-4 Vision). The bot uses OpenAI for conversational AI and vision capabilities, with both JSON file storage and MySQL database support.

## Development Commands

### Running the Bot
```bash
npm start                    # Start the bot (index.js)
node index.js               # Alternative direct invocation
```

### Command Deployment
```bash
npm run deploy              # Deploy slash commands to Discord
node deploy-commands.js     # Alternative direct invocation
```
- Uses guild-specific deployment if `DISCORD_GUILD_ID` is set (instant updates for testing)
- Uses global deployment if `DISCORD_GUILD_ID` is blank (takes ~1 hour to propagate)

### Testing
```bash
npm run test:memory         # Run memory persistence tests
node tests/memory-simple.test.js
```

## Architecture Overview

### Core Bot Structure

**Entry Point: `index.js`**
- Singleton lock mechanism (`.slimy-singleton.lock`) prevents duplicate instances
- Initializes database connection (`lib/database.js`)
- Loads slash commands from `commands/` directory
- Attaches event handlers from `handlers/` directory
- Global bot statistics tracking (`global.botStats`)

**Command System**
- Commands are auto-loaded from `commands/` directory
- Each command exports `{ data: SlashCommandBuilder, execute: async function }`
- Commands stored in `client.commands` Collection
- Dispatcher in `index.js` handles `InteractionCreate` events

**Handler System**
- `handlers/mention.js`: Processes @bot mentions and routes to chat
- `handlers/snail-auto-detect.js`: Auto-detects Super Snail screenshots in messages
- Handlers are gracefully loaded (bot continues if handlers fail)

### Data Layer Architecture

**Dual Storage System**
1. **JSON File Storage** (`lib/memory.js`)
   - Uses `data_store.json` with file locking (`proper-lockfile`)
   - Stores: consent preferences, memos, channel mode configurations
   - Atomic writes with temp file + rename pattern
   - Recent fixes: UUID-based IDs, race condition prevention

2. **MySQL Database** (`lib/database.js`)
   - Connection pooling via `mysql2/promise`
   - Optional (bot works without DB configured)
   - Stores: users, guilds, memories, snail stats, image generation logs, personality metrics
   - Auto-creates tables on initialization
   - Schema includes foreign keys with CASCADE/SET NULL

**Environment Detection**
- Database is optional: check `database.isConfigured()` before using DB features
- JSON storage is always available as fallback

### AI Integration

**OpenAI Client** (`lib/openai.js`)
- Shared OpenAI instance configured with API key
- Used by chat, vision, and image generation features

**Personality Engine** (`lib/personality-engine.js`)
- Parses `bot-personality.md` configuration file
- Builds dynamic system prompts based on mode/rating/user history
- Supports: traits, catchphrases, tone guidelines, context behaviors
- Tracks usage metrics and adaptation signals

**Persona System** (`lib/persona.js`)
- Predefined personas: mentor, partner, mirror, operator, personality, no_personality
- Auto-detection based on user message content
- Can be overridden by channel mode configuration

**Mode System** (`lib/modes.js`)
- Channel/category/thread-level mode configuration
- Modes: admin, chat, personality, no_personality, super_snail, rating_pg13, rating_unrated
- Hierarchical resolution: thread → channel → category
- Operations: view, merge, remove, replace

### Vision & Image Features

**GPT-4 Vision Integration**
- `lib/vision.js`: General-purpose vision API wrapper
- `lib/snail-vision.js`: Super Snail specific stat extraction
- `lib/auto-image.js`: Auto-generates images via DALL-E based on intent detection
- `lib/image-intent.js`: Detects image generation intent in user messages

**Image Generation**
- Uses OpenAI DALL-E API
- Logs generations to database (`image_generation_log` table)
- Rating-aware (pg13 vs unrated)

### Google Sheets Integration

**Sheet Management** (`lib/sheets.js`, `lib/sheets-creator.js`, `lib/sheets-drive-create.js`)
- Per-user Google Sheets for Super Snail stat tracking
- Service account authentication via `google-service-account.json`
- Auto-creates sheets on first use with proper permissions
- Stores sheet metadata in database (`user_guilds.sheet_id`)

## Key Commands

### Memory Commands
- `/remember <note>` - Store a memory (requires consent)
- `/recall [limit]` - List stored memories
- `/forget <id>` - Delete a specific memory
- `/forget all` - Delete all memories in current context
- `/consent set <allow>` - Enable/disable memory storage
- `/consent status` - Check current consent status

### Chat Commands
- `/chat <message> [reset]` - Chat with AI (maintains conversation history)
- @mention the bot - Alternative chat interface (uses same backend)

### Mode Configuration
- `/mode view` - Show current channel modes
- `/mode set <modes>` - Configure channel behavior
- `/mode clear` - Remove all mode configurations

### Super Snail Features
- `/snail <image>` - Analyze stats from screenshot (GPT-4 Vision)
- Auto-detection of snail screenshots in channels (via handler)

### Utility Commands
- `/diag` - Bot diagnostics (uptime, errors, memory usage)
- `/export memories` - Export memories to JSON file
- `/personality-config reload` - Reload bot personality configuration
- `/dream <prompt>` - Generate images via DALL-E

## Important Patterns

### Error Handling
- All async operations use try/catch with fallbacks
- Database operations check `database.isConfigured()` first
- Commands use interaction deferral for long-running operations
- Errors are logged to `global.botStats.errors`

### Consent Management
- Memory operations require user consent per guild
- Global consent stored in database (`users.global_consent`)
- Sheets consent stored separately (`user_guilds.sheets_consent`)
- Always check consent before storing user data

### File Locking
- Use `proper-lockfile` for concurrent access to `data_store.json`
- Atomic writes: write to `.tmp` file, then rename
- Stale lock detection (10 second timeout)

### Conversation History
- In-memory history per (channelId, userId) key
- Limited to MAX_TURNS * 2 messages (16 total)
- No persistence - resets on bot restart

## Environment Variables

**Required:**
- `DISCORD_TOKEN` - Bot token
- `DISCORD_CLIENT_ID` - Application ID

**Optional:**
- `DISCORD_GUILD_ID` - For guild-specific command deployment
- `OPENAI_API_KEY` - For AI features
- `VISION_MODEL` - GPT-4 Vision model (default: gpt-4o)
- `OPENAI_MODEL` - Chat model (default: gpt-4o)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - MySQL config
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Inline service account JSON
- `SHEETS_PARENT_FOLDER_ID` - Google Drive folder for sheets

## Testing Strategy

**Memory Tests** (`tests/memory-simple.test.js`, `tests/memory-loop.test.js`)
- Test consent management
- Test memo CRUD operations
- Test concurrent access patterns
- Verify data persistence after save

**Manual Testing**
- Deploy to test guild first (`DISCORD_GUILD_ID` set)
- Test each command in isolated channel
- Verify database entries after operations
- Check logs for errors (`global.botStats.errors`)

## Recent Bug Fixes (as of 2025-10-09)

1. Memory persistence race conditions fixed with file locking
2. UUID-based memo IDs (replaced timestamp-based approach)
3. Proper async/await usage in save operations
4. Duplicate command loading prevention
5. Channel mode filter bug (DM notes appearing in guild queries)

## Common Workflows

### Adding a New Command
1. Create `commands/yourcommand.js`
2. Export `data` (SlashCommandBuilder) and `execute` function
3. Run `npm run deploy` to register with Discord
4. Restart bot with `npm start`

### Modifying Personality
1. Edit `bot-personality.md` (markdown format)
2. Use `/personality-config reload` to apply changes (no restart needed)
3. Test in channel with personality mode enabled

### Database Schema Changes
1. Modify `createTables()` in `lib/database.js`
2. Drop/recreate tables or run manual migration
3. Update query methods as needed
4. Test with `database.testConnection()`
