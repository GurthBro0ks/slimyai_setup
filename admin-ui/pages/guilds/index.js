"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useSession } from "../../lib/session";
import { apiFetch } from "../../lib/api";
import { buildBotInviteUrl } from "../../lib/discord";

export default function GuildsIndex() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (sessionLoading || !user) return;

    (async () => {
      try {
        const result = await apiFetch("/api/guilds");
        setGuilds(result.guilds || []);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch guilds:", err);
        setGuilds([]);
        setError(err.message || "Failed to load guilds");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionLoading, user]);

  const inviteBase = {
    clientId: process.env.NEXT_PUBLIC_BOT_CLIENT_ID || "1415387116564910161",
    scopes: process.env.NEXT_PUBLIC_BOT_INVITE_SCOPES || "bot applications.commands",
    permissions: process.env.NEXT_PUBLIC_BOT_PERMISSIONS || "274878286848",
  };
  const globalInviteUrl = buildBotInviteUrl(inviteBase);

  const handleOpen = (guild) => {
    if (!guild) return;
    const guildId = guild.id;
    if (guild.role === "admin") {
      router.push(`/guilds/${guildId}`);
    } else if (guild.role === "club") {
      router.push(`/club?guildId=${guildId}`);
    } else {
      router.push(`/snail/${guildId}`);
    }
  };

  if (sessionLoading || loading) {
    return (
      <Layout title="Loading Guilds">
        <div style={{ textAlign: "center", padding: "2rem" }}>Loading your guilds…</div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout title="No Session">
        <div style={{ textAlign: "center", padding: "2rem" }}>Please log in again.</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error Loading Guilds">
        <div className="card" style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ textAlign: "center", display: "grid", gap: "1.25rem" }}>
            <div style={{ fontSize: "3rem" }}>⚠️</div>
            <h2 style={{ margin: 0, color: "#f87171" }}>Failed to Load Guilds</h2>
            <p style={{ opacity: 0.8 }}>{error}</p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                className="btn"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  window.location.reload();
                }}
              >
                Retry
              </button>
              <a href="/" className="btn outline">
                Go Home
              </a>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (guilds.length === 0) {
    return (
      <Layout title="No Guilds Available">
        <div style={{ textAlign: "center", padding: "2rem", display: "grid", gap: "1.25rem" }}>
          <div>No guilds available. Make sure you're in at least one Discord server.</div>
          <a
            href={globalInviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              background: "linear-gradient(135deg, rgb(109,40,217), rgb(34,197,94))",
              color: "white",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Add Bot to Server
          </a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Select a Guild">
      <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <a
          href={globalInviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: "1px solid rgba(56,189,248,0.3)",
            background: "rgba(56,189,248,0.1)",
            color: "rgb(56,189,248)",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          + Add Bot to Another Server
        </a>
      </div>

      <div className="card" style={{ padding: "1.5rem", display: "grid", gap: "1rem" }}>
        <h2 style={{ margin: 0 }}>Choose a guild</h2>
        <p style={{ opacity: 0.75 }}>Pick a server below. Access level is applied after selection.</p>
        {error && <div style={{ color: "#f87171" }}>{error}</div>}
        <div style={{ display: "grid", gap: "1rem" }}>
          {guilds.map((guild) => {
            const installed = !!guild.installed;
            const guildInviteUrl = buildBotInviteUrl({
              ...inviteBase,
              guildId: guild.id,
              lockGuild: true,
            });
            return (
              <div
                key={guild.id}
                className="card"
                style={{
                  padding: "1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{guild.name}</div>
                  <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>Role: {(guild.role || "member").toUpperCase()}</div>
                  <div style={{ opacity: 0.6, fontSize: "0.8rem" }}>
                    {installed ? "Bot installed" : "Bot not installed"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  {!installed && (
                    <a
                      href={guildInviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        background: "linear-gradient(135deg, rgb(109,40,217), rgb(34,197,94))",
                        color: "white",
                        textDecoration: "none",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                      }}
                    >
                      Invite Bot
                    </a>
                  )}
                  <button className="btn" onClick={() => handleOpen(guild)}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
