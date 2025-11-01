"use client";

import { useEffect, useState } from "react";
import Head from "next/head";

const ROLE_LABELS = {
  admin: "Admin Panel",
  club: "Club Panel",
  member: "Member Panel",
};

function getLabel(role) {
  if (!role || role === "guest" || role === "loading") {
    return "Panel of Power";
  }
  return ROLE_LABELS[role] || "Member Panel";
}

export default function PanelBrand({ prefix = "slimy.ai", showPrefix = true, renderText = true }) {
  const [role, setRole] = useState("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/debug", { credentials: "include" });
        if (!active) return;
        if (!res.ok) {
          setRole("guest");
          return;
        }
        const payload = await res.json().catch(() => null);
        setRole((payload?.user?.role && String(payload.user.role)) || "guest");
      } catch (err) {
        if (active) setRole("guest");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const label = getLabel(role);
  const headTitle = `${prefix} - ${label}`;
  const display = showPrefix ? headTitle : label;

  return (
    <>
      <Head>
        <title>{headTitle}</title>
      </Head>
      {renderText && <span>{display}</span>}
    </>
  );
}
