const fetch = require("node-fetch");
const cheerio = require("cheerio");

const USER_AGENT = "slimy.ai-bot/3.0";

async function fetchJsonCodes(baseUrl) {
  const url = baseUrl.endsWith("/")
    ? `${baseUrl}codes.json`
    : `${baseUrl}/codes.json`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`codes.json responded with ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data?.codes)) return [];

  return data.codes
    .map((code) => String(code || "").trim())
    .filter(Boolean)
    .map((code) => ({
      code,
      rewards: "",
      source: "snelp.com",
      verified: true,
    }));
}

async function scrapeFallbackHtml(baseUrl) {
  const res = await fetch(baseUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Fallback HTML scrape failed (${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const codes = [];

  $(".code-entry, .codes .code, .codeRow").each((_, el) => {
    const code = $(el)
      .find(".code-text, .code, .codeCell")
      .first()
      .text()
      .trim();
    if (!code) return;

    const rewards = $(el)
      .find(".code-rewards, .rewards, .rewardCell")
      .first()
      .text()
      .trim();
    codes.push({
      code,
      rewards,
      source: "snelp.com",
      verified: true,
    });
  });

  if (codes.length === 0) {
    $("li").each((_, li) => {
      const text = $(li).text().trim();
      const match = text.match(/([A-Z0-9-]{6,})/);
      if (match) {
        codes.push({
          code: match[1],
          rewards: text.replace(match[1], "").trim(),
          source: "snelp.com",
          verified: false,
        });
      }
    });
  }

  return codes;
}

async function scrapeSnelpCodes() {
  const base = process.env.SNELP_URL || "https://snelp.com/codes";

  try {
    const jsonCodes = await fetchJsonCodes(base);
    if (jsonCodes.length) return jsonCodes;
  } catch (err) {
    console.warn("[snelp] codes.json fetch failed:", err.message);
  }

  try {
    return await scrapeFallbackHtml(base);
  } catch (err) {
    console.error("[snelp] fallback scrape failed:", err.message);
    return [];
  }
}

module.exports = {
  scrapeSnelpCodes,
};
