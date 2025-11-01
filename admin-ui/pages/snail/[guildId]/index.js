"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import { apiFetch } from "../../../lib/api";
import { useSession } from "../../../lib/session";

const TABS = [
  { key: "analyze", label: "Analyze" },
  { key: "stats", label: "Stats" },
  { key: "codes", label: "Codes" },
  { key: "help", label: "Help" },
  { key: "calc", label: "Calc" },
  { key: "guides", label: "Snail Guides" },
  { key: "war", label: "Species War" },
];

const CODE_SCOPES = [
  { value: "active", label: "Active" },
  { value: "past7", label: "Past 7 Days" },
  { value: "all", label: "All" },
];

export default function SnailGuildPage() {
  const router = useRouter();
  const { user, loading } = useSession();
  const rawGuildId = router.query.guildId;
  const guildId = useMemo(() => {
    if (!rawGuildId) return null;
    return Array.isArray(rawGuildId) ? rawGuildId[0] : rawGuildId;
  }, [rawGuildId]);

  const [activeTab, setActiveTab] = useState("analyze");
  const [statsVersion, bumpStats] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  const hasAccess = useMemo(() => {
    if (!guildId || !user?.guilds) return false;
    return user.guilds.some((g) => String(g.id) === String(guildId));
  }, [guildId, user?.guilds]);

  const guildName = useMemo(() => {
    if (!guildId || !user?.guilds) return guildId;
    const match = user.guilds.find((g) => String(g.id) === String(guildId));
    return match ? match.name : guildId;
  }, [guildId, user?.guilds]);

  if (loading || !guildId) {
    return (
      <Layout title="Snail Tools">
        <div className="card" style={{ padding: "1.25rem" }}>Loading…</div>
      </Layout>
    );
  }

  if (!hasAccess) {
    return (
      <Layout title="Snail Tools">
        <div className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Access denied</h3>
          <p style={{ margin: 0, opacity: 0.8 }}>
            You need to be a member of this guild to use Snail Mode. Pick another guild from the list or ask an admin to link you.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout guildId={guildId} title={`Snail Tools · ${guildName || ""}`}>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`btn ${activeTab === tab.key ? "" : "outline"}`}
              onClick={() => setActiveTab(tab.key)}
              style={{ minWidth: "110px" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "analyze" && <AnalyzeTab guildId={guildId} onComplete={() => bumpStats((v) => v + 1)} />}
      {activeTab === "stats" && <StatsTab guildId={guildId} version={statsVersion} />}
      {activeTab === "codes" && <CodesTab guildId={guildId} />}
      {activeTab === "help" && <HelpTab guildId={guildId} />}
      {activeTab === "calc" && <CalcTab guildId={guildId} />}
      {activeTab === "guides" && <GuidesTab />}
      {activeTab === "war" && <SpeciesWarTab />}
    </Layout>
  );
}

function AnalyzeTab({ guildId, onComplete }) {
  const [files, setFiles] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [showHelp, setShowHelp] = useState(false);

  const onSelect = useCallback((event) => {
    const picked = Array.from(event.target.files || []);
    setFiles(picked.slice(0, 8));
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const picked = Array.from(event.dataTransfer.files || []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (picked.length) {
      setFiles(picked.slice(0, 8));
    }
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setStatus("Analyzing…");
    setResults([]);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("images", file));
      form.append("prompt", prompt);
      const response = await fetch(`/api/guilds/${guildId}/snail/analyze`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to analyze");
      }
      setResults(data.results || []);
      setStatus("Analysis complete");
      setFiles([]);
      if (typeof onComplete === "function") {
        onComplete();
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
      setStatus("");
    }
  }, [files, prompt, guildId, onComplete]);

  return (
    <div className="card" style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0 }}>Analyze Screenshots</h3>
        <button
          type="button"
          className="btn outline"
          onClick={() => setShowHelp((prev) => !prev)}
          aria-expanded={showHelp}
        >
          {showHelp ? "Hide Help" : "Help"}
        </button>
      </div>

      {showHelp && (
        <div
          data-testid="snail-help-panel"
          style={{
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12,
            background: "rgba(15,23,42,0.35)",
            padding: "0.85rem 1rem",
          }}
        >
          <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.2rem" }}>
            <li>Upload up to <strong>8 screenshots</strong> (PNG/JPG), each ≤ <strong>10&nbsp;MB</strong>.</li>
            <li>Include the key views: <strong>Home, Lab, Team, Familiar, Gear</strong> (or your guild’s required set).</li>
            <li>Add an optional prompt like <em>“compare rush vs baseline”</em> to drive a targeted summary.</li>
            <li>Results save per-user at <code>data/snail/&lt;guildId&gt;/&lt;userId&gt;/latest.json</code>.</li>
            <li>Codes sync from Snail’s source automatically; no manual copy/paste needed.</li>
          </ul>
          <p style={{ margin: 0, opacity: 0.75 }}>
            Tip: keep screenshots uncropped at 100% zoom for best OCR quality. If parsing fails, re-upload clean captures.
          </p>
        </div>
      )}
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        style={{
          border: "1px dashed rgba(148,163,184,0.4)",
          borderRadius: 12,
          padding: "1.5rem",
          textAlign: "center",
          background: "rgba(15,23,42,0.45)",
        }}
      >
        <p style={{ margin: "0 0 0.5rem" }}>Drag screenshots here or pick files:</p>
        <input type="file" accept="image/*" multiple onChange={onSelect} />
        {files.length > 0 && (
          <ul style={{ marginTop: "0.75rem", textAlign: "left", fontSize: "0.85rem", opacity: 0.85 }}>
            {files.map((file) => (
              <li key={file.name}>
                {file.name}
                <span style={{ opacity: 0.6 }}> ({Math.round(file.size / 1024)} kB)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <textarea
        className="textarea"
        rows={3}
        placeholder="Optional prompt (e.g. “compare rush vs baseline”)"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="btn" onClick={submit} disabled={!files.length}>
          Run analysis
        </button>
        {status && <span style={{ opacity: 0.8 }}>{status}</span>}
        {error && <span style={{ color: "#f87171" }}>{error}</span>}
      </div>

      {results.length > 0 && (
        <div className="grid" style={{ gap: "1rem" }}>
          {results.map((entry, idx) => (
            <AnalysisCard key={`${entry.file?.storedAs || idx}`} result={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnalysisCard({ result }) {
  const stats = result?.analysis?.stats || {};
  const primaryKeys = ["hp", "atk", "def", "rush"];
  const pentagonKeys = ["fame", "tech", "art", "civ", "fth"];

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {result?.file?.url && (
        <img
          src={result.file.url}
          alt={result.file.name}
          style={{ width: "100%", borderRadius: 10, marginBottom: 12, maxHeight: 260, objectFit: "cover" }}
        />
      )}
      <div style={{ fontSize: "0.85rem", opacity: 0.75, marginBottom: 6 }}>
        Uploaded by {result?.uploadedBy?.name || "unknown"}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <StatGroup title="Primary" keys={primaryKeys} stats={stats} />
        <StatGroup title="Pentagon" keys={pentagonKeys} stats={stats} />
        {result?.analysis?.notes && (
          <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            Notes: {result.analysis.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function StatGroup({ title, keys, stats }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.9rem" }}>
        {keys.map((key) => (
          <span key={key}>
            {key.toUpperCase()}: {formatNumber(stats[key])}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ guildId, version }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await apiFetch(`/api/guilds/${guildId}/snail/stats`);
        if (cancelled) return;
        if (data.empty) {
          setRecord(null);
        } else {
          setRecord(data.record || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, version]);

  if (loading) {
    return <div className="card" style={{ padding: "1.25rem" }}>Loading stats…</div>;
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "1.25rem" }}>
        <span style={{ color: "#f87171" }}>{error}</span>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>No saved stats yet</h3>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Run an analysis to generate your personal snail snapshot. It will appear here when complete.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.9rem" }}>
        <span><strong>Last run:</strong> {new Date(record.uploadedAt).toLocaleString()}</span>
        {record.prompt && <span><strong>Prompt:</strong> {record.prompt}</span>}
      </div>
      <div className="grid" style={{ gap: "1rem" }}>
        {(record.results || []).map((entry) => (
          <AnalysisCard key={entry.file?.storedAs} result={entry} />
        ))}
      </div>
    </div>
  );
}

function CodesTab({ guildId }) {
  const [scope, setScope] = useState("active");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState("");
  const codes = useMemo(() => {
    if (!data) return [];
    const candidates = [
      data.codes,
      data.data,
      data.data?.codes,
      data.results,
      data.records,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
    return [];
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const payload = await apiFetch(`/api/guilds/${guildId}/snail/codes?scope=${scope}`);
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load codes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, scope]);

  const copyCode = useCallback((code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      setToast(`Copied ${code}`);
      setTimeout(() => setToast(""), 2000);
    });
  }, []);

  return (
    <div className="card" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {CODE_SCOPES.map((entry) => (
          <button
            key={entry.value}
            className={`btn ${scope === entry.value ? "" : "outline"}`}
            onClick={() => setScope(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {toast && <div style={{ fontSize: "0.85rem", color: "#22c55e" }}>{toast}</div>}
      {error && <div style={{ color: "#f87171" }}>{error}</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
        {codes.map((entry) => (
          <li key={entry.code} className="card" style={{ padding: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{entry.code}</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>{entry.description || entry.desc || ""}</div>
            </div>
            <button className="btn outline" onClick={() => copyCode(entry.code)}>Copy</button>
          </li>
        ))}
      </ul>
      {!codes.length && !error && (
        <div style={{ fontSize: "0.9rem", opacity: 0.75 }}>
          No codes for this scope. {data?.source === "local" ? "Remote codes unavailable." : ""}
        </div>
      )}
    </div>
  );
}

function HelpTab({ guildId }) {
  const [help, setHelp] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/guilds/${guildId}/snail/analyze_help`);
        if (!cancelled) {
          setHelp(Array.isArray(data?.help) ? data.help : []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load help");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return (
    <div className="card" style={{ padding: "1.25rem", display: "grid", gap: "0.75rem" }}>
      <h3 style={{ margin: 0 }}>Snail Analyze Tips</h3>
      {error && <div style={{ color: "#f87171" }}>{error}</div>}
      <ul style={{ margin: 0, paddingLeft: "1.25rem", opacity: 0.85 }}>
        {help.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function CalcTab({ guildId }) {
  const [sim, setSim] = useState("");
  const [total, setTotal] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setError(null);
    try {
      const payload = await apiFetch(`/api/guilds/${guildId}/snail/calc`, {
        method: "POST",
        body: { sim, total },
      });
      setResult(payload);
    } catch (err) {
      setError(err.message || "Calc failed");
    }
  }, [guildId, sim, total]);

  return (
    <div className="card" style={{ display: "grid", gap: "0.75rem", maxWidth: 440 }}>
      <input
        className="input"
        value={sim}
        inputMode="numeric"
        placeholder="SIM power"
        onChange={(event) => setSim(event.target.value)}
      />
      <input
        className="input"
        value={total}
        inputMode="numeric"
        placeholder="Total power"
        onChange={(event) => setTotal(event.target.value)}
      />
      <button className="btn" onClick={run}>
        Calculate
      </button>
      {error && <span style={{ color: "#f87171" }}>{error}</span>}
      {result && (
        <div style={{ opacity: 0.85 }}>
          SIM: {Number(result.sim || 0).toLocaleString()} <br />
          Total: {Number(result.total || 0).toLocaleString()} <br />
          SIM %: {(Number(result.simPct || 0) * 100).toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function GuidesTab() {
  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <h3 style={{ marginTop: 0 }}>Snail Guides</h3>
      <p style={{ margin: 0, opacity: 0.8 }}>
        Our snail nerds are still working on this feature… it will be announced in Slime Chat when ready!
      </p>
    </div>
  );
}

function SpeciesWarTab() {
  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <h3 style={{ marginTop: 0 }}>Species War Planner</h3>
      <p style={{ margin: 0, opacity: 0.8 }}>
        Coming soon. We&apos;re polishing the Slime Chat experience so you can plan wars with shortcuts, canned strategies, and replays.
      </p>
    </div>
  );
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}
