# Admin UI – Next Steps

This doc outlines the exact commands to deploy the refreshed admin UI (with the chat fixes and email-login tab) and verify the new multi-source snail code sync. Replace the placeholder values (e.g., `your-host`) with your deployment target.

---

## 1. Build & Ship the Admin UI

1. **Pull and install (on the host)**
   ```bash
   ssh your-host
   cd /opt/slimy/app
   git pull
   npm install --ignore-scripts
   ```

2. **Create the production bundle**
   ```bash
   npm --workspace admin-ui run build
   ```

3. **Restart the running UI service**
   - **PM2 example**
     ```bash
     pm2 restart admin-ui
     pm2 status admin-ui
     ```
   - **Systemd example**
     ```bash
     sudo systemctl restart slimy-admin-ui
     sudo systemctl status slimy-admin-ui --no-pager
     ```

4. **(Optional) Regenerate static assets for CDN cache busting**
   ```bash
   find admin-ui/.next/static -type f -print
   ```

---

## 2. Smoke-Test the Chat Flow

1. **Open the staging Admin UI** → `https://admin.slimyai.xyz/chat`  
2. **Send a plain message** and confirm it appears instantly in the timeline.  
3. **Mention the bot** (`@slimy.ai hello`) and wait for the automatic reply.  
4. **Check browser dev tools → Network → WebSockets** for a `chat:message` event from the bot persona.  
5. **In Discord (optional)** mention `@slimy.ai` in the staging guild to confirm parity between the dashboard chat and live bot behaviour.

> Auto-prompt: “Run chat smoke test” – copy/paste into your QA checklist with the steps above linked to the new UI artefact `admin-ui/.next/server/pages/chat.html`.

---

## 3. Verify Snail Code Sync

1. **Trigger scraper manually (server)**
   ```bash
   node -e "require('./lib/scheduled-sync');"
   ```
   > This runs the same hourly job on-demand.

2. **Check the log tail**
   ```bash
   tail -n 200 logs/app.log | rg \"[codes]\"
   ```
   Expect to see: `[codes] processed {N} codes`.

3. **Inspect recent DB rows**
   ```bash
   mysql -u slimy_bot_user -p --database=slimy_ai_bot -e \"SELECT code, source, verified, date_added FROM snail_codes ORDER BY date_added DESC LIMIT 10;\"
   ```

4. **Ensure Discord alert (if configured)** landed in the `CODES_ALERT_CHANNEL_ID`.

> Auto-prompt: “Confirm snail codes sync” – copy to your runbook with the command blocks above.

---

## Notes

- The top-level `README.md` was **not** modified in this batch; the existing deployment notes remain accurate.
- Leave `npm --workspace admin-ui run build` in place for future releases—Next.js was bumped to `14.2.33`, and this build ensures the new version is what ships.
