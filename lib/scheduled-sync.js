const schedule = require("node-schedule");
try {
  const undici = require("undici");
  if (typeof global.File === "undefined" && undici.File) {
    global.File = undici.File;
  }
  if (typeof global.FormData === "undefined" && undici.FormData) {
    global.FormData = undici.FormData;
  }
  if (typeof global.Blob === "undefined" && undici.Blob) {
    global.Blob = undici.Blob;
  }
} catch (err) {
  console.warn("[scheduled-sync] undici polyfill failed:", err.message);
}
const db = require("./database");
const { scrapeSnelpCodes } = require("./snelp-scraper");

const rule = process.env.SCRAPE_CRON || "0 * * * *"; // top of every hour

async function notifyNewCodes(codes) {
  if (!codes.length) return;

  const channelId = process.env.CODES_ALERT_CHANNEL_ID;
  if (!channelId) {
    console.warn(
      "[codes] no CODES_ALERT_CHANNEL_ID configured; skipping alert",
    );
    return;
  }

  const client = global.client;
  if (!client || !client.isReady()) {
    console.warn("[codes] Discord client not ready; cannot send alert");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error("Channel fetch returned null");

    const roleId = process.env.CODES_ALERT_ROLE_ID;
    const mention = roleId
      ? `<@&${roleId}>`
      : process.env.CODES_ALERT_FALLBACK || "@new-code-pings";
    const lines = codes.map((entry) => {
      const rewardPart = entry.rewards ? ` — ${entry.rewards}` : "";
      return `• ${entry.code}${rewardPart}`;
    });

    await channel.send({
      content: `${mention}\n🐌 **New Super Snail codes detected!**\n${lines.join("\n")}`,
      allowedMentions: roleId ? { roles: [roleId] } : undefined,
    });
  } catch (err) {
    console.error("[codes] failed to send alert", err.message);
  }
}

schedule.scheduleJob(rule, async () => {
  try {
    const codes = await scrapeSnelpCodes();
    const pool = db.getPool();
    const inserted = [];

    for (const entry of codes) {
      try {
        const [result] = await pool.execute(
          `INSERT INTO snail_codes (code, rewards, source, verified, status)
           VALUES (?, ?, ?, ?, 'active')
           ON DUPLICATE KEY UPDATE
             rewards = VALUES(rewards),
             source = VALUES(source),
             verified = VALUES(verified)`,
          [
            entry.code,
            entry.rewards || "",
            entry.source || "snelp.com",
            entry.verified ? 1 : 0,
          ],
        );

        if (result.affectedRows === 1 && result.warningStatus === 0) {
          inserted.push(entry);
        }
      } catch (err) {
        console.warn("[codes] upsert failed:", err.message);
      }
    }

    if (codes.length) {
      console.log(
        `[codes] processed ${codes.length} codes (new: ${inserted.length})`,
      );
    }

    if (inserted.length) {
      await notifyNewCodes(inserted);
    }
  } catch (err) {
    console.error("[codes] scrape failed", err.message || err);
  }
});
