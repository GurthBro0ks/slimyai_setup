# Authentication & Roles

## OAuth Flow

- Login is a single Discord OAuth button at `/api/auth/login`.
- After Discord authorization, callback at `/api/auth/callback` exchanges code for tokens.
- Bot membership checks run **in parallel** with 2-second timeout per guild for fast response.
- Role-based redirect after successful login:
  - `admin` → `/guilds` (full admin panel)
  - `club` → `/club` (club analytics)
  - `member` → `/snail` (snail tools only)

## Roles

Roles are derived from Discord permissions and member role IDs:
- `ROLE_ADMIN_IDS` (from env) → `admin`
- `ROLE_CLUB_IDS` (from env) → `club`
- Otherwise, if bot is installed in the guild → `member`
- `ADMINISTRATOR` or `MANAGE_GUILD` Discord permissions also grant `admin` role

## Session & Cookies

- JWT cookie (`slimy_admin`) carries minimal data: `{ id, username, globalName, avatar, role, guilds[] }`
- Cookie domain: `.slimyai.xyz` (works for all subdomains)
- Cookie settings: `httpOnly: true`, `secure: true`, `sameSite: "lax"`
- Server-side session store holds guilds data and access tokens (expires after 12h)
- Requires `trust proxy` set to 1 for reverse proxy (Caddy)

## Endpoints

- **GET `/api/auth/login`** - Initiates Discord OAuth flow
- **GET `/api/auth/callback`** - OAuth callback, creates session and redirects
- **GET `/api/auth/me`** - Returns current user with role and guilds
- **POST `/api/auth/logout`** - Clears session and cookie
- **GET `/api/ping`** - Health check (returns `{ ok: true, now: ... }`)
- **GET `/api/auth/debug`** - Session diagnostics (returns cookie status, user info)
