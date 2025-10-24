"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import Layout from "../../../components/Layout";
import { apiFetch, useApi } from "../../../lib/api";

const fetcher = (path) => apiFetch(path);

function parsePowerLite(input) {
  if (input === null || typeof input === "undefined") return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const suffixMatch = raw.match(/^([\d,.]+)([kmb])$/i);
  if (suffixMatch) {
    const base = Number(suffixMatch[1].replace(/,/g, ""));
    const suffix = suffixMatch[2].toLowerCase();
    if (!Number.isFinite(base)) return null;
    const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1e9;
    return base * multiplier;
  }
  const normalized = raw.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export default function GuildCorrectionsPage() {
  const router = useRouter();
  const { guildId } = router.query;
  const api = useApi();
  const { data, mutate } = useSWR(
    guildId ? `/api/guilds/${guildId}/corrections` : null,
    fetcher,
  );

  const [form, setForm] = useState({
    displayName: "",
    metric: "total",
    value: "",
    reason: "",
  });
  const [status, setStatus] = useState(null);
  const [csvText, setCsvText] = useState("");

  const parsedPreview = useMemo(() => parsePowerLite(form.value), [form.value]);

  const addCorrection = async (event) => {
    event.preventDefault();
    setStatus("Saving…");
    try {
      await api(`/api/guilds/${guildId}/corrections`, {
        method: "POST",
        body: form,
      });
      setForm({ displayName: "", metric: form.metric, value: "", reason: "" });
      await mutate();
      setStatus("Added correction");
    } catch (err) {
      setStatus(err.message);
    }
  };

  const removeCorrection = async (id) => {
    await api(`/api/guilds/${guildId}/corrections/${id}`, {
      method: "DELETE",
    });
    await mutate();
  };

  const importCsv = async () => {
    const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;

    for (const line of lines) {
      const [displayName, metric, value, reason] = line.split(",").map((chunk) => chunk.trim());
      if (!displayName || !metric || !value) continue;
      try {
        await api(`/api/guilds/${guildId}/corrections`, {
          method: "POST",
          body: { displayName, metric, value, reason },
        });
      } catch (err) {
        setStatus(`Failed to import ${displayName}: ${err.message}`);
        break;
      }
    }

    await mutate();
    setCsvText("");
    setStatus("CSV import complete");
  };

  return (
    <Layout guildId={guildId} title="Member Corrections">
      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={addCorrection} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <input
              className="input"
              placeholder="Display Name"
              value={form.displayName}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
            />
            <select
              className="select"
              value={form.metric}
              onChange={(event) => setForm((prev) => ({ ...prev, metric: event.target.value }))}
            >
              <option value="total">Total</option>
              <option value="sim">Sim</option>
            </select>
            <input
              className="input"
              placeholder="Value"
              value={form.value}
              onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
            />
          </div>
          <input
            className="input"
            placeholder="Reason (optional)"
            value={form.reason}
            onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn" type="submit">
              Add Correction
            </button>
            <span style={{ opacity: 0.7 }}>Preview: {parsedPreview ?? "—"}</span>
            {status && <span>{status}</span>}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h4 style={{ marginTop: 0 }}>Batch CSV Import</h4>
        <textarea
          className="textarea"
          placeholder="displayName,metric,value,reason"
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
        />
        <button className="btn outline" style={{ marginTop: 12 }} onClick={importCsv}>
          Import CSV
        </button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Metric</th>
              <th>Value</th>
              <th>Reason</th>
              <th>Source</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.corrections || []).map((corr) => (
              <tr key={corr.id}>
                <td>{corr.display_name}</td>
                <td>{corr.metric}</td>
                <td>{Number(corr.value).toLocaleString()}</td>
                <td>{corr.reason || "—"}</td>
                <td>{corr.source || "manual"}</td>
                <td>{new Date(corr.created_at).toLocaleString()}</td>
                <td>
                  <button className="btn outline" onClick={() => removeCorrection(corr.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
