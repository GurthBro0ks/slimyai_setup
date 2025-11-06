"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

import Layout from "../../../components/Layout";
import { apiFetch } from "../../../lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const fetcher = (path) => apiFetch(path);
const WINDOWS = [
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "This Month", value: "this_month" },
];

export default function GuildUsagePage() {
  const router = useRouter();
  const { guildId } = router.query;
  const [windowValue, setWindowValue] = useState("7d");

  const { data } = useSWR(
    guildId ? `/api/guilds/${guildId}/usage?window=${windowValue}` : null,
    fetcher,
  );

  const chartData = data
    ? {
        labels: data.aggregated.byModel.map((entry) => entry.model),
        datasets: [
          {
            label: "Cost (USD)",
            data: data.aggregated.byModel.map((entry) => Number(entry.cost || 0)),
            backgroundColor: "rgba(56, 189, 248, 0.4)",
          },
        ],
      }
    : null;

  return (
    <Layout guildId={guildId} title="Usage & Spend">
      <div className="card" style={{ marginBottom: 24, display: "flex", gap: 12 }}>
        {WINDOWS.map((option) => (
          <button
            key={option.value}
            className={`btn ${windowValue === option.value ? "" : "outline"}`}
            onClick={() => setWindowValue(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p>Loading usage…</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <h4 style={{ marginTop: 0 }}>Cost by Model</h4>
            {chartData && <Bar data={chartData} />}
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Requests</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Images</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.aggregated.byModel.map((entry) => (
                  <tr key={entry.model}>
                    <td>{entry.model}</td>
                    <td>{entry.requests || 0}</td>
                    <td>{entry.inputTokens || 0}</td>
                    <td>{entry.outputTokens || 0}</td>
                    <td>{entry.images || 0}</td>
                    <td>${Number(entry.cost || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}
