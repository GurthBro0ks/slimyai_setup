"use client";

import { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "../lib/session";
import { useApi } from "../lib/api";
import DiagWidget from "./DiagWidget";
import SlimeChatBar from "./SlimeChatBar";

const NAV_SECTIONS = [
  { href: (id) => `/guilds/${id}`, label: "Dashboard" },
  { href: (id) => `/guilds/${id}/settings`, label: "Club Settings" },
  { href: (id) => `/guilds/${id}/channels`, label: "Channels" },
  { href: (id) => `/guilds/${id}/personality`, label: "Personality" },
  { href: (id) => `/guilds/${id}/usage`, label: "Usage" },
];

export default function Layout({ guildId, children, title, hideSidebar = false }) {
  const router = useRouter();
  const api = useApi();
  const { user, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);
  const baseRole = user?.role || "member";
  const effectiveRole = useMemo(() => {
    if (!guildId || !user?.guilds) return baseRole;
    const match = user.guilds.find((g) => String(g.id) === String(guildId));
    return (match && match.role) || baseRole;
  }, [user?.guilds, guildId, baseRole]);
  const isAdmin = effectiveRole === "admin";
  const isClub = effectiveRole === "club" && !isAdmin;

  const currentPath = useMemo(() => {
    if (!router.asPath) return "";
    return router.asPath.split("?")[0];
  }, [router.asPath]);

  const navLinks = useMemo(() => {
    if (!guildId || !isAdmin) return [];
    return NAV_SECTIONS.map((entry) => {
      const href = entry.href(guildId);
      return {
        ...entry,
        href,
        active: currentPath === href,
      };
    });
  }, [guildId, currentPath, isAdmin]);

  const snailHref = guildId ? `/snail/${guildId}` : "/snail";
  const snailActive = useMemo(() => {
    if (!router.asPath) return false;
    return router.asPath.startsWith("/snail");
  }, [router.asPath]);

  const emailActive = useMemo(() => {
    if (!router.asPath) return false;
    return router.asPath.startsWith("/email-login");
  }, [router.asPath]);

  const clubActive = useMemo(() => {
    if (!router.asPath) return false;
    return router.asPath.startsWith("/club");
  }, [router.asPath]);

  return (
    <>
      <Head><title>{title || "slimy.ai – Admin Panel"}</title></Head>

      {!hideSidebar && (
        <>
          {/* Mobile header */}
          <div className="header">
            <button className="burger" onClick={()=>setOpen(v=>!v)} aria-label="Toggle menu">☰</button>
            <div style={{fontWeight:700}}>slimy.ai Admin</div>
            <div style={{ width: 40 }} />
          </div>

          <div className="shell">
            <aside data-open={open ? "true" : "false"}>
              <div className="diag card">
                <DiagWidget/>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>slimy.ai Admin</h1>
                {user && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                    <span style={{ opacity: 0.8, fontSize: 14 }}>
                      {user.username} · {effectiveRole.toUpperCase()}
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

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
                {isAdmin && guildId ? (
                  <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {navLinks.map((link) => (
                      <Link key={link.href} href={link.href} legacyBehavior>
                        <a
                          onClick={closeMenu}
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
                ) : isAdmin ? (
                  <p style={{ opacity: 0.7 }}>Select a guild to begin.</p>
                ) : (
                  <p style={{ opacity: 0.7 }}>
                    Snail tools let members analyze captures without admin access.
                  </p>
                )}

                <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {isClub && (
                    <Link href="/club" legacyBehavior>
                      <a
                        onClick={closeMenu}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: clubActive
                            ? "rgba(56, 189, 248, 0.15)"
                            : "transparent",
                          border: clubActive
                            ? "1px solid rgba(56, 189, 248, 0.4)"
                            : "1px solid transparent",
                        }}
                      >
                        Club Dashboard
                      </a>
                    </Link>
                  )}
                  <Link href={snailHref} legacyBehavior>
                    <a
                      onClick={closeMenu}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 600,
                        background: snailActive
                          ? "rgba(56, 189, 248, 0.15)"
                          : "transparent",
                        border: snailActive
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid transparent",
                      }}
                    >
                      <span role="img" aria-label="snail">🐌</span> Snail Tools
                    </a>
                  </Link>
                  <Link href="/chat" legacyBehavior>
                    <a
                      onClick={closeMenu}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 600,
                        background: router.asPath.startsWith("/chat")
                          ? "rgba(56, 189, 248, 0.15)"
                          : "transparent",
                        border: router.asPath.startsWith("/chat")
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid transparent",
                      }}
                    >
                      💬 Slime Chat
                    </a>
                  </Link>
                  {isAdmin && (
                    <Link href="/email-login" legacyBehavior>
                      <a
                        onClick={closeMenu}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          fontWeight: 600,
                          background: emailActive
                            ? "rgba(56, 189, 248, 0.15)"
                            : "transparent",
                          border: emailActive
                            ? "1px solid rgba(56, 189, 248, 0.4)"
                            : "1px solid transparent",
                        }}
                      >
                        📧 Email Login
                      </a>
                    </Link>
                  )}
                </nav>
              </div>
            </aside>
            <div
              className="mobile-overlay"
              data-open={open ? "true" : "false"}
              onClick={closeMenu}
            />

            <main className="content">
              {title && <h2 style={{ marginTop: 0, marginBottom: 24 }}>{title}</h2>}
              {children}
            </main>
          </div>
        </>
      )}

      {hideSidebar && (
        <main className="content content--without-sidebar">
          {title && <h2 style={{ marginTop: 0, marginBottom: 24 }}>{title}</h2>}
          {children}
        </main>
      )}

      {/* Slime Chat bottom bar (shows for all logged-in users) */}
      {user && <SlimeChatBar guildId={guildId} />}
    </>
  );
}
