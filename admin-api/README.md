# Slimy Admin API

The admin API powers Discord OAuth for the web dashboard and exposes health/diagnostic
endpoints consumed by `admin.slimyai.xyz`.

## Environment

The service reads `.env.admin.production`. In production we currently use:

```bash
PORT=3080
SESSION_SECRET=your_session_secret_here
COOKIE_DOMAIN=.slimyai.xyz
CORS_ALLOW_ORIGIN=https://admin.slimyai.xyz,http://127.0.0.1:3000,http://localhost:3000

# Discord OAuth (Slimy admin application)
DISCORD_CLIENT_ID=your_admin_client_id_here
DISCORD_CLIENT_SECRET=your_admin_client_secret_here
DISCORD_BOT_TOKEN=your_admin_bot_token_here

# Optional role promotion (comma-separated IDs)
ROLE_ADMIN_IDS=
ROLE_CLUB_IDS=
ADMIN_USER_IDS=
CLUB_USER_IDS=
```

GitHub secrets mirror these values:

| Secret name | Purpose | Injected env |
|-------------|---------|--------------|
| `ADMIN_DISCORD_CLIENT_ID` | OAuth client ID for the admin panel | `DISCORD_CLIENT_ID` |
| `ADMIN_DISCORD_CLIENT_SECRET` | OAuth client secret | `DISCORD_CLIENT_SECRET` |
| `ADMIN_DISCORD_BOT_TOKEN` | Bot token used to verify guild installs | `DISCORD_BOT_TOKEN` |

CI/deploy workflows must export the secrets into the `.env.admin.production` file before restarting the `admin-api` service.

## Service Management

```bash
sudo systemctl restart admin-api
sudo systemctl status admin-api
curl -fsS https://admin.slimyai.xyz/api/health
```

## OAuth Redirects

Ensure the Discord Developer Portal lists `https://admin.slimyai.xyz/api/auth/callback`
in the OAuth redirect whitelist for application `slimy.ai admin`.
