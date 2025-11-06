// supersnail-sheets.js
"use strict";

// Loads env (.env)
try {
  require("dotenv").config();
} catch (_) {
  /* Intentionally empty */
}

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const fetch = global.fetch || require("undici").fetch;

const _metaCache = new Map();

function _maybeNum(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return v;
  const trimmed = v.trim().replace(/,/g, "");
  if (trimmed === "") return "";
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : v;
}

function hasApiKey() {
  return !!process.env.GOOGLE_SHEETS_API_KEY;
}
function hasServiceAccount() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  );
}

function _readSAFromEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is neither JSON nor base64-JSON.",
      );
    }
  }
}

function _saAuth() {
  const credsInline = _readSAFromEnv();
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : null;

  if (!credsInline && !keyFile)
    throw new Error(
      "No SA creds. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON.",
    );
  if (keyFile && !fs.existsSync(keyFile))
    throw new Error(`Service account file not found at ${keyFile}`);

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    ...(credsInline ? { credentials: credsInline } : { keyFile }),
  });
  return google.sheets({ version: "v4", auth });
}

async function _fetchMeta_apiKey(spreadsheetId) {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(
      `Meta fetch failed (API key): ${res.status} ${await res.text()}`,
    );
  return res.json();
}

async function _fetchMeta_sa(spreadsheetId) {
  const sheets = _saAuth();
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  return data;
}

async function _fetchMeta(spreadsheetId) {
  const cacheKey = `${spreadsheetId}::meta`;
  if (_metaCache.has(cacheKey)) return _metaCache.get(cacheKey);
  const meta = hasServiceAccount()
    ? await _fetchMeta_sa(spreadsheetId)
    : await _fetchMeta_apiKey(spreadsheetId);
  _metaCache.set(cacheKey, meta);
  return meta;
}

async function _resolveTabNameByGid(spreadsheetId, gid) {
  const meta = await _fetchMeta(spreadsheetId);
  const sheet = meta.sheets.find(
    (s) => String(s.properties.sheetId) === String(gid),
  );
  if (!sheet)
    throw new Error(`No tab with gid=${gid} in spreadsheet ${spreadsheetId}`);
  return sheet.properties.title;
}

/**
 * Fetch a range from a tab by name or gid. Works with Service Account or API key.
 */
async function fetchRange({ spreadsheetId, tabName, gid, rangeA1 = "A:K" }) {
  if (!spreadsheetId) throw new Error("fetchRange: spreadsheetId is required.");

  let title = tabName;
  if (!title) {
    if (gid == null) throw new Error("fetchRange: provide tabName or gid.");
    title = await _resolveTabNameByGid(spreadsheetId, gid);
  }
  const a1 = `${title}!${rangeA1}`;

  if (hasServiceAccount()) {
    const sheets = _saAuth();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: a1,
    });
    const values = (data.values || []).map((row) => row.map(_maybeNum));
    return { range: data.range || a1, values };
  }

  if (!hasApiKey())
    throw new Error(
      "No auth set. Provide GOOGLE_APPLICATION_CREDENTIALS (SA) or GOOGLE_SHEETS_API_KEY.",
    );
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1)}?key=${encodeURIComponent(process.env.GOOGLE_SHEETS_API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(
      `values.get failed (API key): ${res.status} ${await res.text()}`,
    );
  const json = await res.json();
  const values = (json.values || []).map((row) => row.map(_maybeNum));
  return { range: json.range || a1, values };
}

async function fetchKeyedByFirstCol({
  spreadsheetId,
  tabName,
  gid,
  rangeA1 = "A:K",
}) {
  const { values } = await fetchRange({ spreadsheetId, tabName, gid, rangeA1 });
  const out = {};
  for (const row of values) {
    if (!row || row.length === 0) continue;
    const [key, ...rest] = row;
    const k = (key ?? "").toString().trim();
    if (!k) continue;
    out[k] = rest;
  }
  return out;
}

function resolveGidAlias(input) {
  if (input == null) return null;
  const s = String(input);
  const aliases = (() => {
    try {
      return JSON.parse(process.env.SHEETS_GID_ALIASES || "{}");
    } catch {
      return {};
    }
  })();
  if (s in aliases) return aliases[s];
  if (/^\d+$/.test(s)) return s;
  return s; // treat as tabName
}

module.exports = { fetchRange, fetchKeyedByFirstCol, resolveGidAlias };
