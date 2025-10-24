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
      <div className="card" style={{ marginBottom: 24 }}>
        <button className="btn" onClick={addRow}>
          Add Channel
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
