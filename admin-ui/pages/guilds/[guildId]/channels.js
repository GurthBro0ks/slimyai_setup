"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import Layout from "../../../components/Layout";
import { apiFetch, useApi } from "../../../lib/api";

const fetcher = (path) => apiFetch(path);

function normalizeEntry(entry) {
  return {
    channelId: entry.channelId || entry.channel_id || "",
    channelName: entry.channelName || entry.channel_name || "",
    modeText: JSON.stringify(entry.modes || {}, null, 2),
    allowlistText: (entry.allowlist || []).join(","),
  };
}

export default function GuildChannelsPage() {
  const router = useRouter();
  const { guildId } = router.query;
  const api = useApi();
  const { data, mutate } = useSWR(
    guildId ? `/api/guilds/${guildId}/channels` : null,
    fetcher,
  );

  // Fetch live channels from Discord
  const { data: liveData, mutate: mutateLive } = useSWR(
    guildId ? `/api/guilds/${guildId}/channels/live` : null,
    fetcher,
  );

  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (data?.channels) {
      setRows(data.channels.map(normalizeEntry));
    }
  }, [data]);

  const updateRow = (index, patch) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { channelId: "", channelName: "", modeText: "{}", allowlistText: "" },
    ]);
  };

  const save = async () => {
    setStatus("Saving…");
    try {
      const payload = rows
        .filter((row) => row.channelId)
        .map((row) => {
          let modes = {};
          try {
            modes = row.modeText ? JSON.parse(row.modeText) : {};
          } catch (err) {
            throw new Error(`Invalid JSON for modes in channel ${row.channelId}`);
          }
          const allowlist = row.allowlistText
            ? row.allowlistText.split(",").map((token) => token.trim()).filter(Boolean)
            : [];
          return {
            channelId: row.channelId,
            channelName: row.channelName,
            modes,
            allowlist,
          };
        });

      const response = await api(`/api/guilds/${guildId}/channels`, {
        method: "PUT",
        body: { channels: payload },
      });

      await mutate(response, { revalidate: false });
      setStatus("Saved");
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <Layout guildId={guildId} title="Channel Modes & Allowlist">
      {/* Live Channels from Discord */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Live Channels from Discord</h3>
          <button className="btn outline" onClick={() => mutateLive()}>
            Refresh
          </button>
        </div>
        {liveData?.note === "bot_token_missing" && (
          <div style={{ padding: "0.75rem", background: "rgba(251, 191, 36, 0.1)", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", marginBottom: "1rem", color: "rgb(251, 191, 36)" }}>
            Bot token not configured on API. Cannot fetch live channels.
          </div>
        )}
        {liveData?.error && (
          <div style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", marginBottom: "1rem", color: "rgb(239, 68, 68)" }}>
            Error fetching channels from Discord
          </div>
        )}
        {liveData?.channels && liveData.channels.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "0.75rem" }}>
            {liveData.channels.map((ch) => (
              <div key={ch.id} style={{ padding: "0.6rem 0.8rem", border: "1px solid rgba(255,255,255,.1)", borderRadius: "8px", background: "rgba(255,255,255,.02)" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{ch.name}</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.5, fontFamily: "monospace" }}>{ch.id}</div>
              </div>
            ))}
          </div>
        ) : (
          !liveData && <div>Loading...</div>
        )}
      </div>

      {/* Existing channel configuration */}
      <div className="card" style={{ marginBottom: 24 }}>
        <button className="btn" onClick={addRow}>
          Add Channel Configuration
        </button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Channel ID</th>
              <th>Name</th>
              <th>Modes JSON</th>
              <th>Allowlist</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  <input
                    className="input"
                    value={row.channelId}
                    onChange={(event) => updateRow(index, { channelId: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={row.channelName}
                    onChange={(event) => updateRow(index, { channelName: event.target.value })}
                  />
                </td>
                <td>
                  <textarea
                    className="textarea"
                    value={row.modeText}
                    onChange={(event) => updateRow(index, { modeText: event.target.value })}
                  />
                </td>
                <td>
                  <textarea
                    className="textarea"
                    value={row.allowlistText}
                    onChange={(event) => updateRow(index, { allowlistText: event.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <button className="btn" onClick={save}>Save Changes</button>
          {status && <span>{status}</span>}
        </div>
      </div>
    </Layout>
  );
}
