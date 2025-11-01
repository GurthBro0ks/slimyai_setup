"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function ClubHome() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [guilds, setGuilds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [health, setHealth] = useState(null);
  const [snailStats, setSnailStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (loading || !user) return;
    const hasClubAccess = user.guilds?.some((g) => g.role === "club" || g.role === "admin");
    if (!hasClubAccess) {
      router.replace("/snail");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user) {
      apiFetch("/api/guilds")
        .then((data) => {
          const list = Array.isArray(data?.guilds) ? data.guilds : [];
          setGuilds(list);
          const initial = router.query.guildId || list[0]?.id || null;
          if (initial) setSelected(String(initial));
        })
        .catch((err) => setError(err.message || "Failed to load guilds"));
  }
  }, [loading, user, router.query.guildId]);

  useEffect(() => {
    if (!selected) {
      setHealth(null);
      setSnailStats(null);
      return;
    }
    setError(null);
    apiFetch(`/api/guilds/${selected}/health`)
      .then((data) => setHealth(data))
      .catch((err) => setError(err.message || "Failed to load club health"));
    apiFetch(`/api/guilds/${selected}/snail/stats`)
      .then((data) => setSnailStats(data?.record || null))
      .catch(() => setSnailStats(null));
  }, [selected]);

  const guildOptions = useMemo(() => {
    return guilds.map((guild) => ({ value: guild.id, label: guild.name }));
  }, [guilds]);

  if (loading || !user) {
    return (
      <Layout title="Club Dashboard" guildId={selected || undefined}>
        <div className="card" style={{ padding: "1.25rem" }}>Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout title="Club Dashboard" guildId={selected || undefined}>
      {error && (
        <div className="card" style={{ padding: "1rem", marginBottom: "1rem", color: "#f87171" }}>
          {error}
        </div>
      )}

      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Club Overview</h2>
        <div>
          <select
            className="select"
            value={selected || ""}
            onChange={(event) => {
              const value = event.target.value;
              setSelected(value);
              router.replace({ pathname: "/club", query: { guildId: value } }, undefined, { shallow: true });
            }}
          >
            {guildOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <a className="btn outline" href={selected ? `/snail/${selected}` : "/snail"}>
          🐌 Snail Tools
        </a>
      </div>

      {health && (
        <div className="grid" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
          <StatCard title="Members" value={health.members} />
          <StatCard title="Total Power" value={health.totalPower} />
          <StatCard title="SIM Power" value={health.simPower} />
          <StatCard title="Last Snapshot" value={health.lastSnapshotAt || "—"} />
        </div>
      )}

      {snailStats ? (
        <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
          <h3 style={{ marginTop: 0 }}>Latest Snail Snapshot</h3>
          <div style={{ fontSize: "0.9rem", opacity: 0.75 }}>
            Captured {new Date(snailStats.uploadedAt).toLocaleString()} – prompt: {snailStats.prompt || "Default"}
          </div>
          <div className="grid" style={{ gap: "0.75rem" }}>
            {(snailStats.results || []).map((entry) => (
              <div key={entry.file?.storedAs} className="card" style={{ padding: "0.9rem" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{entry.file?.name || "Screenshot"}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Uploaded by {entry.uploadedBy?.name || "unknown"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>No Snail stats yet</h3>
          <p style={{ margin: 0, opacity: 0.75 }}>
            Run an analysis in Snail Tools to populate this panel.
          </p>
        </div>
      )}
    </Layout>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="card" style={{ padding: "1rem" }}>
      <div style={{ opacity: 0.65, fontSize: "0.85rem" }}>{title}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatNumber(value)}</div>
    </div>
  );
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}
