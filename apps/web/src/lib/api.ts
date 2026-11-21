import 'server-only';
import { createApiClient, type OwnerSummary } from '@qa-evidence-hub/api-client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type { OwnerSummary };

export interface PlatformReadinessView {
  readonly state: 'ready' | 'not_ready';
  readonly label: 'Ready' | 'Not ready (degraded)';
  readonly detail: string;
}

export const SESSION_COOKIE_NAME = 'qaeh_session';
const SAFE_SESSION_TOKEN_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
const DEFAULT_DEV_INTERNAL_API_BASE_URL = 'http://127.0.0.1:3001';
const SSR_API_TIMEOUT_MS = 4000;

export function redirectToPath(targetPath: string): never {
  redirect(targetPath);
}

export function resolveInternalApiBaseUrl(
  rawEnv: Record<string, string | undefined> = process.env,
): string {
  const configured = rawEnv.INTERNAL_API_BASE_URL?.trim();
  const nodeEnv = rawEnv.NODE_ENV?.trim() || 'development';

  if (!configured) {
    if (nodeEnv === 'production') {
      throw new Error('INTERNAL_API_BASE_URL must be configured in production.');
    }
    return DEFAULT_DEV_INTERNAL_API_BASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('INTERNAL_API_BASE_URL must be a valid HTTP or HTTPS origin.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INTERNAL_API_BASE_URL must use http:// or https://.');
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('INTERNAL_API_BASE_URL must be a bare origin without credentials, query, or hash.');
  }

  return parsed.origin;
}

export async function fetchPlatformReadiness(
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<PlatformReadinessView> {
  let baseUrl: string;
  try {
    baseUrl = resolveInternalApiBaseUrl(process.env);
  } catch {
    return {
      state: 'not_ready',
      label: 'Not ready (degraded)',
      detail: 'Internal API connection setting is invalid or missing.',
    };
  }

  const noStoreFetch: typeof globalThis.fetch = (input, init) =>
    customFetch(input, {
      ...init,
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(SSR_API_TIMEOUT_MS),
    });

  const client = createApiClient({
    baseUrl,
    fetch: noStoreFetch,
    headers: {
      accept: 'application/json',
    },
  });

  try {
    const { data, response } = await client.GET('/api/v1/health/ready');
    if (response.ok && data?.status === 'ready') {
      return {
        state: 'ready',
        label: 'Ready',
        detail: 'API and PostgreSQL readiness check succeeded.',
      };
    }

    return {
      state: 'not_ready',
      label: 'Not ready (degraded)',
      detail: 'Backend readiness check reported unavailable; database or API is not ready.',
    };
  } catch {
    return {
      state: 'not_ready',
      label: 'Not ready (degraded)',
      detail: 'Unable to reach internal API readiness endpoint.',
    };
  }
}

export async function fetchCurrentOwnerSession(
  rawSessionCookie: string | undefined,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<OwnerSummary | null> {
  if (!rawSessionCookie || !SAFE_SESSION_TOKEN_REGEX.test(rawSessionCookie)) {
    return null;
  }

  let baseUrl: string;
  try {
    baseUrl = resolveInternalApiBaseUrl(process.env);
  } catch {
    return null;
  }

  const cookiePair = `${SESSION_COOKIE_NAME}=${rawSessionCookie}`;
  const noStoreSessionFetch: typeof globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('accept', 'application/json');
    headers.set('cookie', cookiePair);
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-proto');
    headers.delete('x-forwarded-host');

    return customFetch(input, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(SSR_API_TIMEOUT_MS),
    });
  };

  const client = createApiClient({
    baseUrl,
    fetch: noStoreSessionFetch,
  });

  try {
    const { data, response } = await client.GET('/api/v1/auth/session');
    if (response.status === 200 && data?.authenticated === true && data.owner) {
      return data.owner;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getOptionalAuthenticatedOwner(): Promise<OwnerSummary | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return fetchCurrentOwnerSession(rawToken);
}

export async function requireAuthenticatedOwner(): Promise<OwnerSummary> {
  const owner = await getOptionalAuthenticatedOwner();
  if (!owner) {
    redirectToPath('/login');
  }
  return owner;
}
