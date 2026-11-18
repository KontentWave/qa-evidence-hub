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

  it('renders a single <h1> inside a <main> landmark and explicit Ready text when API is ready', async () => {
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

    const statusRegion = screen.getByRole('status');
    expect(statusRegion.textContent).toContain('System status: Ready');
    expect(statusRegion.textContent).toContain('API and PostgreSQL readiness check succeeded.');
  });

  it('renders graceful degraded text when API returns 503 not_ready without exposing internal hosts', async () => {
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

    const sourceFiles = [
      path.join(webRoot, 'src/lib/api.ts'),
      path.join(webRoot, 'app/layout.tsx'),
      path.join(webRoot, 'app/page.tsx'),
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
    } finally {
      if (originalEnv === undefined) {
        delete process.env.INTERNAL_API_BASE_URL;
      } else {
        process.env.INTERNAL_API_BASE_URL = originalEnv;
      }
    }
  });
});
