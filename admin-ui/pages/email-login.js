"use client";

import { useEffect } from "react";
import Layout from "../components/Layout";

const EMAIL_LOGIN_URL = "https://id.ionos.com/identifier";

export default function EmailLoginRedirect() {
  useEffect(() => {
    // Open in new tab instead of hijacking current view
    window.open(EMAIL_LOGIN_URL, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <Layout title="Email Login">
      <div className="card" style={{ padding: "1.25rem" }}>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Opening email login in a new tab…
        </p>
        <p style={{ margin: "1rem 0 0", fontSize: "0.875rem", opacity: 0.6 }}>
          If the login window didn't open, <a href={EMAIL_LOGIN_URL} target="_blank" rel="noopener noreferrer">click here</a>.
        </p>
      </div>
    </Layout>
  );
}
