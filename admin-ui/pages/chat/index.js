"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { useSession } from "../../lib/session";
import { getSocket, disconnectSocket } from "../../lib/socket";
import { useRouter } from "next/router";

const ROLE_COLORS = {
  member: "#3b82f6",
  club: "#f59e0b",
  admin: "#ef4444",
  bot: "#22c55e",
};

function formatTime(value) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

export default function SlimeChatPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [guildId, setGuildId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const listRef = useRef(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!loading && user && user.guilds?.length && !guildId) {
      setGuildId(String(user.guilds[0].id));
    }
  }, [loading, user, guildId]);

  useEffect(() => {
    if (!loading && user && user.role === "member" && !user.guilds?.length) {
      router.replace("/snail");
    }
  }, [loading, user, router]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload) => {
      if (!guildId || payload.guildId === guildId) {
        setMessages((prev) => {
          if (payload.messageId) {
            const index = prev.findIndex((entry) => entry.messageId === payload.messageId);
            if (index !== -1) {
              const copy = [...prev];
              copy[index] = { ...copy[index], ...payload, pending: false };
              return copy;
            }
          }
          return [...prev, payload];
        });
      }
    };
    socket.on("chat:message", handler);
    return () => {
      socket.off("chat:message", handler);
    };
  }, [guildId]);

  useEffect(() => () => disconnectSocket(), []);

  useEffect(() => {
    if (!listRef.current) return;
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!guildId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    setError("");
    const socket = getSocket();
    const messageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const role = user?.role || "member";
    const localMessage = {
      guildId,
      text,
      ts: new Date().toISOString(),
      pending: true,
      messageId,
      adminOnly,
      from: {
        id: user?.id || "me",
        name: user?.globalName || user?.username || "You",
        role,
        color: ROLE_COLORS[role] || ROLE_COLORS.member,
      },
    };
    setMessages((prev) => [...prev, localMessage]);
    const requestBot = /@slimy(\.ai)?/i.test(text);
    socket.emit("chat:message", { guildId, text, messageId, requestBot, adminOnly }, (ack) => {
      if (ack && ack.error) {
        setError(ack.error);
        setMessages((prev) =>
          prev.map((entry) =>
            entry.messageId === messageId ? { ...entry, pending: false, error: ack.error } : entry,
          ),
        );
      }
    });
  }, [guildId, input, user, adminOnly]);

  const header = useMemo(() => {
    const guild = user?.guilds?.find((g) => String(g.id) === String(guildId));
    return guild ? guild.name : "Chat";
  }, [user, guildId]);

  if (loading) {
    return (
      <Layout title="Slime Chat">
        <div className="card" style={{ padding: "1.25rem" }}>Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout title="Slime Chat">
      <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", display: "grid", gap: "0.75rem", minHeight: "calc(100vh - 200px)" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn outline" onClick={() => setOpen((v) => !v)} style={{ padding: "0.35rem 0.9rem" }}>
            {open ? "Hide chat" : "Show chat"}
          </button>
        </div>
        {open && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1, minHeight: "60vh" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Slime Chat</h3>
                <div style={{ opacity: 0.7, fontSize: "0.9rem" }}>Connected as {user?.globalName || user?.username}</div>
              </div>
              <select className="select" value={guildId} onChange={(event) => setGuildId(event.target.value)}>
                {(user?.guilds || []).map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </header>

            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: "auto",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 12,
                padding: "1rem",
                background: "rgba(12,18,32,0.75)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                minHeight: 0,
              }}
            >
              {messages.filter((msg) => msg.guildId === guildId || !msg.guildId).map((msg, index) => (
                <ChatBubble key={msg.messageId || `${msg.ts}-${index}`} message={msg} mine={msg.from?.id === user?.id} />
              ))}
              {messages.length === 0 && (
                <div style={{ opacity: 0.6, textAlign: "center" }}>No messages yet. Say hi!</div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <input
                  className="input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message…"
                />
                <button className="btn" onClick={handleSend} disabled={!input.trim()}>
                  Send
                </button>
              </div>
              {isAdmin && (
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", opacity: 0.8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={adminOnly}
                    onChange={(e) => setAdminOnly(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Admin Only (visible only to admins)</span>
                </label>
              )}
            </div>

            {error && <div style={{ color: "#f87171", fontSize: "0.85rem" }}>{error}</div>}

            <footer style={{ fontSize: "0.85rem", opacity: 0.7, textAlign: "center" }}>
              mention <strong>@slimy.ai</strong> to chat with it
            </footer>
          </div>
        )}
      </div>
    </Layout>
  );
}

function ChatBubble({ message, mine }) {
  const color = message?.from?.color || (mine ? "#3b82f6" : "#f59e0b");
  const isAdminOnly = Boolean(message.adminOnly);

  return (
    <div
      style={{
        justifySelf: mine ? "end" : "start",
        maxWidth: "75%",
        background: isAdminOnly ? "rgba(239,68,68,0.15)" : (mine ? "rgba(59,130,246,0.15)" : "rgba(245,158,11,0.15)"),
        border: isAdminOnly ? "2px solid #ef4444" : `1px solid ${color}33`,
        borderRadius: 12,
        padding: "0.75rem",
        boxShadow: isAdminOnly ? "0 8px 24px rgba(239,68,68,0.3)" : `0 8px 24px ${color}22`,
        opacity: message.pending ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ fontWeight: 600, color }}>{message.from?.name || "User"}</div>
        {isAdminOnly && (
          <span style={{
            fontSize: "0.7rem",
            padding: "0.125rem 0.375rem",
            borderRadius: 4,
            background: "#ef4444",
            color: "white",
            fontWeight: 700,
          }}>
            ADMIN
          </span>
        )}
      </div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{message.text}</div>
      <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: 6 }}>
        {formatTime(message.ts)}
      </div>
      {message.error && (
        <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: 6 }}>
          {message.error}
        </div>
      )}
    </div>
  );
}
