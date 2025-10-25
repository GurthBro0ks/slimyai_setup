"use client";

import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import CorrectionsManager from "../../../components/CorrectionsManager";

function normalizeGuildId(raw) {
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function GuildCorrectionsPage() {
  const router = useRouter();
  const guildId = normalizeGuildId(router.query.guildId);

  return (
    <Layout guildId={guildId} title="Member Corrections">
      <p style={{ marginBottom: 18, opacity: 0.75 }}>
        Corrections now live in the dashboard&apos;s <strong>Current Sheet</strong> tab. You can continue to manage them here as well.
      </p>
      <CorrectionsManager guildId={guildId} />
    </Layout>
  );
}
