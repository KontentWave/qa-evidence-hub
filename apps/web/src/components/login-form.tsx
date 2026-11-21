'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

interface FieldIssueLink {
  readonly fieldId: 'login-identifier' | 'login-password';
  readonly message: string;
}

interface LoginErrorState {
  readonly summary: string;
  readonly fieldIssues: readonly FieldIssueLink[];
}

export interface LoginFormProps {
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

export function LoginForm({ fetchImpl, onNavigate }: LoginFormProps) {
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<LoginErrorState | null>(null);
  const [errorKey, setErrorKey] = useState(0);

  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const csrfTokenRef = useRef<string | null>(null);
  const csrfInflightRef = useRef<Promise<string> | null>(null);

  const requestFetch: typeof globalThis.fetch = (input, init) => {
    const fn = fetchImpl ?? globalThis.fetch;
    return fn(input, init);
  };

  const ensureCsrfToken = async (): Promise<string> => {
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
            throw new Error('Unable to initialize browser anti-CSRF protection.');
          }
          const payload = (await res.json()) as { csrfToken?: unknown };
          if (typeof payload.csrfToken !== 'string' || payload.csrfToken.length === 0) {
            throw new Error('Invalid anti-CSRF response.');
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
    void ensureCsrfToken().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (errorState && errorSummaryRef.current) {
      errorSummaryRef.current.focus();
    }
  }, [errorState, errorKey]);

  const reportError = (next: LoginErrorState): void => {
    setErrorState(next);
    setErrorKey((prev) => prev + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedIdentifier = loginIdentifier.trim();
    const fieldIssues: FieldIssueLink[] = [];
    if (trimmedIdentifier.length === 0) {
      fieldIssues.push({
        fieldId: 'login-identifier',
        message: 'Enter your login identifier.',
      });
    } else if (trimmedIdentifier.length > 200) {
      fieldIssues.push({
        fieldId: 'login-identifier',
        message: 'Login identifier must be 200 characters or fewer.',
      });
    }

    if (password.length === 0) {
      fieldIssues.push({
        fieldId: 'login-password',
        message: 'Enter your password.',
      });
    }

    if (fieldIssues.length > 0) {
      reportError({
        summary: 'Correct the highlighted sign-in fields before continuing.',
        fieldIssues,
      });
      return;
    }

    setSubmitting(true);
    try {
      const csrfToken = await ensureCsrfToken();
      const response = await requestFetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          loginIdentifier: trimmedIdentifier,
          password,
        }),
      });

      if (response.ok) {
        setErrorState(null);
        navigateBrowser('/', onNavigate);
        return;
      }

      if (response.status === 401) {
        setPassword('');
        reportError({
          summary: 'Invalid login identifier or password.',
          fieldIssues: [],
        });
        return;
      }

      if (response.status === 429) {
        setPassword('');
        reportError({
          summary: 'Too many sign-in attempts. Wait before trying again.',
          fieldIssues: [],
        });
        return;
      }

      if (response.status === 403) {
        csrfTokenRef.current = null;
        setPassword('');
        reportError({
          summary:
            'Browser security token expired or origin check failed. Submit again to refresh.',
          fieldIssues: [],
        });
        return;
      }

      reportError({
        summary: 'Check your sign-in details and try again.',
        fieldIssues: [],
      });
    } catch {
      reportError({
        summary: 'Unable to reach the authentication service. Check connectivity and try again.',
        fieldIssues: [],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const identifierInvalid =
    errorState?.fieldIssues.some((issue) => issue.fieldId === 'login-identifier') ?? false;
  const passwordInvalid =
    errorState?.fieldIssues.some((issue) => issue.fieldId === 'login-password') ?? false;

  return (
    <form className="auth-form" noValidate onSubmit={(e) => void handleSubmit(e)}>
      {errorState ? (
        <div
          aria-labelledby="login-error-heading"
          className="error-summary"
          id="login-error-summary"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="error-summary__heading" id="login-error-heading">
            Sign-in failed: {errorState.summary}
          </p>
          {errorState.fieldIssues.length > 0 ? (
            <ul className="error-summary__list">
              {errorState.fieldIssues.map((issue) => (
                <li key={issue.fieldId}>
                  <a href={`#${issue.fieldId}`}>{issue.message}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="form-field">
        <label className="form-label" htmlFor="login-identifier">
          Login identifier
        </label>
        <input
          aria-describedby={errorState ? 'login-error-summary' : undefined}
          aria-invalid={identifierInvalid ? 'true' : undefined}
          autoComplete="username"
          className="form-input"
          id="login-identifier"
          maxLength={200}
          name="loginIdentifier"
          onChange={(e) => setLoginIdentifier(e.target.value)}
          required
          type="text"
          value={loginIdentifier}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="login-password">
          Password
        </label>
        <input
          aria-describedby={errorState ? 'login-error-summary' : undefined}
          aria-invalid={passwordInvalid ? 'true' : undefined}
          autoComplete="current-password"
          className="form-input"
          id="login-password"
          maxLength={256}
          name="password"
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      <div className="form-actions">
        <button className="btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
