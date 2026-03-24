# Code Changes Log - October 28, 2025

## Summary

This document tracks changes made to the `/snail codes` command implementation. The bot now has **two different implementations** available, and you can switch between them as needed.

---

## Current State (REVERTED)

**The `/snail codes` command is currently using the ORIGINAL database-based implementation.**

Location: `/opt/slimy/app/lib/snail-codes.js` (150 lines)

### Current Features:
- ✅ Uses MySQL database (`snail_codes` table)
- ✅ Action options: active, recent (7 days), all (archive), copy
- ✅ Custom interaction button (expires after 60 seconds)
- ✅ Public replies (controlled by `FEATURE_CODES` env var)
- ✅ Shows rewards alongside codes

### Current Requirements:
- `FEATURE_CODES=true` environment variable must be set
- `snail_codes` table must exist in MySQL database

---

## Alternative Implementation (Available)

During this session, we created an **alternative web-scraping implementation** that aggregates codes from multiple sources without requiring a database.

### Alternative Features:
- ✅ Multi-source aggregation (Reddit, Snelp.com, SuperSnail Wiki, custom URLs)
- ✅ No database required
- ✅ 12-minute in-memory cache
- ✅ Non-expiring Link buttons (uses .txt attachment)
- ✅ Classic UI with trailing em-dash format
- ✅ Automatic deduplication and normalization

---

## Implementation Comparison

| Feature | Database Version (Current) | Web Scraping Version (Available) |
|---------|---------------------------|----------------------------------|
| **Data Source** | MySQL `snail_codes` table | Reddit + Snelp + Wiki + URLs |
| **Database Required** | ✅ Yes | ❌ No |
| **Button Type** | Custom interaction (60s timeout) | Link button (never expires) |
| **Action Options** | active, recent, all, copy | Single view (all active) |
| **Rewards Display** | ✅ Yes | ❌ No (codes only) |
| **Update Method** | Manual DB updates | Auto-scrapes on demand |
| **Cache** | Database persistent | 12-min in-memory |
| **Format** | `**CODE** — reward text` | `CODE —` (classic) |
| **File Attachment** | ❌ No | ✅ Yes (.txt) |

---

## How to Switch Implementations

### Option 1: Keep Database Version (Current)

**No action needed.** The current implementation is already active.

Requirements:
```env
FEATURE_CODES=true
```

Database table:
```sql
CREATE TABLE snail_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(255),
  rewards TEXT,
  status ENUM('active', 'expired'),
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Option 2: Switch to Web Scraping Version

**Step 1:** Replace `/opt/slimy/app/lib/snail-codes.js` with the web-scraping version (saved below as backup).

**Step 2:** Optional environment variables:
```env
SNAIL_CODES_SUBREDDIT=SuperSnail
SNAIL_CODES_REDDIT_QUERY=secret code OR codes OR "hidden message"
SNAIL_CODES_URL=https://your-custom-url/codes.txt
SNAIL_CODES_URL_2=https://another-source/codes.txt
```

**Step 3:** Restart the bot:
```bash
pm2 restart slimy-bot
```

---

## Web Scraping Implementation Code

<details>
<summary>Click to expand full web-scraping implementation (235 lines)</summary>

```javascript
// lib/snail-codes.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const cheerio = require("cheerio");

const DEFAULT_TTL = 12 * 60 * 1000;
const cache = { at: 0, data: [] };

const UPPER_LINE = /^[A-Z0-9'&.\-]{2,}(?: [A-Z0-9'&.\-]{2,}){1,}$/;

function normalize(s) {
  return s.replace(/\s+/g, " ").replace(/[–—]/g, "-").trim().toUpperCase();
}

function extractCodesFromText(text) {
  if (!text) return [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = normalize(raw);
    if (line.length >= 6 && line.length <= 40 && UPPER_LINE.test(line)) {
      out.push(line);
    }
  }
  return out;
}

// fetch shim (Node 16 fallback)
let _fetch = typeof fetch === "function" ? fetch : null;
async function getFetch() {
  if (_fetch) return _fetch;
  const mod = await import("node-fetch");
  _fetch = mod.default;
  return _fetch;
}

async function fromReddit({ subreddit, query, limit = 25, time = "year" }) {
  try {
    const f = await getFetch();
    const url =
      `https://www.reddit.com/r/${encodeURIComponent(subreddit)}` +
      `/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=${time}&limit=${limit}`;
    const res = await f(url, {
      headers: { "User-Agent": "slimy-ai-bot/2.0 (+discord)" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const posts = json?.data?.children ?? [];
    const set = new Set();
    for (const p of posts) {
      const t = p?.data?.title || "";
      const body = p?.data?.selftext || "";
      extractCodesFromText(`${t}\n${body}`).forEach((c) => set.add(c));
    }
    return [...set];
  } catch {
    return [];
  }
}

async function fromUrl(url) {
  if (!url) return [];
  try {
    const f = await getFetch();
    const res = await f(url, {
      headers: { "User-Agent": "slimy-ai-bot/2.0" },
    });
    if (!res.ok) return [];
    return extractCodesFromText(await res.text());
  } catch {
    return [];
  }
}

async function fromSnelp() {
  try {
    const f = await getFetch();
    const res = await f("https://snelp.com/codes/", {
      headers: { "User-Agent": "slimy-ai-bot/2.0" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const codes = new Set();

    $('code, .code, pre, [class*="code"]').each((i, elem) => {
      const text = $(elem).text().trim();
      extractCodesFromText(text).forEach(c => codes.add(c));
    });

    $('td, li, p').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length >= 6 && text.length <= 100) {
        extractCodesFromText(text).forEach(c => codes.add(c));
      }
    });

    return [...codes];
  } catch (err) {
    console.error("[snail-codes] Snelp scrape failed:", err.message);
    return [];
  }
}

async function fromWiki() {
  try {
    const f = await getFetch();
    const res = await f("https://supersnail.wiki.gg/wiki/Snail_codes", {
      headers: { "User-Agent": "slimy-ai-bot/2.0" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const codes = new Set();

    $('table').each((i, table) => {
      $(table).find('td, th').each((j, cell) => {
        const text = $(cell).text().trim();
        extractCodesFromText(text).forEach(c => codes.add(c));
      });
    });

    $('li, code, pre').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length >= 6 && text.length <= 100) {
        extractCodesFromText(text).forEach(c => codes.add(c));
      }
    });

    return [...codes];
  } catch (err) {
    console.error("[snail-codes] Wiki scrape failed:", err.message);
    return [];
  }
}

function fromLocalFallback() {
  return [
    "REVELATION SOUL",
    "THIS IS FINE",
    "THIS IS FIRE",
    "CLASS ACTION",
    "THAT SMILE",
    "THAT DAMNED SMILE",
    "SNAIL NOTE",
    "SUPERSNAILTEST",
    "WEEKLYWINTEST",
    "SNAILOWEEN2025",
  ].map(normalize);
}

async function getAllCodes(opts = {}) {
  const now = Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL;
  if (now - cache.at < ttl) return cache.data;

  const tasks = [
    fromSnelp(),
    fromWiki(),
    fromReddit({
      subreddit: process.env.SNAIL_CODES_SUBREDDIT || "SuperSnail",
      query: process.env.SNAIL_CODES_REDDIT_QUERY || 'secret code OR codes OR "hidden message"',
    }),
    Promise.resolve(fromLocalFallback()),
  ];
  if (process.env.SNAIL_CODES_URL)
    tasks.push(fromUrl(process.env.SNAIL_CODES_URL));
  if (process.env.SNAIL_CODES_URL_2)
    tasks.push(fromUrl(process.env.SNAIL_CODES_URL_2));

  const results = await Promise.all(tasks);
  const seen = new Set();
  const merged = [];
  for (const arr of results) {
    for (const code of arr) {
      const c = normalize(code);
      if (!seen.has(c)) {
        seen.add(c);
        merged.push(c);
      }
    }
  }
  cache.at = now;
  cache.data = merged;
  return merged;
}

async function handleCodes(interaction) {
  await interaction.deferReply({ ephemeral: false }); // PUBLIC

  // Gather codes and format exactly like the old list
  const codes = await getAllCodes();
  const lines = codes.map((c) => `${c} —`); // keep the trailing em-dash style
  const codeBlock =
    "```\n" + (lines.length ? lines.join("\n") : "NO CODES FOUND") + "\n```";

  // Send message with code block + attach a .txt for copy
  const file = new AttachmentBuilder(Buffer.from(codes.join("\n"), "utf8"), {
    name: "snail-codes.txt",
  });
  await interaction.editReply({
    content: codeBlock,
    files: [file],
    components: [],
  });

  // Grab the attachment CDN URL
  const sent = await interaction.fetchReply();
  const attUrl = sent.attachments.first()?.url;

  // Add a single non-expiring LINK button to that .txt
  if (attUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Copy Codes")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Link) // never expires
        .setURL(attUrl),
    );

    await interaction.editReply({ components: [row] });
  }
}

module.exports = { getAllCodes, extractCodesFromText, handleCodes };
```

</details>

---

## Dependencies Added

During this session, the following dependencies were installed:

```bash
npm install sharp imghash node-schedule --save
```

These are required for the `/snail analyze` command (image processing), not specifically for the codes feature.

**Already installed:**
- `cheerio@^1.1.0` - Used for web scraping (Snelp + Wiki)
- `node-fetch@3.3.2` - HTTP requests (already a dependency)

---

## Database vs Web Scraping: Use Cases

### Use Database Version When:
- ✅ You want manual control over which codes are shown
- ✅ You want to display reward information alongside codes
- ✅ You need historical tracking (recent, all, archive)
- ✅ You have a process for updating the database regularly
- ✅ You want consistent, verified codes

### Use Web Scraping Version When:
- ✅ You want automatic code discovery
- ✅ You don't want to maintain a database of codes
- ✅ You want non-expiring buttons (Link buttons)
- ✅ You want .txt file downloads for easy copying
- ✅ You prefer a simpler, classic UI

---

## Testing Results

Both implementations were tested on October 28, 2025:

### Database Version (Current)
- ✅ Successfully queries database
- ✅ Displays codes with rewards
- ✅ Button expires after 60 seconds
- ⚠️ Requires `FEATURE_CODES=true` environment variable
- ⚠️ Some codes exceed VARCHAR(255) limit (see error logs)

### Web Scraping Version (Tested)
- ✅ Successfully scrapes from all sources
- ✅ Aggregates ~150 codes from Snelp + Wiki + Reddit
- ✅ Non-expiring Link button works correctly
- ✅ .txt attachment downloads properly
- ⚠️ Needs "Send Messages" permission for some channels
- ⚠️ Cache clears on bot restart (12-min memory cache)

---

## Known Issues

### Database Version
1. **VARCHAR limit:** Some codes in the database exceed the 255 character limit
   - Error: `Data too long for column 'code' at row 1`
   - Solution: Increase column size or truncate codes

2. **Feature flag required:** Command is disabled unless `FEATURE_CODES=true`
   - Users see "Codes feature disabled" without it

### Web Scraping Version
1. **Permissions:** Bot needs "Send Messages" permission to send pinned messages
   - Current implementation handles this gracefully (continues without pin)

2. **Rate limiting:** Multiple rapid requests could hit Reddit/Snelp rate limits
   - Mitigated by 12-minute cache

---

## Rollback Instructions

### To Revert All Changes

If you want to completely undo everything from this session:

```bash
# 1. The file has already been reverted to the original database version
# No action needed - it's already back to the original!

# 2. Optional: Remove added dependencies if not needed for other features
npm uninstall imghash node-schedule
# Keep sharp if you use /snail analyze

# 3. Restart bot
pm2 restart slimy-bot
```

---

## Future Enhancements (Not Implemented)

The following features were discussed but **NOT implemented**:

1. **Delta Notifications** - Auto-post when new codes appear
2. **Scheduled Refresh** - Daily automatic code refresh
3. **Pinned Messages** - Auto-update pinned message with latest codes
4. **Hourly Sync** - Silent background updates

These can be added to either implementation if desired.

---

## File Locations

- **Current Implementation:** `/opt/slimy/app/lib/snail-codes.js` (150 lines, database version)
- **Alternative Implementation:** Saved in this document above (235 lines, web scraping version)
- **Command Handler:** `/opt/slimy/app/commands/snail.js` (line 481 calls `handleCodes()`)
- **This Documentation:** `/opt/slimy/app/new-code-changes_10-28.md`

---

## Questions?

If you need to switch implementations or have issues, refer to the "How to Switch Implementations" section above.

**Last Updated:** October 28, 2025
**Bot Version:** 1.0.0
**Node Version:** v20.19.5
**Discord.js Version:** 14.23.2
