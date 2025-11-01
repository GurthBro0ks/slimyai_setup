"use strict";

const fs = require("fs");
const { sheets } = require("@googleapis/sheets");
const { GoogleAuth } = require("google-auth-library");

async function getAuth() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return auth;
  }
  // fall back to GOOGLE_APPLICATION_CREDENTIALS path or instance creds
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const creds = JSON.parse(fs.readFileSync(credPath, "utf8"));
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return auth;
  }
  // fallback to default credentials
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return auth;
}

async function getSheetsClient() {
  const auth = await getAuth();
  return sheets({ version: "v4", auth });
}

async function listTabs(spreadsheetId) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return (meta.data.sheets || []).map(s => s.properties.title);
}

function parseBaselineTitle(t) {
  const m = t && t.match(/^Baseline \((\d{1,2})-(\d{1,2})-(\d{2})\)$/);
  if (!m) return 0;
  const mm = +m[1], dd = +m[2], yy = +m[3];
  return new Date(2000 + yy, mm - 1, dd).getTime();
}

async function chooseTab(spreadsheetId, pinnedTitle) {
  const tabs = await listTabs(spreadsheetId);
  if (pinnedTitle && tabs.includes(pinnedTitle)) return pinnedTitle;

  // newest Baseline (…) by date
  const baselines = tabs
    .map(t => ({ t, ts: parseBaselineTitle(t) }))
    .filter(x => x.ts > 0)
    .sort((a, b) => b.ts - a.ts);
  if (baselines.length) return baselines[0].t;

  // fallback
  if (tabs.includes("Club Latest")) return "Club Latest";
  return tabs[0] || null;
}

async function readStats(spreadsheetId, title) {
  const sheets = await getSheetsClient();
  // read A:D, skip header, we'll clean as we go
  const range = `'${title}'!A2:D`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const rows = res.data.values || [];
  const members = [];
  let totalSim = 0, totalPower = 0;

  for (const row of rows) {
    const name = (row[0] || "").toString().trim();
    if (!name) continue;
    const sim = Number(row[1] ?? 0);
    const total = Number(row[2] ?? 0);
    const changePct = row[3] === "" || row[3] == null ? null : Number(row[3]);
    members.push({ name, sim, total, changePct });
    if (Number.isFinite(sim)) totalSim += sim;
    if (Number.isFinite(total)) totalPower += total;
  }

  return {
    title,
    count: members.length,
    totalSim,
    totalPower,
    members,
  };
}

module.exports = { chooseTab, readStats };
