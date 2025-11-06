"use client";

import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, useApi } from "../lib/api";

const fetcher = (path) => apiFetch(path);

export default function GuildUploadsTab({ guildId }) {
  const api = useApi();
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const {
    data,
    mutate,
    isLoading,
  } = useSWR(guildId ? `/api/uploads/${guildId}` : null, fetcher);

  const handleUpload = useCallback(
    async (files) => {
      if (!files.length || !guildId) return;
      const form = new FormData();
      files.forEach((file) => form.append("files", file));

      setBusy(true);
      setStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);

      try {
        const response = await api(`/api/uploads/${guildId}`, {
          method: "POST",
          body: form,
        });

        const uploaded = response?.uploaded ?? files.length;
        setStatus(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}.`);
        await mutate();
      } catch (err) {
        setStatus(err.message || "Upload failed");
      } finally {
        setBusy(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [api, guildId, mutate],
  );

  const onInputChange = (event) => {
    const files = Array.from(event.target.files || []);
    void handleUpload(files);
  };

  const items = data?.items || [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        capture="environment"
        style={{ display: "none" }}
        onChange={onInputChange}
      />

      <div
        className="card"
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <button
          className={`btn${busy ? " outline" : ""}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : "Select Screenshots"}
        </button>
        <button
          className="btn outline"
          type="button"
          disabled={isLoading || busy}
          onClick={() => mutate()}
        >
          Refresh
        </button>
        {status && (
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            {status}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          Loading uploads…
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ margin: 0, opacity: 0.8 }}>No uploads yet. Drop screenshots here to get started.</p>
        </div>
      ) : (
        <div
          className="card uploads-grid"
          style={{
            padding: 16,
          }}
        >
          {items.map((item) => (
            <a
              key={item.id}
              href={item.urls?.large || item.urls?.original || "#"}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                flexDirection: "column",
                textDecoration: "none",
                color: "inherit",
                gap: 6,
              }}
            >
              <img
                src={item.urls?.thumb || item.urls?.large || item.urls?.original}
                alt="Upload thumbnail"
                style={{
                  width: "100%",
                  aspectRatio: "4 / 5",
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.4)",
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {item.uploadedBy && (
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    Uploaded by {item.uploadedBy}
                  </div>
                )}
                <div style={{ opacity: 0.7 }}>
                  {new Date(item.uploadedAt).toLocaleString()}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
