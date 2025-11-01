# Secrets Reference

Repository secrets defined in GitHub → *Settings → Secrets and variables → Actions*:

| Secret name | Value | Used by | Notes |
|-------------|-------|---------|-------|
| `DISCORD_TOKEN` | `MTQxNTM4NzExNjU2NDkxMDE2MQ.GvInmG.CDqWEBZx2p4upRZHnlC7Al4Ot8bpPv-5Kw4DZQ` | Slimy Discord bot (`pm2` service, CLI scripts) | Update `.env` via workflows before restarting `slimy-bot`. |
| `DISCORD_CLIENT_ID` | `1415387116564910161` | Slimy Discord bot | Required for slash-command deploys. |
| `ADMIN_DISCORD_CLIENT_ID` | `1431075878586290377` | Admin API (`admin-api/.env.admin.production`) | OAuth application for the admin site. |
| `ADMIN_DISCORD_CLIENT_SECRET` | `lkKc7DQP_AH9s1m4T2YS1QqLP8N-duRK` | Admin API | Reset in Discord Dev Portal if compromised. |
| `ADMIN_DISCORD_BOT_TOKEN` | `MTQzMTA3NTg3ODU4NjI5MDM3Nw.GGVf1t.H6p391cneIC1NVtKlykr-rHMHU5m7sUt8vu8eg` | Admin API | Lets the admin service verify guild installs. |
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
