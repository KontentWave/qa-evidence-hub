import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { validateApiEnv } from '../src/config/env.validation';

describe('API PostgreSQL readiness and baseline migration integration', () => {
  let app: NestExpressApplication;
  let databaseUrl: string;

  beforeAll(async () => {
    const env = validateApiEnv({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_POOL_MAX: '5',
      POSTGRES_MAX_CONNECTIONS: '30',
      DATABASE_STATEMENT_TIMEOUT_MS: '5000',
      TRUST_PROXY: '127.0.0.1/32,::1/128',
      APP_ORIGIN: 'http://127.0.0.1:8080',
    });
    databaseUrl = env.databaseUrl;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(env)],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, env, { mountSwaggerUi: false });
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('applies baseline, P1-03 auth, and P1-04 engagement-context migrations cleanly with no out-of-slice domain tables', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      const migrations = await client.query<{
        migration_name: string;
        finished_at: Date | null;
      }>('SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name;');

      expect(migrations.rows.map((r) => r.migration_name)).toEqual([
        '20261118000000_baseline',
        '20261121000000_owner_and_auth_sessions',
        '20261123000000_engagement_context',
      ]);
      for (const row of migrations.rows) {
        expect(row.finished_at).not.toBeNull();
      }

      const publicTables = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name;`,
      );

      expect(publicTables.rows.map((r) => r.table_name)).toEqual([
        '_prisma_migrations',
        'auth_sessions',
        'clients',
        'owners',
        'projects',
        'test_sessions',
      ]);
    } finally {
      await client.end();
    }
  });

  it('returns 200 { status: "ready" } against real PostgreSQL via PrismaService', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects undeclared query fields with 400 JSON and unknown routes with 404 JSON', async () => {
    const badQueryRes = await request(app.getHttpServer()).get(
      '/api/v1/health/ready?unexpectedField=1',
    );
    expect(badQueryRes.status).toBe(400);
    expect(badQueryRes.body.code).toBe('BAD_REQUEST');

    const notFoundRes = await request(app.getHttpServer()).get('/api/v1/nonexistent');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Requested resource was not found.',
    });
  });
});
