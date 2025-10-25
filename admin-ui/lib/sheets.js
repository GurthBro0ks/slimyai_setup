"use client";

export const FALLBACK_SHEET_LABEL = "Baseline (10-24-25)";

export const FALLBACK_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR6WejkqqUB8bTWzi4mLolRQTYw5oMas70lR2um-gpB4YpVAHAFuEVL4tX7xKdx1Mxe7eWAEX-HzKX3/pubhtml?widget=true&headers=false&single=true";

function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    try {
      return new URL(url, "https://docs.google.com").toString();
    } catch {
      return null;
    }
  }
}

function applyPublishedDefaults(urlString) {
  const normalized = normalizeUrl(urlString);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (!url.searchParams.has("widget")) url.searchParams.set("widget", "true");
  if (!url.searchParams.has("headers")) url.searchParams.set("headers", "false");
  if (!url.searchParams.has("single")) url.searchParams.set("single", "true");
  return url.toString();
}

function deriveFromPublished(url) {
  const adjusted = applyPublishedDefaults(url);
  return adjusted ? { type: "published", src: adjusted } : null;
}

function deriveFromDocument(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  const match = parsed.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const base = new URL(
    `/spreadsheets/d/${match[1]}/pubhtml`,
    "https://docs.google.com",
  );
  const gid = parsed.searchParams.get("gid");
  base.searchParams.set("widget", "true");
  base.searchParams.set("headers", "false");
  base.searchParams.set("single", "true");
  if (gid) base.searchParams.set("gid", gid);
  return { type: "document", src: base.toString() };
}

export function getSheetEmbedSource(settings) {
  const fromSheetUrl =
    deriveFromPublished(settings?.sheetUrl) ||
    deriveFromDocument(settings?.sheetUrl);
  if (fromSheetUrl) {
    return { ...fromSheetUrl, reason: "settings" };
  }

  const fromSheetId = settings?.sheetId
    ? deriveFromDocument(
        `https://docs.google.com/spreadsheets/d/${settings.sheetId}/edit`,
      )
    : null;
  if (fromSheetId) {
    return { ...fromSheetId, reason: "settings" };
  }

  const fallback = deriveFromPublished(FALLBACK_SHEET_URL);
  return fallback ? { ...fallback, reason: "fallback" } : null;
}
