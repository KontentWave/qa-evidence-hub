'use client';

import { useEffect, useRef, useState } from 'react';

export interface LogoutButtonProps {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly onNavigate?: (targetPath: string) => void;
}

function navigateBrowser(targetPath: string, customNavigate?: (path: string) => void): void {
  if (customNavigate) {
    customNavigate(targetPath);
    return;
  }
  window.location.assign(targetPath);
}

export function LogoutButton({ fetchImpl, onNavigate }: LogoutButtonProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const csrfTokenRef = useRef<string | null>(null);
  const csrfInflightRef = useRef<Promise<string> | null>(null);

  const requestFetch: typeof globalThis.fetch = (input, init) => {
    const fn = fetchImpl ?? globalThis.fetch;
    return fn(input, init);
  };

  const ensureAuthenticatedCsrf = async (): Promise<string> => {
    if (csrfTokenRef.current) {
      return csrfTokenRef.current;
    }
    if (!csrfInflightRef.current) {
      csrfInflightRef.current = (async () => {
        try {
          const res = await requestFetch('/api/v1/auth/csrf', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              accept: 'application/json',
            },
          });
          if (!res.ok) {
            throw new Error('Failed to load session anti-CSRF token.');
          }
          const payload = (await res.json()) as { csrfToken?: unknown };
          if (typeof payload.csrfToken !== 'string' || payload.csrfToken.length === 0) {
            throw new Error('Malformed anti-CSRF response.');
          }
          csrfTokenRef.current = payload.csrfToken;
          return payload.csrfToken;
        } finally {
          csrfInflightRef.current = null;
        }
      })();
    }
    return csrfInflightRef.current;
  };

  useEffect(() => {
    void ensureAuthenticatedCsrf().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (errorMessage && alertRef.current) {
      alertRef.current.focus();
    }
  }, [errorMessage]);

  const handleLogout = async (): Promise<void> => {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setErrorMessage(null);
    try {
      const csrfToken = await ensureAuthenticatedCsrf();
      const res = await requestFetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({}),
      });

      if (res.ok || res.status === 401) {
        navigateBrowser('/login', onNavigate);
        return;
      }

      csrfTokenRef.current = null;
      setErrorMessage('Unable to complete sign-out. Try again.');
    } catch {
      csrfTokenRef.current = null;
      setErrorMessage('Unable to reach authentication service to sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="logout-controls no-print">
      <button
        className="btn-secondary"
        disabled={signingOut}
        onClick={() => void handleLogout()}
        type="button"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {errorMessage ? (
        <p className="inline-error" ref={alertRef} role="alert" tabIndex={-1}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
