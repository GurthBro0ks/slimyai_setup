"use client";

import useSWR from "swr";
import { apiFetch } from "../lib/api";

const fetcher = (path) => apiFetch(path);

function renderStatusRow(label, value) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.9rem" }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span style={{ fontFamily: "monospace" }}>{value ?? "—"}</span>
    </div>
  );
}

export default function UsageDiagnosticsCard({ refreshInterval = 60_000 }) {
  const { data, error } = useSWR("/api/diag/openai-usage", fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (error) {
    return (
      <div className="card" style={{ borderColor: "rgba(248,113,113,0.4)" }}>
        <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>OpenAI Usage Diagnostics</div>
        <div style={{ fontSize: "0.9rem" }}>Failed to reach diagnostics: {error.message}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>OpenAI Usage Diagnostics</div>
        <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>Loading usage diagnostics…</div>
      </div>
    );
  }

  if (!data.ok) {
    return (
      <div className="card" style={{ borderColor: "rgba(251,191,36,0.45)" }}>
        <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>OpenAI Usage Diagnostics</div>
        <div style={{ fontSize: "0.9rem" }}>
          {data.reason === "missing_api_key"
            ? "No OPENAI_API_KEY configured on admin-api host."
            : "Usage diagnostics unavailable."}
        </div>
      </div>
    );
  }

  const probeSummary = data.lastProbe
    ? `${data.lastProbe.status} · ${data.lastProbe.url?.replace("https://api.openai.com", "")}`
    : "No probe data";

  return (
    <div className="card" style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>OpenAI Usage Diagnostics</div>
      {renderStatusRow("Mask", data.maskedKey)}
      {renderStatusRow("Last probe", probeSummary)}
      {renderStatusRow("Models available", data.modelsCount != null ? data.modelsCount : "—")}
      {renderStatusRow("Organization", data.org || "—")}
      <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>{data.note}</div>

      {data.usage ? (
        <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Usage snapshot</div>
          <pre style={{ margin: 0, padding: "0.6rem", borderRadius: "8px", background: "rgba(15,23,42,0.75)", fontSize: "0.8rem", maxHeight: 220, overflow: "auto" }}>
            {JSON.stringify(data.usage, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
