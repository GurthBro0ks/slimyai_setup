import { useEffect } from 'react';

export default function LoginRedirect() {
  useEffect(() => {
    // Open in new tab instead of hijacking current view
    window.open('/api/auth/login', '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <p>Opening Discord login in a new tab…</p>
      <p style={{ fontSize: '0.875rem', opacity: 0.6, marginTop: '1rem' }}>
        If the login window didn't open, <a href="/api/auth/login" target="_blank" rel="noopener noreferrer">click here</a>.
      </p>
    </main>
  );
}
