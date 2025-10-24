"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import Layout from "../../../components/Layout";
import { apiFetch } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { runTaskStream } from "../../../lib/tasks";

const fetcher = (path) => apiFetch(path);

function formatNumber(value) {
  if (value === null || typeof value === "undefined") return "—";
  return Number(value).toLocaleString();
}

export default function GuildDashboard() {
  const router = useRouter();
  const { guildId } = router.query;
  const { csrfToken } = useSession();

  const { data: health, mutate } = useSWR(
    guildId ? `/api/guilds/${guildId}/health` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const [activeTask, setActiveTask] = useState(null);
  const [logs, setLogs] = useState([]);
  const [toast, setToast] = useState(null);
  const [ingestDir, setIngestDir] = useState("");

  const taskRunning = Boolean(activeTask);

  const handleTask = async (taskName, payload = {}) => {
    if (!guildId || !csrfToken) return;
    setActiveTask(taskName);
    setLogs([]);
    setToast(null);

    try {
      await runTaskStream({
        guildId,
        taskName,
        body: payload,
        csrfToken,
        onEvent: (event) => {
          if (event.event === "start") {
            setLogs([
              `task:${taskName} started (id: ${event.data.taskId || "unknown"})`,
            ]);
          }
          if (event.event === "log") {
            setLogs((prev) => [...prev, `${event.data.stream}: ${event.data.line}`]);
          }
          if (event.event === "error") {
            const errorMessage = event.data?.message || "Task error";
            setLogs((prev) => [...prev, `stderr: ${errorMessage}`]);
            setToast({ type: "error", message: errorMessage });
          }
          if (event.event === "end") {
            const status = event.data?.status || "completed";
            setToast({
              type: status === "completed" ? "success" : "error",
              message:
                status === "completed"
                  ? `${taskName} completed`
                  : `${taskName} failed`,
            });
          }
        },
      });
      await mutate();
    } catch (err) {
      setToast({ type: "error", message: err.message });
    } finally {
      setActiveTask(null);
    }
  };

  const usageLink = useMemo(
    () => (guildId ? `/guilds/${guildId}/usage` : "#"),
    [guildId],
  );

  return (
    <Layout guildId={guildId} title="Guild Dashboard">
      {!health ? (
        <p>Loading health metrics…</p>
      ) : (
        <>
          <div className="card-grid">
            <div className="card">
              <h4>Week</h4>
              <p style={{ fontSize: 24 }}>{health.weekId || "—"}</p>
              <p style={{ opacity: 0.7 }}>Snapshot: {health.lastSnapshotAt || "—"}</p>
            </div>
            <div className="card">
              <h4>Members</h4>
              <p style={{ fontSize: 24 }}>{formatNumber(health.members)}</p>
              <p style={{ opacity: 0.7 }}>Last sheet push: {health.lastSheetPushAt || "—"}</p>
            </div>
            <div className="card">
              <h4>Total Power</h4>
              <p style={{ fontSize: 24 }}>{formatNumber(health.totalPower)}</p>
              <p style={{ opacity: 0.7 }}>Threshold {formatNumber(health.thresholds?.low)} – {formatNumber(health.thresholds?.high)}</p>
            </div>
            <div className="card">
              <h4>Sim Power</h4>
              <p style={{ fontSize: 24 }}>{formatNumber(health.simPower)}</p>
              <p><a className="pill" href={usageLink}>Usage</a></p>
            </div>
          </div>

          <section style={{ marginTop: 40 }}>
            <h3>Tasks</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="card" style={{ flexBasis: "100%", background: "transparent", border: "none", padding: 0 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Screenshot Directory</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  placeholder="/opt/slimy/app/screenshots/latest"
                  value={ingestDir}
                  onChange={(event) => setIngestDir(event.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn outline"
                  disabled={taskRunning || !ingestDir}
                  onClick={() =>
                    handleTask("ingest", {
                      directory: ingestDir,
                      commit: true,
                      applyCorrections: true,
                    })
                  }
                >
                  Ingest Directory
                </button>
              </div>
            </div>
            <button
              className="btn"
              disabled={taskRunning}
              onClick={() => handleTask("verify", {})}
            >
                Run Verify
              </button>
              <button
                className="btn"
                disabled={taskRunning}
                onClick={() => handleTask("recompute", { pushSheet: false })}
              >
                Recompute Latest
              </button>
              <button
                className="btn"
                disabled={taskRunning}
                onClick={() => handleTask("recompute", { pushSheet: true })}
              >
                Recompute &amp; Push Sheet
              </button>
            </div>

            <div className="card" style={{ marginTop: 24 }}>
              <h4 style={{ marginTop: 0 }}>Live Logs</h4>
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.2)",
                  padding: 12,
                  height: 220,
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                {logs.length === 0 ? (
                  <p style={{ opacity: 0.7 }}>Click a task to stream logs.</p>
                ) : (
                  logs.map((line, idx) => <div key={idx}>{line}</div>)
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {toast && (
        <div className="toast" style={{ borderColor: toast.type === "error" ? "rgba(248,113,113,0.4)" : undefined }}>
          {toast.message}
        </div>
      )}
    </Layout>
  );
}
