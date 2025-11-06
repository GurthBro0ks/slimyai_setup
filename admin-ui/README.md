# Slimy Admin UI

Next.js 14 admin panel for managing the Slimy.ai Discord bot.

## Architecture

- **Framework**: Next.js 14 with standalone output
- **Port**: 3081 (behind Caddy reverse proxy)
- **API Base**: Configured via `NEXT_PUBLIC_ADMIN_API_BASE` environment variable
- **Authentication**: Session-based via httpOnly cookies from admin-api

## Development

```bash
# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Production build
NEXT_PUBLIC_ADMIN_API_BASE="" NODE_ENV=production npm run build

# Production mode
npm start
```

## Environment Variables

Create `.env.production` with:

```bash
# API Base URL - empty string for production (relative URLs)
NEXT_PUBLIC_ADMIN_API_BASE=""

# Bot invite configuration (uses bot app, not admin OAuth app)
NEXT_PUBLIC_BOT_CLIENT_ID=1415387116564910161
NEXT_PUBLIC_BOT_INVITE_SCOPES=bot applications.commands
NEXT_PUBLIC_BOT_PERMISSIONS=274878286848
```

## Key Files

- `pages/` - Next.js page routes
- `components/Layout.js` - Main layout with sidebar navigation + diagnostics widget
- `components/GuildUploadsTab.js` - Dashboard uploads grid + uploader
- `components/GuildSheetTab.js` - Google Sheet embed with corrections/rescan panels
- `components/CorrectionsManager.js` - Shared corrections editor (sheet tab + legacy page)
- `components/RescanUploader.js` - Shared screenshot rescan form
- `lib/session.js` - Session management hook (fetches `/api/auth/me`)
- `lib/api.js` - API client with credential handling + helpers
- `next.config.js` - Next.js configuration

## Deployment

The app uses systemd service `admin-ui.service`:

```bash
# Rebuild and restart
cd /opt/slimy/app/admin-ui
env NEXT_PUBLIC_ADMIN_API_BASE="" NODE_ENV=production npm run build
echo "cache-bust-$(date +%s)" > .next/BUILD_ID  # Force cache invalidation
sudo systemctl restart admin-ui

# Check logs
sudo journalctl -u admin-ui -f
```

## Important Notes

### Environment Variable Configuration

The `NEXT_PUBLIC_ADMIN_API_BASE` must be:
- **Empty string (`""`)** in production - uses relative URLs like `/api/auth/me`
- **`http://localhost:3080`** in development - for local API testing

The environment variable is:
1. Read from `.env.production` at **build time**
2. Embedded into JavaScript bundles
3. Must be set in systemd service environment for runtime access

### Cache Busting

After rebuilding, change the BUILD_ID to force browsers to fetch new JavaScript:

```bash
echo "cache-bust-$(date +%s)" > .next/BUILD_ID
```

### Troubleshooting `/undefined/api/*` Errors

If you see URLs like `/undefined/api/auth/me`:

1. Check `.env.production` has `NEXT_PUBLIC_ADMIN_API_BASE=""`
2. Verify `next.config.js` uses `!== undefined` check (not `||` which treats `""` as falsy)
3. Ensure `lib/api.js` and `lib/session.js` have `|| ""` fallback
4. Rebuild with correct env var
5. Clear browser cache completely or test in incognito mode

## Guild Dashboard Tabs

The guild dashboard now contains three tabs:

1. **Dashboard** – Existing health, task runner, and live log stream
2. **Uploads** – Multi-file screenshot uploader with responsive grid, powered by `/api/uploads/:guildId`
3. **Current Sheet** – Google Sheet embed (publish to web), plus corrections manager and rescan tools. If a guild is missing a configured sheet, the UI falls back to the published baseline `Baseline (10-24-25)` workbook until new data is available.

Sidebar includes a live diagnostics widget sourced from `/api/diag` (uptime, memory, upload totals).

## API Endpoints Used

- `GET /api/auth/me` - Get current user session
- `POST /api/auth/logout` - Clear session
- `GET /api/guilds` - List user's guilds with bot installation status
- `GET /api/guilds/:guildId/health` - Guild health metrics
- `GET /api/guilds/:guildId/settings` - Guild settings
- `GET /api/guilds/:guildId/channels` - Guild channel configuration
- `GET /api/guilds/:guildId/personality` - Bot personality settings
- `GET /api/guilds/:guildId/corrections` - User corrections
- `GET /api/guilds/:guildId/usage` - Usage statistics
- `GET /api/uploads/:guildId` - Guild uploads listing (thumbnails)
- `POST /api/uploads/:guildId` - Upload screenshots (multipart)
- `GET /api/diag` - Diagnostics snapshot for sidebar + dashboard metrics
- `POST /api/bot/rescan` - Bot rescan proxy (optional)

## Recent Updates (2025-10-25)

1. Added uploads tab with multi-file uploader, responsive gallery, and summary stats
2. Embedded Current Sheet tab with Google Sheet iframe, corrections manager, and rescan tools
3. Introduced diagnostics widget in sidebar pulling from `/api/diag`
4. Implemented cache-busting build ID generator and ensured empty-string API base support
