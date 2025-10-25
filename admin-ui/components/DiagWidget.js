"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fmtDuration } from "../lib/api";

const fetcher = (path) => apiFetch(path);
const REFRESH_INTERVAL = 60_000;

export default function DiagWidget() {
  const { data } = useSWR("/api/diag", fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: false,
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (data) setVisible(true);
  }, [data]);

  if (!visible || !data?.ok) return null;

  const admin = data.admin || {};
  const uploads = data.uploads || {};

  return (
    <div
      style={{
        padding: "0.9rem 1rem",
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "rgba(12, 17, 29, 0.9)",
        marginBottom: 18,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Diagnostics</div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        API Uptime: <strong>{fmtDuration(admin.uptimeSec)}</strong>
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Memory: <strong>{admin.memory ? `${admin.memory.rssMb} MB` : "—"}</strong>
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Uploads today: <strong>{uploads.today ?? 0}</strong>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Total uploads: {uploads.total ?? 0}
      </div>
    </div>
  );
}
