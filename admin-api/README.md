# Slimy Admin API

Express.js REST API for the Slimy.ai Discord bot admin panel.

## Architecture

- **Framework**: Express.js with middleware for auth, CORS, helmet
- **Port**: 3080 (127.0.0.1, behind Caddy reverse proxy)
- **Authentication**: Discord OAuth2 (identify + guilds scopes)
- **Session Management**: JWT in httpOnly cookies + server-side session store

## Development

```bash
# Install dependencies
npm install

# Start server
npm start  # or: node server.js
```

## Environment Variables

Create `.env.admin.production` with:

```bash
# API
PORT=3080
HOST=127.0.0.1
NODE_ENV=production

# Discord OAuth (scopes: identify, guilds) - ADMIN PANEL AUTH
DISCORD_CLIENT_ID=your_oauth_app_id
DISCORD_CLIENT_SECRET=your_oauth_secret
DISCORD_REDIRECT_URI=https://admin.slimyai.xyz/api/auth/callback

# Discord Bot credentials - for checking bot membership
DISCORD_BOT_TOKEN=your_bot_token

# Session & Cookie
SESSION_SECRET=random_secret_key
COOKIE_NAME=slimy_admin
COOKIE_DOMAIN=.slimyai.xyz
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

# Next.js UI environment - empty string means relative URLs
NEXT_PUBLIC_ADMIN_API_BASE=

# CORS
ALLOWED_ORIGIN=https://admin.slimyai.xyz
```

## Directory Structure

```
admin-api/
├── lib/
│   ├── jwt.js                 # JWT signing/verification, cookie helpers
│   └── session-store.js       # In-memory session store for guilds data
├── src/
│   ├── app.js                 # Express app setup
│   ├── config.js              # Environment configuration
│   ├── middleware/
│   │   └── auth.js            # Authentication middleware
│   └── routes/
│       ├── index.js           # Route registry
│       ├── auth.js            # OAuth flow: login, callback, logout, /me
│       └── guilds.js          # Guild management endpoints
└── server.js                  # Entry point
```

## Authentication Flow

1. **Login** (`GET /api/auth/login`)
   - Generates OAuth state token, stores in cookie
   - Redirects to Discord OAuth with `identify` + `guilds` scopes

2. **Callback** (`GET /api/auth/callback`)
   - Validates state token
   - Exchanges code for access token
   - Fetches user info and guilds from Discord API
   - Creates JWT with minimal user data (id, username, avatar) - ~307 bytes
   - Stores guilds + access token in server-side session store
   - Sets `slimy_admin` httpOnly cookie with 12h expiry
   - Redirects to `/guilds`

3. **Authentication Check** (`GET /api/auth/me`)
   - Reads JWT from cookie
   - Returns user object or 401

4. **Logout** (`POST /api/auth/logout`)
   - Clears server-side session
   - Clears cookie

## Session Store

**Location**: `lib/session-store.js`

**Purpose**: Store guilds array and access tokens server-side to avoid exceeding cookie size limits (4KB browser maximum).

**Implementation**:
- In-memory Map (not persistent across restarts)
- Auto-expires sessions after 12 hours
- Cleanup runs every hour

**Structure**:
```javascript
{
  userId: {
    accessToken: "discord_access_token",
    refreshToken: "discord_refresh_token",
    guilds: [{ id, name, icon, owner, permissions }],
    createdAt: timestamp
  }
}
```

## API Endpoints

### Authentication
- `GET /api/auth/login` - Initiate OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Clear session

### Guilds
- `GET /api/guilds` - List user's guilds with bot installation status (checks in parallel)
- `GET /api/guilds/:guildId/health` - Health metrics (stub)
- `GET /api/guilds/:guildId/settings` - Guild settings (stub)
- `GET /api/guilds/:guildId/channels` - Channel configuration (stub)
- `GET /api/guilds/:guildId/personality` - Personality config (stub)
- `GET /api/guilds/:guildId/corrections` - User corrections (stub)
- `GET /api/guilds/:guildId/usage` - Usage statistics (stub)

**Note**: Endpoints marked (stub) return placeholder data and need database integration.

### Uploads & Diagnostics
- `GET /api/uploads/:guildId` — List recent uploads (thumbnails + links), auth required
- `POST /api/uploads/:guildId` — Multipart upload (`files[]`) limited to 20 images, auto-generates JPEG, XL, and thumbnail variants
- `GET /api/diag` — Lightweight diagnostics snapshot (uptime, memory, upload counts), auth required
- `POST /api/bot/rescan` — Optional proxy to bot service defined by `BOT_RESCAN_URL`
- Static serving: `/api/uploads/files/...` — Public read-only access to processed files with 7d cache headers (reverse-proxied under `/api`)

Environment:
```
UPLOADS_DIR=/var/lib/slimy/uploads   # storage root
MAX_UPLOAD_MB=25                     # per-file size cap
BOT_RESCAN_URL=http://127.0.0.1:8080/rescan (optional)
```

## Deployment

The app runs as systemd service `admin-api.service`:

```bash
# Restart service
sudo systemctl restart admin-api

# Check logs
sudo journalctl -u admin-api -f

# Check specific errors
sudo journalctl -u admin-api -n 100 | grep -E "(error|ERROR)"
```

## Recent Fixes (2025-10-25)

1. **Cookie Size Issue**
   - Problem: JWT with guilds array was 18KB, exceeding browser limits
   - Solution: Moved guilds to server-side session store, JWT now 307 bytes
   - Files: `lib/session-store.js`, `src/routes/auth.js`, `src/routes/guilds.js`

2. **Missing Endpoints**
   - Added stub endpoints for all guild-specific routes
   - All return placeholder data until database integration

3. **Slow Guild Loading**
   - Changed guild installation checks from sequential to parallel
   - Uses `Promise.all()` to check all guilds simultaneously
   - Reduced load time from 10-20s to 1-2s

## Middleware

### Authentication Middleware

**`readAuth`** (in `src/middleware/auth.js`):
- Reads JWT from `slimy_admin` cookie
- Verifies signature and expiry
- Populates `req.user` if valid
- Continues even if no auth (non-blocking)

**`requireAuth`**:
- Checks if `req.user` exists
- Returns 401 if not authenticated
- Use on protected routes

**Usage**:
```javascript
const { requireAuth } = require('../middleware/auth');

router.get('/protected', requireAuth, (req, res) => {
  // req.user is guaranteed to exist here
  res.json({ user: req.user });
});
```

## Security Notes

- All cookies have `httpOnly: true` (not accessible via JavaScript)
- Cookies have `secure: true` (only sent over HTTPS)
- `sameSite: 'lax'` prevents CSRF attacks
- JWT signed with `SESSION_SECRET`
- CORS restricted to `ALLOWED_ORIGIN`
- Helmet.js security headers enabled

## TODO

- [ ] Connect stub endpoints to actual database
- [ ] Implement POST/PUT/DELETE endpoints for settings
- [ ] Add Redis for persistent session storage
- [ ] Add rate limiting
- [ ] Add request logging middleware
- [ ] Implement proper error handling with error codes
- [ ] Add input validation (express-validator)
- [ ] Add API documentation (Swagger/OpenAPI)
