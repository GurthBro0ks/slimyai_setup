"use client";

import { useCallback } from "react";
import { useSession } from "./session";

const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE || "http://localhost:3080";

export async function apiFetch(path, { method = "GET", body, csrfToken } = {}) {
  const headers = new Headers();
  if (body && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (csrfToken && method && method !== "GET") {
    headers.set("x-csrf-token", csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
    credentials: "include",
    headers,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function useApi() {
  const { csrfToken } = useSession();

  return useCallback(
    (path, options = {}) => apiFetch(path, { ...options, csrfToken }),
    [csrfToken],
  );
}
