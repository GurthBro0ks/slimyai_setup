"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const SessionContext = createContext({
  user: null,
  csrfToken: null,
  loading: true,
  refresh: async () => {},
  setCsrfToken: () => {},
});

const CSRF_STORAGE_KEY = "slimy_admin_csrf";

function getStoredCsrf() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CSRF_STORAGE_KEY) || null;
}

function storeCsrf(token) {
  if (typeof window === "undefined") return;
  if (token) {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

export function SessionProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    csrfToken: null,
    loading: true,
  });

  const adoptCsrfFromHash = useCallback(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    if (hash && hash.startsWith("#csrf=")) {
      const token = decodeURIComponent(hash.slice(6));
      window.location.hash = "";
      storeCsrf(token);
      return token;
    }
    return getStoredCsrf();
  }, []);

  const refresh = useCallback(async () => {
    const fallbackCsrf = adoptCsrfFromHash();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_ADMIN_API_BASE}/api/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const csrfToken = data.csrfToken || fallbackCsrf || null;
      if (csrfToken) storeCsrf(csrfToken);

      setState({
        user: data,
        csrfToken,
        loading: false,
      });
    } catch (err) {
      setState({
        user: null,
        csrfToken: fallbackCsrf || null,
        loading: false,
      });
    }
  }, [adoptCsrfFromHash]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCsrfToken = useCallback((token) => {
    storeCsrf(token);
    setState((prev) => ({ ...prev, csrfToken: token }));
  }, []);

  const value = useMemo(
    () => ({
      user: state.user,
      csrfToken: state.csrfToken,
      loading: state.loading,
      refresh,
      setCsrfToken,
    }),
    [state, refresh, setCsrfToken],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
