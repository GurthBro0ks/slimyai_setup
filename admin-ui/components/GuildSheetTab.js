"use client";

import useSWR from "swr";
import { apiFetch } from "../lib/api";
import CorrectionsManager from "./CorrectionsManager";
import RescanUploader from "./RescanUploader";
import {
  FALLBACK_SHEET_LABEL,
  getSheetEmbedSource,
} from "../lib/sheets";

const fetcher = (path) => apiFetch(path);

export default function GuildSheetTab({ guildId }) {
  const { data, isLoading, error } = useSWR(
    guildId ? `/api/guilds/${guildId}/settings` : null,
    fetcher,
  );

  const embedInfo = getSheetEmbedSource(data);
  const embedUrl = embedInfo?.src || null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {isLoading ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          Loading sheet…
        </div>
      ) : error ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          Failed to load guild settings.
        </div>
      ) : embedUrl ? (
        <>
          <div className="card" style={{ padding: 0, overflow: "hidden", minHeight: "60vh" }}>
            <iframe
              title="Current Sheet"
              src={embedUrl}
              style={{ width: "100%", height: "70vh", border: "none" }}
            />
          </div>
          {embedInfo?.reason === "fallback" && (
            <p style={{ fontSize: 12, opacity: 0.75, margin: "-12px 0 0" }}>
              Showing baseline sheet “{FALLBACK_SHEET_LABEL}” until the next data refresh.
            </p>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: "2rem" }}>
          <p style={{ margin: 0 }}>
            No Google Sheet configured for this guild yet. Add a sheet URL on the{" "}
            <strong>Club Settings</strong> page.
          </p>
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 12px" }}>Corrections</h3>
        <CorrectionsManager guildId={guildId} />
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px" }}>Rescan Tools</h3>
        <RescanUploader guildId={guildId} />
      </div>
    </div>
  );
}
