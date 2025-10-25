"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import Layout from "../../../components/Layout";
import GuildUploadsTab from "../../../components/GuildUploadsTab";
import GuildSheetTab from "../../../components/GuildSheetTab";
import { apiFetch } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { runTaskStream } from "../../../lib/tasks";
import { FALLBACK_SHEET_LABEL } from "../../../lib/sheets";

const fetcher = (path) => apiFetch(path);

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "uploads", label: "Uploads" },
  { key: "sheet", label: "Current Sheet" },
];

function formatNumber(value) {
  if (value === null || typeof value === "undefined") return "—";
  return Number(value).toLocaleString();
}

function normalizeGuildId(raw) {
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function GuildDashboard() {
  const router = useRouter();
  const guildId = normalizeGuildId(router.query.guildId);
  const { csrfToken } = useSession();

  const { data: health, mutate: refreshHealth } = useSWR(
    guildId ? `/api/guilds/${guildId}/health` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const { data: diag } = useSWR("/api/diag", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });

  const [activeTab, setActiveTab] = useState("dashboard");
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
      await refreshHealth();
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

  const uploadsSummary = diag?.uploads || { today: 0, total: 0 };
  const apiUptime = diag?.admin?.uptimeSec;

  const renderDashboard = () => {
    if (!health) {
      return <div className="card" style={{ padding: "2rem" }}>Loading health metrics…</div>;
    }

    return (
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
            <p style={{ opacity: 0.7 }}>
              Threshold {formatNumber(health.thresholds?.low)} – {formatNumber(health.thresholds?.high)}
            </p>
          </div>
          <div className="card">
            <h4>Sim Power</h4>
            <p style={{ fontSize: 24 }}>{formatNumber(health.simPower)}</p>
            <p><a className="pill" href={usageLink}>Usage</a></p>
          </div>
          <div className="card">
            <h4>Baseline Sheet</h4>
            <p style={{ fontSize: 18, marginBottom: 8 }}>{FALLBACK_SHEET_LABEL}</p>
            <p style={{ opacity: 0.75 }}>
              Dashboard metrics reference the baseline sheet until the next update.
            </p>
          </div>
          <div className="card">
            <h4>Uploads</h4>
            <p style={{ fontSize: 24 }}>{formatNumber(uploadsSummary.today)} today</p>
            <p style={{ opacity: 0.7 }}>Total stored: {formatNumber(uploadsSummary.total)}</p>
          </div>
          <div className="card">
            <h4>API Uptime</h4>
            <p style={{ fontSize: 24 }}>
              {typeof apiUptime === "number" ? `${Math.floor(apiUptime / 3600)}h` : "—"}
            </p>
            <p style={{ opacity: 0.7 }}>Process ID: {diag?.admin?.pid ?? "—"}</p>
          </div>
        </div>

        <section style={{ marginTop: 40 }}>
          <h3>Tasks</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div
              className="card"
              style={{ flexBasis: "100%", background: "transparent", border: "none", padding: 0 }}
            >
              <label style={{ display: "block", marginBottom: 8 }}>Screenshot Directory</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="/opt/slimy/app/screenshots/latest"
                  value={ingestDir}
                  onChange={(event) => setIngestDir(event.target.value)}
                  style={{ flex: 1, minWidth: 220 }}
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
    );
  };

  return (
    <Layout guildId={guildId} title="Guild Dashboard">
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`btn ${activeTab === tab.key ? "" : "outline"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && renderDashboard()}
      {activeTab === "uploads" && guildId && <GuildUploadsTab guildId={guildId} />}
      {activeTab === "sheet" && guildId && <GuildSheetTab guildId={guildId} />}
      {!guildId && <p>Select a guild to begin.</p>}

      {toast && (
        <div
          className="toast"
          style={{ borderColor: toast.type === "error" ? "rgba(248,113,113,0.4)" : undefined }}
        >
          {toast.message}
        </div>
      )}
    </Layout>
  );
}
