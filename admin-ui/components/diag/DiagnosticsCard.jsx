"use client";

import useSWR from "swr";
import { apiFetch, fmtDuration } from "../../lib/api";

const fetcher = (path) => apiFetch(path);
const REFRESH_INTERVAL = 30_000;

export default function DiagnosticsCard() {
  const { data, error } = useSWR("/api/diagnostics", fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
  });

  const hasError = Boolean(error) || (data && data.ok === false);
  const uploads = data?.uploads || {};
  const memory = data?.memory || {};

  return (
    <div
      className="card"
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "rgba(12, 17, 29, 0.9)",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
        marginBottom: 24,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Diagnostics</div>

      {hasError && (
        <div style={{ fontSize: 12, color: "#fca5a5" }}>
          Unable to load diagnostics.
        </div>
      )}

      {!hasError && !data && (
        <div style={{ fontSize: 12, opacity: 0.75 }}>Loading…</div>
      )}

      {data && !hasError && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 6,
            margin: 0,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          <dt>API uptime</dt>
          <dd style={{ textAlign: "right", margin: 0 }}>
            {data.uptimeHuman || fmtDuration(data.uptimeSec || 0)}
          </dd>
          <dt>Memory (RSS)</dt>
          <dd style={{ textAlign: "right", margin: 0 }}>
            {memory.rssMB != null ? `${memory.rssMB} MB` : "—"}
          </dd>
          <dt>Uploads today</dt>
          <dd style={{ textAlign: "right", margin: 0 }}>
            {uploads.today ?? "—"}
          </dd>
          <dt>Total uploads</dt>
          <dd style={{ textAlign: "right", margin: 0 }}>
            {uploads.total ?? "—"}
          </dd>
        </dl>
      )}
    </div>
  );
}
