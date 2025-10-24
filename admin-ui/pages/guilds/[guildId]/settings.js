"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import Layout from "../../../components/Layout";
import { apiFetch, useApi } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { subscribeTask } from "../../../lib/tasks";

const fetcher = (path) => apiFetch(path);

export default function GuildSettingsPage() {
  const router = useRouter();
  const { guildId } = router.query;
  const api = useApi();
  const { user } = useSession();
  const { data, mutate } = useSWR(
    guildId ? `/api/guilds/${guildId}/settings` : null,
    fetcher,
  );
  const { data: backupInfo, mutate: refreshBackups } = useSWR(
    user?.role === "owner" ? "/api/backup/list" : null,
    apiFetch,
  );

  const [sheetUrl, setSheetUrl] = useState("");
  const [weekWindow, setWeekWindow] = useState("");
  const [warnLow, setWarnLow] = useState("");
  const [warnHigh, setWarnHigh] = useState("");
  const [tpm, setTpm] = useState("");
  const [status, setStatus] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLogs, setBackupLogs] = useState([]);
  const [backupRunning, setBackupRunning] = useState(false);

  if (!data) {
    return (
      <Layout guildId={guildId} title="Club Settings">
        <p>Loading settings…</p>
      </Layout>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("Saving…");
    try {
      const payload = {
        sheetUrl: sheetUrl || data.sheetUrl || null,
        weekWindowDays: weekWindow ? Number(weekWindow) : null,
        thresholds: {
          warnLow: warnLow ? Number(warnLow) : null,
          warnHigh: warnHigh ? Number(warnHigh) : null,
        },
        tokensPerMinute: tpm ? Number(tpm) : null,
        testSheet: true,
      };

      const updated = await api(`/api/guilds/${guildId}/settings`, {
        method: "PUT",
        body: payload,
      });

      await mutate(updated, { revalidate: false });
      setStatus("Saved");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_ADMIN_API_BASE || "http://localhost:3080",
    [],
  );

  const exportBase = guildId
    ? `${apiBase}/api/guilds/${guildId}/export`
    : null;

  const isAdminOrOwner = user && (user.role === "admin" || user.role === "owner");
  const isOwner = user?.role === "owner";

  const triggerBackup = async () => {
    if (!isOwner || backupRunning) return;

    try {
      setBackupRunning(true);
      setBackupLogs([]);
      setBackupStatus("Starting MySQL dump…");

      const response = await api("/api/backup/mysql-dump", {
        method: "POST",
        body: {},
      });

      setBackupStatus(`Backup started (${response.filename})`);

      await subscribeTask(response.taskId, {
        onEvent: (event) => {
          if (event.event === "log") {
            const stream = event.data.stream || "log";
            setBackupLogs((prev) => [...prev, `${stream}: ${event.data.line}`]);
          }
          if (event.event === "error") {
            const message = event.data?.message || "Backup error";
            setBackupLogs((prev) => [...prev, `stderr: ${message}`]);
            setBackupStatus(`Backup error: ${message}`);
          }
          if (event.event === "end") {
            const statusResult = event.data?.status || "completed";
            setBackupStatus(
              statusResult === "completed"
                ? "Backup completed"
                : "Backup ended with errors",
            );
          }
        },
      });

      await refreshBackups?.();
    } catch (err) {
      setBackupStatus(`Backup failed: ${err.message}`);
      setBackupLogs((prev) => [...prev, `stderr: ${err.message}`]);
    } finally {
      setBackupRunning(false);
    }
  };

  useEffect(() => {
    if (isOwner) {
      refreshBackups?.();
    }
  }, [isOwner, refreshBackups]);

  const renderBackupList = (label, files = []) => (
    <div>
      <h4 style={{ marginBottom: 8 }}>{label}</h4>
      {files.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No files found.</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {files.slice(0, 5).map((file) => (
            <li key={file.path} style={{ marginBottom: 4 }}>
              <code>{file.name}</code>
              <span style={{ opacity: 0.7, marginLeft: 8 }}>
                {new Date(file.mtime).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Layout guildId={guildId} title="Club Settings">
      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 520 }}>
        <label>Sheet URL</label>
        <input
          className="input"
          placeholder="https://docs.google.com/spreadsheets/d/..."
          defaultValue={data.sheetUrl || ""}
          onChange={(event) => setSheetUrl(event.target.value)}
        />

        <label style={{ marginTop: 18 }}>Week Window (days)</label>
        <input
          className="input"
          type="number"
          min="1"
          max="14"
          placeholder="7"
          defaultValue={data.weekWindowDays || ""}
          onChange={(event) => setWeekWindow(event.target.value)}
        />

        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          <div style={{ flex: 1 }}>
            <label>Warn Low</label>
            <input
              className="input"
              type="number"
              defaultValue={data.thresholds?.warnLow || ""}
              onChange={(event) => setWarnLow(event.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Warn High</label>
            <input
              className="input"
              type="number"
              defaultValue={data.thresholds?.warnHigh || ""}
              onChange={(event) => setWarnHigh(event.target.value)}
            />
          </div>
        </div>

        <label style={{ marginTop: 18 }}>OpenAI TPM</label>
        <input
          className="input"
          type="number"
          placeholder="60000"
          defaultValue={data.tokensPerMinute || ""}
          onChange={(event) => setTpm(event.target.value)}
        />

        <button type="submit" className="btn" style={{ marginTop: 24 }}>
          Save Settings
        </button>

        {status && <p style={{ marginTop: 12 }}>{status}</p>}

        {data.sheetTest && (
          <p style={{ marginTop: 12, opacity: 0.8 }}>
            Sheet Test: {data.sheetTest.ok ? `OK (${data.sheetTest.title})` : data.sheetTest.error}
          </p>
        )}
      </form>

      {isAdminOrOwner && exportBase && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Exports</h3>
          <p style={{ opacity: 0.7 }}>
            Download corrections or personality snapshots for offline review.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a className="btn outline" href={`${exportBase}/corrections.csv`}>
              Corrections CSV
            </a>
            <a className="btn outline" href={`${exportBase}/corrections.json`}>
              Corrections JSON
            </a>
            <a className="btn outline" href={`${exportBase}/personality.json`}>
              Personality JSON
            </a>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Backups</h3>
          <p style={{ opacity: 0.7 }}>
            Trigger an immediate MySQL dump and export of corrections/personality. Files store under
            <code style={{ marginLeft: 4 }}>/var/backups/slimy</code>.
          </p>
          <button
            className="btn"
            type="button"
            disabled={backupRunning}
            onClick={triggerBackup}
          >
            {backupRunning ? "Backup running…" : "Trigger MySQL Dump"}
          </button>
          {backupStatus && <p style={{ marginTop: 12 }}>{backupStatus}</p>}
          <div
            style={{
              marginTop: 16,
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 8,
              padding: 12,
              fontFamily: "monospace",
              fontSize: 12,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {backupLogs.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No backup logs yet.</p>
            ) : (
              backupLogs.map((line, index) => <div key={index}>{line}</div>)
            )}
          </div>

          {backupInfo && (
            <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
              {renderBackupList("MySQL dumps", backupInfo.mysql)}
              {renderBackupList("Data exports", backupInfo.data)}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
