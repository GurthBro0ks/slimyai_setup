"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import Layout from "../../../components/Layout";
import { apiFetch, useApi } from "../../../lib/api";

const fetcher = (path) => apiFetch(path);

export default function GuildPersonalityPage() {
  const router = useRouter();
  const { guildId } = router.query;
  const api = useApi();
  const { data, mutate } = useSWR(
    guildId ? `/api/guilds/${guildId}/personality` : null,
    fetcher,
  );

  const [draft, setDraft] = useState("{}");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (data?.profile) {
      setDraft(JSON.stringify(data.profile, null, 2));
    }
  }, [data]);

  const save = async () => {
    setStatus("Saving…");
    try {
      const parsed = draft ? JSON.parse(draft) : {};
      const updated = await api(`/api/guilds/${guildId}/personality`, {
        method: "PUT",
        body: { profile: parsed },
      });
      await mutate(updated, { revalidate: false });
      setStatus("Saved");
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <Layout guildId={guildId} title="Persona Overrides">
      <div className="card" style={{ maxWidth: 720 }}>
        <p style={{ opacity: 0.7 }}>
          Paste persona overrides (JSON). These merge with base persona in config/slimy_ai.persona.json.
        </p>
        <textarea
          className="textarea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />

        <button className="btn" style={{ marginTop: 20 }} onClick={save}>
          Save Personality
        </button>
        {status && <p style={{ marginTop: 12 }}>{status}</p>}

        {data?.updatedAt && (
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            Last updated: {new Date(data.updatedAt).toLocaleString()} by {data.updatedBy || "unknown"}
          </p>
        )}
      </div>
    </Layout>
  );
}
