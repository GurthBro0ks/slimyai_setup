"use client";

import { useState } from "react";
import { useRouter } from "next/router";

import Layout from "../../../components/Layout";
import { useApi } from "../../../lib/api";

export default function GuildRescanPage() {
  const router = useRouter();
  const { guildId } = router.query;
  const api = useApi();

  const [file, setFile] = useState(null);
  const [member, setMember] = useState("");
  const [metric, setMetric] = useState("auto");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!file || !member) {
      setStatus("File and member are required");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("member", member);
    formData.append("metric", metric);

    setStatus("Uploading…");

    try {
      const response = await api(`/api/guilds/${guildId}/rescan-user`, {
        method: "POST",
        body: formData,
      });
      setResult(response);
      setStatus("Rescan complete");
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <Layout guildId={guildId} title="Rescan Member Screenshot">
      <form onSubmit={submit} className="card" style={{ maxWidth: 520, display: "grid", gap: 16 }}>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />

        <input
          className="input"
          placeholder="Display name"
          value={member}
          onChange={(event) => setMember(event.target.value)}
        />

        <select className="select" value={metric} onChange={(event) => setMetric(event.target.value)}>
          <option value="auto">Auto</option>
          <option value="total">Total</option>
          <option value="sim">Sim</option>
        </select>

        <button className="btn" type="submit">
          Upload &amp; Parse
        </button>

        {status && <p>{status}</p>}
      </form>

      {result && (
        <div className="card" style={{ marginTop: 24 }}>
          <h4 style={{ marginTop: 0 }}>Result</h4>
          <p>
            {result.displayName} → {Number(result.value).toLocaleString()} ({result.metric})
          </p>
          <p style={{ opacity: 0.7 }}>
            Ensemble disagreements: {result.ensemble?.disagreements} / {result.ensemble?.totalMembers}
          </p>
        </div>
      )}
    </Layout>
  );
}
