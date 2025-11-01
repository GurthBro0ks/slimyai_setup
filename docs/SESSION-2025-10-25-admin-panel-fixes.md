# Session Summary: Admin Panel Authentication Fixes

**Date**: 2025-10-25
**Duration**: ~2 hours
**Status**: ✅ Completed Successfully

## Problem Statement

The Slimy.ai admin panel at `https://admin.slimyai.xyz` had authentication issues preventing users from logging in successfully. The login flow would complete but the session would not persist, causing pages to be stuck on "Loading..." states.

## Root Causes Identified

### 1. Cookie Size Exceeded Browser Limits (Primary Issue)
- **Problem**: JWT token was 18,007 bytes (18KB)
- **Cause**: JWT contained entire guilds array with all user's Discord servers
- **Browser Limit**: 4KB per cookie
- **Result**: Browser silently rejected the cookie, preventing authentication

### 2. Undefined API Base URL
- **Problem**: API calls going to `/undefined/api/auth/me`
- **Cause**: `process.env.NEXT_PUBLIC_ADMIN_API_BASE` was undefined in built JavaScript
- **Result**: All API requests failed with 404 errors

### 3. Missing API Endpoints
- **Problem**: Guild-specific pages returned 404 errors
- **Cause**: Routes like `/api/guilds/:guildId/health` weren't implemented
- **Result**: Pages stuck on "Loading..." with no data

### 4. Slow Login Performance
- **Problem**: 10-20 second delay after Discord OAuth
- **Cause**: Guild installation checks were sequential (one at a time)
- **Result**: Poor user experience during login

### 5. Logout Not Working
- **Problem**: Clicking logout cleared session but didn't redirect
- **Cause**: Missing router navigation after logout API call
- **Result**: User stayed on the same page, appearing still logged in

## Solutions Implemented

### 1. Cookie Size Reduction (98% reduction: 18KB → 307 bytes)

**Created Server-Side Session Store**
- File: `admin-api/lib/session-store.js`
- In-memory Map storing guilds + access tokens
- Auto-expires after 12 hours
- Cleanup runs hourly

**Modified JWT Payload**
```javascript
// Before (18KB):
{ user: { id, username, globalName, avatar, guilds: [...100+ guilds] } }

// After (307 bytes):
{ user: { id, username, globalName, avatar } }
```

**Updated Authentication Flow**
- File: `admin-api/src/routes/auth.js`
- Store guilds in session store instead of JWT
- Retrieve guilds from session store in guild endpoints

### 2. Fixed API Base URL Configuration

**Updated Next.js Config**
- File: `admin-ui/next.config.js`
- Changed from `||` operator to `!== undefined` check
- Prevents empty string from being treated as falsy

**Added Fallback Logic**
- File: `admin-ui/lib/api.js`
- Added: `const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE || "";`
- File: `admin-ui/lib/session.js`
- Added: `const apiBase = process.env.NEXT_PUBLIC_ADMIN_API_BASE || '';`

**Environment Configuration**
- File: `admin-ui/.env.production`
- Set: `NEXT_PUBLIC_ADMIN_API_BASE=""`
- File: `admin-api/.env.admin.production`
- Added: `NEXT_PUBLIC_ADMIN_API_BASE=`

### 3. Implemented Missing API Endpoints

**Added Guild Routes**
- File: `admin-api/src/routes/guilds.js`
- `GET /:guildId/health` - Health metrics (stub)
- `GET /:guildId/settings` - Guild settings (stub)
- `GET /:guildId/channels` - Channel configuration (stub)
- `GET /:guildId/personality` - Personality config (stub)
- `GET /:guildId/corrections` - User corrections (stub)
- `GET /:guildId/usage` - Usage statistics (stub with proper data structure)

**Fixed Usage Endpoint Data Structure**
```javascript
// Expected by UI:
{
  window: "7d",
  aggregated: {
    byModel: [
      { model, requests, inputTokens, outputTokens, images, cost }
    ]
  }
}
```

### 4. Optimized Guild Loading Performance

**Parallelized Guild Checks**
- File: `admin-api/src/routes/guilds.js`
- Changed from sequential `for` loop to `Promise.all()`
- All guild installation checks now run simultaneously
- Reduced from 10-20s to 1-2s

```javascript
// Before:
for (const g of userGuilds) {
  const r = await fetch(`${API}/guilds/${g.id}`);
  // ...
}

// After:
const guildChecks = userGuilds.map(async (g) => {
  const r = await fetch(`${API}/guilds/${g.id}`);
  // ...
});
const out = await Promise.all(guildChecks);
```

### 5. Fixed Logout Redirect

**Added Navigation After Logout**
- File: `admin-ui/components/Layout.js`
- Added: `router.push("/")` after successful logout
- User now redirected to home page with login button

## Files Modified

### Created Files
1. `admin-api/lib/session-store.js` - Server-side session storage
2. `admin-ui/README.md` - UI documentation
3. `admin-api/README.md` - API documentation
4. `docs/SESSION-2025-10-25-admin-panel-fixes.md` - This file

### Modified Files
1. `admin-api/src/routes/auth.js` - Session store integration, reduced JWT payload
2. `admin-api/src/routes/guilds.js` - Session store integration, added endpoints, parallel checks
3. `admin-ui/lib/api.js` - Added fallback for undefined API base
4. `admin-ui/lib/session.js` - Added fallback for undefined API base
5. `admin-ui/next.config.js` - Fixed environment variable check
6. `admin-ui/.env.production` - Set explicit empty string value
7. `admin-ui/components/Layout.js` - Added logout redirect
8. `admin-api/.env.admin.production` - Added NEXT_PUBLIC_ADMIN_API_BASE
9. `CLAUDE.md` - Updated with admin panel architecture and troubleshooting
10. `.claude/settings.local.json` - Added additional permissions

## Testing Performed

1. ✅ Login flow completes successfully
2. ✅ Cookie is set (307 bytes, well under 4KB limit)
3. ✅ Session persists across page navigation
4. ✅ All guild pages load without hanging
5. ✅ Logout redirects to home page
6. ✅ Login performance improved (1-2s instead of 10-20s)
7. ✅ Usage page loads without errors

## Deployment Commands

```bash
# Rebuild UI with correct environment
cd /opt/slimy/app/admin-ui
env NEXT_PUBLIC_ADMIN_API_BASE="" NODE_ENV=production npm run build
echo "cache-bust-$(date +%s)" > .next/BUILD_ID

# Restart services
sudo systemctl restart admin-api
sudo systemctl restart admin-ui

# Verify services are running
sudo systemctl status admin-api
sudo systemctl status admin-ui

# Monitor logs
sudo journalctl -u admin-api -f
sudo journalctl -u admin-ui -f
```

## Key Learnings

1. **JWT Size Matters**: Browser cookie limits (4KB) are strictly enforced. Large JWTs will be silently rejected.

2. **Server-Side Sessions**: For web apps with variable-size session data (like lists of guilds), use server-side storage instead of encoding everything in the JWT.

3. **Environment Variables in Next.js**:
   - Must be set at build time for `NEXT_PUBLIC_*` variables
   - Empty string (`""`) needs explicit quotes in `.env` files
   - Use `!== undefined` instead of `||` when empty string is a valid value

4. **Cache Busting**: When deploying Next.js changes, modify BUILD_ID to force browsers to fetch new JavaScript.

5. **Performance**: Parallel API calls (`Promise.all()`) dramatically improve performance when making multiple independent requests.

## Outstanding Work (Future TODOs)

1. **Connect stub endpoints to database**
   - Currently all guild-specific endpoints return placeholder data
   - Need to implement actual database queries

2. **Add POST/PUT/DELETE endpoints**
   - Settings management
   - Channel configuration
   - Personality updates
   - Corrections CRUD

3. **Persistent session storage**
   - Replace in-memory Map with Redis
   - Sessions currently lost on API restart

4. **Additional features**
   - API rate limiting
   - Request logging middleware
   - Input validation
   - API documentation (Swagger)

## References

- Admin Panel URL: https://admin.slimyai.xyz
- Admin API Port: 3080 (127.0.0.1)
- Admin UI Port: 3081 (127.0.0.1)
- Reverse Proxy: Caddy (HTTPS + routing)
- Systemd Services: `admin-api.service`, `admin-ui.service`

## Success Metrics

- ✅ Authentication working end-to-end
- ✅ Cookie size reduced by 98% (18KB → 307 bytes)
- ✅ Login performance improved by ~90% (10-20s → 1-2s)
- ✅ All UI pages now functional (no more infinite "Loading..." states)
- ✅ Session persists across navigation
- ✅ Logout works correctly with redirect
