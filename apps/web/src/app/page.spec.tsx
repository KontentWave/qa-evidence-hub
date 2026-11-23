import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../../app/page';
import * as apiModule from '../lib/api';

describe('HomePage (apps/web/app/page.tsx)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('redirects anonymous visitors on / to /login before rendering any readiness or workspace content', async () => {
    vi.spyOn(apiModule, 'requireAuthenticatedOwner').mockImplementation(async () => {
      throw new Error('NEXT_REDIRECT:/login');
    });
    const readinessSpy = vi.spyOn(apiModule, 'fetchPlatformReadiness');

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(readinessSpy).not.toHaveBeenCalled();
  });

  it('renders a single <h1> inside a <main> landmark, owner identity, sign-out control, and Ready text when signed in', async () => {
    vi.spyOn(apiModule, 'requireAuthenticatedOwner').mockResolvedValue({
      id: '11111111-2222-4333-8444-555555555555',
      loginIdentifier: 'owner@synthetic.invalid',
      timezone: 'Europe/Bratislava',
    });
    vi.spyOn(apiModule, 'fetchPlatformReadiness').mockResolvedValue({
      state: 'ready',
      label: 'Ready',
      detail: 'API and PostgreSQL readiness check succeeded.',
    });

    const ui = await HomePage();
    render(ui);

    const main = screen.getByRole('main');
    expect(main).toBeTruthy();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toContain('QA Evidence Hub');

    expect(screen.getByText(/owner@synthetic\.invalid/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeTruthy();

    const statusRegion = screen.getByRole('status');
    expect(statusRegion.textContent).toContain('System status: Ready');
    expect(statusRegion.textContent).toContain('API and PostgreSQL readiness check succeeded.');
  });

  it('renders graceful degraded text when API returns 503 not_ready without exposing internal hosts', async () => {
    vi.spyOn(apiModule, 'requireAuthenticatedOwner').mockResolvedValue({
      id: '11111111-2222-4333-8444-555555555555',
      loginIdentifier: 'owner@synthetic.invalid',
      timezone: 'Europe/Bratislava',
    });
    vi.spyOn(apiModule, 'fetchPlatformReadiness').mockResolvedValue({
      state: 'not_ready',
      label: 'Not ready (degraded)',
      detail: 'Backend readiness check reported unavailable; database or API is not ready.',
    });

    const ui = await HomePage();
    render(ui);

    const statusRegion = screen.getByRole('status');
    expect(statusRegion.textContent).toContain('System status: Not ready (degraded)');
    expect(statusRegion.textContent).not.toContain('postgres:');
    expect(statusRegion.textContent).not.toContain('http://api:3001');
  });

  it('keeps apps/web free of database/storage dependencies and NEXT_PUBLIC_/DATABASE_URL references', async () => {
    const webRoot = path.resolve(import.meta.dirname, '../..');
    const pkgJsonRaw = await fs.readFile(path.join(webRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgJsonRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    });

    for (const forbidden of ['@prisma/client', '@prisma/adapter-pg', 'prisma', 'pg', 'sharp']) {
      expect(allDeps).not.toContain(forbidden);
    }
    expect(allDeps.some((dep) => dep.startsWith('@aws-sdk/'))).toBe(false);

    async function collectTsFiles(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await collectTsFiles(full)));
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
          !entry.name.endsWith('.spec.ts') &&
          !entry.name.endsWith('.spec.tsx')
        ) {
          files.push(full);
        }
      }
      return files;
    }

    const sourceFiles = [
      ...(await collectTsFiles(path.join(webRoot, 'src'))),
      ...(await collectTsFiles(path.join(webRoot, 'app'))),
    ];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).not.toContain('DATABASE_URL');
      expect(content).not.toContain('NEXT_PUBLIC_');
    }
  });

  it('fetchPlatformReadiness uses cache: no-store and handles 200 ready, 503 not_ready, and network errors', async () => {
    const originalEnv = process.env.INTERNAL_API_BASE_URL;
    process.env.INTERNAL_API_BASE_URL = 'http://api.internal:3001';

    try {
      let observedCache: RequestCache | undefined;
      const okFetch: typeof globalThis.fetch = async (_input, init) => {
        observedCache = init?.cache;
        return new Response(JSON.stringify({ status: 'ready' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const readyResult = await apiModule.fetchPlatformReadiness(okFetch);
      expect(observedCache).toBe('no-store');
      expect(readyResult.state).toBe('ready');

      const unavailableFetch: typeof globalThis.fetch = async () =>
        new Response(JSON.stringify({ status: 'not_ready' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });

      const degradedResult = await apiModule.fetchPlatformReadiness(unavailableFetch);
      expect(degradedResult.state).toBe('not_ready');

      const brokenFetch: typeof globalThis.fetch = async () => {
        throw new Error('ECONNREFUSED http://api.internal:3001');
      };

      const errorResult = await apiModule.fetchPlatformReadiness(brokenFetch);
      expect(errorResult.state).toBe('not_ready');
      expect(errorResult.detail).not.toContain('api.internal');

      // Verify fetchCurrentOwnerSession forwards ONLY qaeh_session cookie with cache: no-store
      let forwardedHeaders: HeadersInit | undefined;
      let forwardedCache: RequestCache | undefined;
      const sessionFetch: typeof globalThis.fetch = async (input, init) => {
        const req = input instanceof Request ? input : undefined;
        forwardedCache = init?.cache ?? req?.cache;
        forwardedHeaders = init?.headers ?? (req ? Object.fromEntries(req.headers.entries()) : undefined);
        return new Response(
          JSON.stringify({
            authenticated: true,
            owner: {
              id: '11111111-2222-4333-8444-555555555555',
              loginIdentifier: 'owner@synthetic.invalid',
              timezone: 'Europe/Bratislava',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      };

      const validToken = 'a'.repeat(43);
      const owner = await apiModule.fetchCurrentOwnerSession(validToken, sessionFetch);
      expect(owner?.loginIdentifier).toBe('owner@synthetic.invalid');
      expect(forwardedCache).toBe('no-store');
      const hdrMap = new Headers(forwardedHeaders);
      expect(hdrMap.get('cookie')).toBe(`qaeh_session=${validToken}`);
      expect(hdrMap.get('x-forwarded-for')).toBeNull();
      expect(hdrMap.get('x-forwarded-proto')).toBeNull();

      // Malformed/short token is rejected without calling upstream fetch.
      let calledOnMalformed = false;
      const malformedOwner = await apiModule.fetchCurrentOwnerSession('bad;cookie=inject', async () => {
        calledOnMalformed = true;
        return new Response(null, { status: 401 });
      });
      expect(malformedOwner).toBeNull();
      expect(calledOnMalformed).toBe(false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.INTERNAL_API_BASE_URL;
      } else {
        process.env.INTERNAL_API_BASE_URL = originalEnv;
      }
    }
  });
});
