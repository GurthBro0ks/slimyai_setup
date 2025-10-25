"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useSession } from "../lib/session";
import { useApi } from "../lib/api";
import DiagWidget from "./DiagWidget";

const NAV_SECTIONS = [
  { href: (id) => `/guilds/${id}`, label: "Dashboard" },
  { href: (id) => `/guilds/${id}/settings`, label: "Club Settings" },
  { href: (id) => `/guilds/${id}/channels`, label: "Channels" },
  { href: (id) => `/guilds/${id}/personality`, label: "Personality" },
  { href: (id) => `/guilds/${id}/corrections`, label: "Corrections" },
  { href: (id) => `/guilds/${id}/rescan`, label: "Rescan User" },
  { href: (id) => `/guilds/${id}/usage`, label: "Usage" },
];

export default function Layout({ guildId, children, title, hideSidebar = false }) {
  const router = useRouter();
  const api = useApi();
  const { user, refresh } = useSession();

  const currentPath = useMemo(() => {
    if (!router.asPath) return "";
    return router.asPath.split("?")[0];
  }, [router.asPath]);

  const navLinks = useMemo(() => {
    if (!guildId) return [];
    return NAV_SECTIONS.map((entry) => {
      const href = entry.href(guildId);
      return {
        ...entry,
        href,
        active: currentPath === href,
      };
    });
  }, [guildId, currentPath]);

  return (
    <div className="layout">
      {!hideSidebar && (
        <aside className="sidebar" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Slimy Admin</h1>
            {user && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ opacity: 0.8, fontSize: 14 }}>
                  {user.username} · {user.role?.toUpperCase()}
                </span>
                <button
                  className="btn outline"
                  onClick={async () => {
                    try {
                      await api("/api/auth/logout", { method: "POST" });
                      await refresh();
                      router.push("/");
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
          <DiagWidget />
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {guildId ? (
              <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} legacyBehavior>
                    <a
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: link.active
                          ? "rgba(56, 189, 248, 0.15)"
                          : "transparent",
                        border: link.active
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid transparent",
                      }}
                    >
                      {link.label}
                    </a>
                  </Link>
                ))}
              </nav>
            ) : (
              <p style={{ opacity: 0.7 }}>Select a guild to begin.</p>
            )}
          </div>
          <a
            href="https://id.ionos.com/identifier"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: 24,
              padding: "0.6rem 0.9rem",
              textAlign: "center",
              borderRadius: 12,
              fontWeight: 600,
              letterSpacing: 0.2,
              color: "#fff",
              background: "linear-gradient(135deg, #38bdf8, #3ba55d)",
              boxShadow: "0 6px 18px rgba(59, 130, 246, 0.35)",
              textDecoration: "none",
            }}
          >
            Email Login
          </a>
        </aside>
      )}
      <main className={`content${hideSidebar ? " content--without-sidebar" : ""}`}>
        {title && <h2 style={{ marginTop: 0, marginBottom: 24 }}>{title}</h2>}
        {children}
      </main>
    </div>
  );
}
