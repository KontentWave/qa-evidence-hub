import 'server-only';
import {
  type ClientSummary,
  createApiClient,
  type ListProjectSessionsQuery,
  type OwnerSummary,
  type ProjectSummary,
  type QaEvidenceHubApiClient,
  type TestSessionListResponse,
  type TestSessionSummary,
} from '@qa-evidence-hub/api-client';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export type {
  ClientSummary,
  ListProjectSessionsQuery,
  OwnerSummary,
  ProjectSummary,
  TestSessionListResponse,
  TestSessionSummary,
};

export type SsrReadResult<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'error' };

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

const SAFE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function triggerNotFound(): never {
  notFound();
}

function createAuthenticatedSsrClient(
  rawSessionCookie: string | undefined,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): QaEvidenceHubApiClient | null {
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

  return createApiClient({
    baseUrl,
    fetch: noStoreSessionFetch,
  });
}

function classifyReadResponse<T>(status: number, data: T | undefined): SsrReadResult<T> {
  if (status === 200 && data !== undefined) {
    return { kind: 'ok', data };
  }
  if (status === 401) {
    return { kind: 'unauthorized' };
  }
  if (status === 400 || status === 404) {
    return { kind: 'not_found' };
  }
  return { kind: 'error' };
}

export async function fetchCurrentOwnerSession(
  rawSessionCookie: string | undefined,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<OwnerSummary | null> {
  const client = createAuthenticatedSsrClient(rawSessionCookie, customFetch);
  if (!client) {
    return null;
  }

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

export async function getRawSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function getOptionalAuthenticatedOwner(): Promise<OwnerSummary | null> {
  const rawToken = await getRawSessionCookie();
  return fetchCurrentOwnerSession(rawToken);
}

export async function requireAuthenticatedOwner(): Promise<OwnerSummary> {
  const owner = await getOptionalAuthenticatedOwner();
  if (!owner) {
    redirectToPath('/login');
  }
  return owner;
}

export async function fetchClientsForOwner(
  rawSessionCookie?: string,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<SsrReadResult<readonly ClientSummary[]>> {
  const token = rawSessionCookie ?? (await getRawSessionCookie());
  const client = createAuthenticatedSsrClient(token, customFetch);
  if (!client) {
    return { kind: 'unauthorized' };
  }
  try {
    const { data, response } = await client.GET('/api/v1/clients');
    return classifyReadResponse(response.status, data?.items);
  } catch {
    return { kind: 'error' };
  }
}

export async function fetchClientDetailForOwner(
  clientId: string,
  rawSessionCookie?: string,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<SsrReadResult<ClientSummary>> {
  if (!SAFE_UUID_REGEX.test(clientId)) {
    return { kind: 'not_found' };
  }
  const token = rawSessionCookie ?? (await getRawSessionCookie());
  const client = createAuthenticatedSsrClient(token, customFetch);
  if (!client) {
    return { kind: 'unauthorized' };
  }
  try {
    const { data, response } = await client.GET('/api/v1/clients/{clientId}', {
      params: { path: { clientId } },
    });
    return classifyReadResponse(response.status, data);
  } catch {
    return { kind: 'error' };
  }
}

export async function fetchClientProjectsForOwner(
  clientId: string,
  rawSessionCookie?: string,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<SsrReadResult<readonly ProjectSummary[]>> {
  if (!SAFE_UUID_REGEX.test(clientId)) {
    return { kind: 'not_found' };
  }
  const token = rawSessionCookie ?? (await getRawSessionCookie());
  const client = createAuthenticatedSsrClient(token, customFetch);
  if (!client) {
    return { kind: 'unauthorized' };
  }
  try {
    const { data, response } = await client.GET('/api/v1/clients/{clientId}/projects', {
      params: { path: { clientId } },
    });
    return classifyReadResponse(response.status, data?.items);
  } catch {
    return { kind: 'error' };
  }
}

export async function fetchClientProjectDetailForOwner(
  clientId: string,
  projectId: string,
  rawSessionCookie?: string,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<SsrReadResult<ProjectSummary>> {
  if (!SAFE_UUID_REGEX.test(clientId) || !SAFE_UUID_REGEX.test(projectId)) {
    return { kind: 'not_found' };
  }
  const token = rawSessionCookie ?? (await getRawSessionCookie());
  const client = createAuthenticatedSsrClient(token, customFetch);
  if (!client) {
    return { kind: 'unauthorized' };
  }
  try {
    const { data, response } = await client.GET(
      '/api/v1/clients/{clientId}/projects/{projectId}',
      {
        params: { path: { clientId, projectId } },
      },
    );
    return classifyReadResponse(response.status, data);
  } catch {
    return { kind: 'error' };
  }
}

const SAFE_SESSION_CURSOR_REGEX = /^[A-Za-z0-9_-]{1,256}$/;

export async function fetchProjectSessionsForOwner(
  projectId: string,
  rawSessionCookie?: string,
  query?: ListProjectSessionsQuery,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<SsrReadResult<TestSessionListResponse>> {
  if (!SAFE_UUID_REGEX.test(projectId)) {
    return { kind: 'not_found' };
  }
  if (query?.cursor !== undefined && !SAFE_SESSION_CURSOR_REGEX.test(query.cursor)) {
    return { kind: 'not_found' };
  }
  const token = rawSessionCookie ?? (await getRawSessionCookie());
  const client = createAuthenticatedSsrClient(token, customFetch);
  if (!client) {
    return { kind: 'unauthorized' };
  }
  const normalizedQuery: ListProjectSessionsQuery = {
    ...(query?.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query?.limit !== undefined ? { limit: query.limit } : {}),
  };
  try {
    const { data, response } = await client.GET('/api/v1/projects/{projectId}/sessions', {
      params: {
        path: { projectId },
        ...(Object.keys(normalizedQuery).length > 0 ? { query: normalizedQuery } : {}),
      },
    });
    return classifyReadResponse(response.status, data);
  } catch {
    return { kind: 'error' };
  }
}

export async function fetchProjectSessionDetailForOwner(
  projectId: string,
  sessionId: string,
  rawSessionCookie?: string,
  customFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<SsrReadResult<TestSessionSummary>> {
  if (!SAFE_UUID_REGEX.test(projectId) || !SAFE_UUID_REGEX.test(sessionId)) {
    return { kind: 'not_found' };
  }
  const token = rawSessionCookie ?? (await getRawSessionCookie());
  const client = createAuthenticatedSsrClient(token, customFetch);
  if (!client) {
    return { kind: 'unauthorized' };
  }
  try {
    const { data, response } = await client.GET(
      '/api/v1/projects/{projectId}/sessions/{sessionId}',
      {
        params: { path: { projectId, sessionId } },
      },
    );
    return classifyReadResponse(response.status, data);
  } catch {
    return { kind: 'error' };
  }
}

export function unwrapSsrDataOrRedirect<T>(result: SsrReadResult<T>): T | null {
  if (result.kind === 'unauthorized') {
    redirectToPath('/login');
  }
  if (result.kind === 'not_found') {
    triggerNotFound();
  }
  if (result.kind === 'error') {
    return null;
  }
  return result.data;
}
