# Secrets Reference

Repository secrets defined in GitHub → *Settings → Secrets and variables → Actions*:

| Secret name | Value | Used by | Notes |
|-------------|-------|---------|-------|
| `DISCORD_TOKEN` | `***REDACTED***` | Slimy Discord bot (`pm2` service, CLI scripts) | Update `.env` via workflows before restarting `slimy-bot`. |
| `DISCORD_CLIENT_ID` | `***REDACTED***` | Slimy Discord bot | Required for slash-command deploys. |
| `ADMIN_DISCORD_CLIENT_ID` | `***REDACTED***` | Admin API (`admin-api/.env.admin.production`) | OAuth application for the admin site. |
| `ADMIN_DISCORD_CLIENT_SECRET` | `***REDACTED***` | Admin API | Reset in Discord Dev Portal if compromised. |
| `ADMIN_DISCORD_BOT_TOKEN` | `***REDACTED***` | Admin API | Lets the admin service verify guild installs. |
| `ROLE_ADMIN_IDS` | _(optional)_ | Admin API | Comma-separated guild role IDs promoted to admin. |
| `ROLE_CLUB_IDS` | _(optional)_ | Admin API | Comma-separated guild role IDs promoted to club. |

### Workflow mapping

When composing `.env` files inside CI/CD, map the secrets to the expected variables, e.g.:

```yaml
env:
  DISCORD_TOKEN: ${{ secrets.DISCORD_TOKEN }}
  DISCORD_CLIENT_ID: ${{ secrets.DISCORD_CLIENT_ID }}
  ADMIN_DISCORD_CLIENT_ID: ${{ secrets.ADMIN_DISCORD_CLIENT_ID }}
  ADMIN_DISCORD_CLIENT_SECRET: ${{ secrets.ADMIN_DISCORD_CLIENT_SECRET }}
  ADMIN_DISCORD_BOT_TOKEN: ${{ secrets.ADMIN_DISCORD_BOT_TOKEN }}
  ROLE_ADMIN_IDS: ${{ secrets.ROLE_ADMIN_IDS }}
  ROLE_CLUB_IDS: ${{ secrets.ROLE_CLUB_IDS }}
```

Ensure deployment scripts write these values into `/opt/slimy/app/.env` and `/opt/slimy/app/admin-api/.env.admin.production` before restarting services.
