"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useSession } from "../lib/session";
import { useApi } from "../lib/api";

const NAV_SECTIONS = [
  { href: (id) => `/guilds/${id}`, label: "Dashboard" },
  { href: (id) => `/guilds/${id}/settings`, label: "Club Settings" },
  { href: (id) => `/guilds/${id}/channels`, label: "Channels" },
  { href: (id) => `/guilds/${id}/personality`, label: "Personality" },
  { href: (id) => `/guilds/${id}/corrections`, label: "Corrections" },
  { href: (id) => `/guilds/${id}/rescan`, label: "Rescan User" },
  { href: (id) => `/guilds/${id}/usage`, label: "Usage" },
];

export default function Layout({ guildId, children, title }) {
  const router = useRouter();
  const api = useApi();
  const { user, refresh } = useSession();

  const navLinks = useMemo(() => {
    if (!guildId) return [];
    return NAV_SECTIONS.map((entry) => {
      const href = entry.href(guildId);
      return {
        ...entry,
        href,
        active: router.pathname === href,
      };
    });
  }, [guildId, router.asPath]);

  return (
    <div className="layout">
      <aside className="sidebar">
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
        {guildId ? (
          <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} legacyBehavior>
                <a
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: router.asPath === link.href
                      ? "rgba(56, 189, 248, 0.15)"
                      : "transparent",
                    border: router.asPath === link.href
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
      </aside>
      <main className="content">
        {title && <h2 style={{ marginTop: 0, marginBottom: 24 }}>{title}</h2>}
        {children}
      </main>
    </div>
  );
}
