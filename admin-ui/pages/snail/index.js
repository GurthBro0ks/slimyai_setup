"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useSession } from "../../lib/session";

export default function SnailHome() {
  const router = useRouter();
  const { user, loading } = useSession();
  const guilds = useMemo(() => user?.guilds || [], [user]);
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (loading || redirected) return;
    if (!user) {
      router.replace("/");
      setRedirected(true);
      return;
    }
    if (guilds.length === 1) {
      router.replace(`/snail/${guilds[0].id}`);
      setRedirected(true);
    }
  }, [loading, user, guilds, router, redirected]);

  if (loading || !user) {
    return (
      <Layout title="Snail Tools">
        <div className="card" style={{ padding: "1.25rem" }}>Loading session…</div>
      </Layout>
    );
  }

  return (
    <Layout title="Snail Tools">
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.5rem" }}>Choose a guild</h2>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Snail Mode unlocks member-friendly analyzers for the guilds linked to your Discord.
        </p>
      </div>

      {guilds.length === 0 ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <p style={{ margin: 0, opacity: 0.8 }}>
            We didn’t detect any shared guilds. Ask an admin to invite you or try logging in with a different Discord account.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: "1rem" }}>
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {guilds.map((guild) => (
              <a
                key={guild.id}
                href={`/snail/${guild.id}`}
                className="card"
                style={{
                  textDecoration: "none",
                  padding: "0.9rem 1rem",
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(15, 23, 42, 0.4)",
                }}
              >
                <div style={{ fontWeight: 600 }}>{guild.name}</div>
                <div style={{ opacity: 0.65, fontSize: "0.8rem", marginTop: "0.3rem" }}>
                  #{guild.id}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
