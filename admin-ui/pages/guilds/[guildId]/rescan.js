"use client";

import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import RescanUploader from "../../../components/RescanUploader";

function normalizeGuildId(raw) {
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function GuildRescanPage() {
  const router = useRouter();
  const guildId = normalizeGuildId(router.query.guildId);

  return (
    <Layout guildId={guildId} title="Rescan Member Screenshot">
      <p style={{ marginBottom: 18, opacity: 0.75 }}>
        Rescan tools now live under the dashboard&apos;s <strong>Current Sheet</strong> tab. You can continue to run rescan jobs below if needed.
      </p>
      <RescanUploader guildId={guildId} />
    </Layout>
  );
}
