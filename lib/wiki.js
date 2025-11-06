const fetch = require("node-fetch");

const BASE = process.env.WIKI_BASE || "https://supersnail.wiki.gg";
const UA = process.env.WIKI_USER_AGENT || "slimy.ai-bot/3.0 (+discord)";

async function mw(params) {
  const url = new URL("/api.php", BASE);
  Object.entries({ format: "json", ...params }).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA },
  });

  if (!res.ok) {
    throw new Error(`MediaWiki ${res.status}`);
  }

  return res.json();
}

async function cargoQuery(params) {
  return mw({ action: "cargoquery", ...params });
}

module.exports = {
  mw,
  cargoQuery,
};
