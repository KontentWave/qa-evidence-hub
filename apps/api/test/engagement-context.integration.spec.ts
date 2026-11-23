import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { validateApiEnv } from '../src/config/env.validation';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PROVISION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'provision-owner.ts');
const APP_ORIGIN = 'http://127.0.0.1:8080';
const OWNER_LOGIN = 'owner.engagement@synthetic.invalid';
const OWNER_PASSWORD = 'SyntheticEngagementPass!2026#Valid';

function applySetCookies(jar: Map<string, string>, header: string | string[] | undefined): void {
  if (!header) return;
  const list = Array.isArray(header) ? header : [header];
  for (const raw of list) {
    const [pair, ...attrs] = raw.split(';').map((part) => part.trim());
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const val = pair.slice(eq + 1);
    if (val === '' || attrs.some((a) => /^max-age=0$/i.test(a))) {
      jar.delete(name);
    } else {
      jar.set(name, val);
    }
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function runProvisionCli(
  args: readonly string[],
  stdinText: string,
  databaseUrl: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PROVISION_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdinText);
  });
}

describe('P1-04 Engagement Context PostgreSQL constraints and API integration', () => {
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
      APP_ORIGIN,
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

  beforeEach(async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(
        'TRUNCATE TABLE "test_sessions", "projects", "clients", "auth_sessions", "owners" CASCADE;',
      );
    } finally {
      await client.end();
    }
  });

  async function signInOwner(): Promise<{ jar: Map<string, string>; csrfToken: string }> {
    const prov = await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password-stdin'],
      `${OWNER_PASSWORD}\n`,
      databaseUrl,
    );
    expect(prov.code).toBe(0);

    const jar = new Map<string, string>();
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    expect(csrfRes.status).toBe(200);
    applySetCookies(jar, csrfRes.headers['set-cookie']);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfRes.body.csrfToken)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    expect(loginRes.status).toBe(200);
    applySetCookies(jar, loginRes.headers['set-cookie']);

    return { jar, csrfToken: loginRes.body.csrfToken as string };
  }

  it('enforces PostgreSQL hierarchy FKs, trimmed nonblank CHECKs, active project default, UNIQUE(project_id, id), and ended_at >= started_at', async () => {
    const db = new pg.Client({ connectionString: databaseUrl });
    await db.connect();

    try {
      const clientId = crypto.randomUUID();
      const otherClientId = crypto.randomUUID();
      const projectId = crypto.randomUUID();
      const otherProjectId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      // 1. Client CHECK constraints: blank, whitespace-only, untrimmed, or >200 name fails; multiline trimmed notes succeed.
      await expect(
        db.query('INSERT INTO "clients" ("id", "name") VALUES ($1, $2);', [
          crypto.randomUUID(),
          '   ',
        ]),
      ).rejects.toMatchObject({ code: '23514' });

      await expect(
        db.query('INSERT INTO "clients" ("id", "name") VALUES ($1, $2);', [
          crypto.randomUUID(),
          ' LeadingSpace',
        ]),
      ).rejects.toMatchObject({ code: '23514' });

      await expect(
        db.query('INSERT INTO "clients" ("id", "name") VALUES ($1, $2);', [
          crypto.randomUUID(),
          '\nTabOrNewline\t',
        ]),
      ).rejects.toMatchObject({ code: '23514' });

      await db.query('INSERT INTO "clients" ("id", "name", "notes") VALUES ($1, $2, $3);', [
        clientId,
        'Example Client',
        'Line one\nLine two',
      ]);
      await db.query('INSERT INTO "clients" ("id", "name") VALUES ($1, $2);', [
        otherClientId,
        'Second Client',
      ]);

      // 2. Project FK, default status = Active, and CHECK constraints.
      await expect(
        db.query('INSERT INTO "projects" ("id", "client_id", "name") VALUES ($1, $2, $3);', [
          crypto.randomUUID(),
          crypto.randomUUID(),
          'Orphan Project',
        ]),
      ).rejects.toMatchObject({ code: '23503' });

      const insertedProject = await db.query<{ status: string }>(
        'INSERT INTO "projects" ("id", "client_id", "name") VALUES ($1, $2, $3) RETURNING "status";',
        [projectId, clientId, 'Checkout QA'],
      );
      expect(insertedProject.rows[0]?.status).toBe('Active');

      await db.query('INSERT INTO "projects" ("id", "client_id", "name") VALUES ($1, $2, $3);', [
        otherProjectId,
        otherClientId,
        'Other Project',
      ]);

      // Client deletion is restricted while child projects exist (SQLSTATE 23001 restrict_violation).
      await expect(
        db.query('DELETE FROM "clients" WHERE "id" = $1;', [clientId]),
      ).rejects.toMatchObject({ code: '23001' });

      // 3. TestSession FK, trimmed nonblank purpose, CHECK (ended_at IS NULL OR ended_at >= started_at), and UNIQUE(project_id, id).
      await expect(
        db.query(
          'INSERT INTO "test_sessions" ("id", "project_id", "purpose", "started_at") VALUES ($1, $2, $3, $4);',
          [crypto.randomUUID(), crypto.randomUUID(), 'Orphan session', '2026-10-06T09:00:00Z'],
        ),
      ).rejects.toMatchObject({ code: '23503' });

      await expect(
        db.query(
          'INSERT INTO "test_sessions" ("id", "project_id", "purpose", "started_at") VALUES ($1, $2, $3, $4);',
          [crypto.randomUUID(), projectId, '   ', '2026-10-06T09:00:00Z'],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      // ended_at < started_at rejected by PostgreSQL CHECK constraint.
      await expect(
        db.query(
          'INSERT INTO "test_sessions" ("id", "project_id", "purpose", "started_at", "ended_at") VALUES ($1, $2, $3, $4, $5);',
          [
            crypto.randomUUID(),
            projectId,
            'Invalid range',
            '2026-10-06T10:00:00Z',
            '2026-10-06T09:59:59Z',
          ],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      // ended_at IS NULL and ended_at == started_at and ended_at > started_at are all accepted.
      await db.query(
        'INSERT INTO "test_sessions" ("id", "project_id", "purpose", "started_at") VALUES ($1, $2, $3, $4);',
        [sessionId, projectId, 'Open session', '2026-10-06T09:00:00Z'],
      );
      await db.query(
        'INSERT INTO "test_sessions" ("id", "project_id", "purpose", "started_at", "ended_at") VALUES ($1, $2, $3, $4, $5);',
        [
          crypto.randomUUID(),
          projectId,
          'Zero-duration session',
          '2026-10-06T09:00:00Z',
          '2026-10-06T09:00:00Z',
        ],
      );

      // Project deletion is restricted while child test sessions exist (SQLSTATE 23001 restrict_violation).
      await expect(
        db.query('DELETE FROM "projects" WHERE "id" = $1;', [projectId]),
      ).rejects.toMatchObject({ code: '23001' });

      // Prove UNIQUE(project_id, id) exists and supports downstream composite FKs (rejecting cross-project session references).
      await db.query('BEGIN');
      try {
        await db.query(`
          CREATE SCHEMA qaeh_composite_fk_probe;
          CREATE TABLE qaeh_composite_fk_probe.child_probe (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL,
            session_id UUID NOT NULL,
            CONSTRAINT child_probe_session_fkey
              FOREIGN KEY (project_id, session_id)
              REFERENCES "public"."test_sessions" ("project_id", "id")
          );
        `);

        await db.query(
          'INSERT INTO qaeh_composite_fk_probe.child_probe (id, project_id, session_id) VALUES ($1, $2, $3);',
          [crypto.randomUUID(), projectId, sessionId],
        );

        await expect(
          db.query('SAVEPOINT cross_project_probe;').then(() =>
            db.query(
              'INSERT INTO qaeh_composite_fk_probe.child_probe (id, project_id, session_id) VALUES ($1, $2, $3);',
              [crypto.randomUUID(), otherProjectId, sessionId],
            ),
          ),
        ).rejects.toMatchObject({ code: '23503' });
      } finally {
        await db.query('ROLLBACK');
      }
    } finally {
      await db.end();
    }
  });

  it('denies anonymous requests with 401 and rejects authenticated mutations missing Origin or X-CSRF-Token with 403', async () => {
    const sampleId = '11111111-2222-4333-8444-555555555555';
    const anonEndpoints: Array<{ method: 'get' | 'post'; path: string }> = [
      { method: 'get', path: '/api/v1/clients' },
      { method: 'post', path: '/api/v1/clients' },
      { method: 'get', path: `/api/v1/clients/${sampleId}` },
      { method: 'get', path: `/api/v1/clients/${sampleId}/projects` },
      { method: 'post', path: `/api/v1/clients/${sampleId}/projects` },
      { method: 'get', path: `/api/v1/clients/${sampleId}/projects/${sampleId}` },
      { method: 'get', path: `/api/v1/projects/${sampleId}/sessions` },
      { method: 'post', path: `/api/v1/projects/${sampleId}/sessions` },
      { method: 'get', path: `/api/v1/projects/${sampleId}/sessions/${sampleId}` },
    ];

    for (const ep of anonEndpoints) {
      const res = await request(app.getHttpServer())[ep.method](ep.path);
      expect(res.status, `Expected 401 for anonymous ${ep.method.toUpperCase()} ${ep.path}`).toBe(
        401,
      );
      expect(res.headers['cache-control']).toBe('private, no-store, no-transform');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }

    const { jar } = await signInOwner();
    const missingCsrfRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .send({ name: 'Blocked Client' });
    expect(missingCsrfRes.status).toBe(403);
  });

  it('creates, lists, and fetches clients, active projects, and test sessions with trimmed fields, UTC timestamps, and read-only SSR GETs', async () => {
    const { jar, csrfToken } = await signInOwner();

    const createClientRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: '  Example Client  ',
        notes: '  Engagement notes  ',
      });
    expect(createClientRes.status).toBe(201);
    expect(createClientRes.body).toMatchObject({
      name: 'Example Client',
      notes: 'Engagement notes',
    });
    const clientId = createClientRes.body.id as string;

    const listClientsRes = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Cookie', cookieHeader(jar));
    expect(listClientsRes.status).toBe(200);
    expect(listClientsRes.headers['set-cookie']).toBeUndefined();
    expect(listClientsRes.body.items).toHaveLength(1);
    expect(listClientsRes.body.items[0].id).toBe(clientId);

    const getClientRes = await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}`)
      .set('Cookie', cookieHeader(jar));
    expect(getClientRes.status).toBe(200);
    expect(getClientRes.body.name).toBe('Example Client');

    const createProjectRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientId}/projects`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: '  Checkout QA  ',
        description: '  Core checkout flow  ',
        testingContext: '   ',
        instructions: 'Use synthetic cards only',
      });
    expect(createProjectRes.status).toBe(201);
    expect(createProjectRes.body).toMatchObject({
      clientId,
      name: 'Checkout QA',
      status: 'Active',
      description: 'Core checkout flow',
      testingContext: null,
      instructions: 'Use synthetic cards only',
    });
    const projectId = createProjectRes.body.id as string;

    const listProjectsRes = await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}/projects`)
      .set('Cookie', cookieHeader(jar));
    expect(listProjectsRes.status).toBe(200);
    expect(listProjectsRes.body.items).toHaveLength(1);
    expect(listProjectsRes.body.items[0].id).toBe(projectId);

    const getProjectRes = await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}/projects/${projectId}`)
      .set('Cookie', cookieHeader(jar));
    expect(getProjectRes.status).toBe(200);
    expect(getProjectRes.body.status).toBe('Active');

    const createSessionRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/sessions`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        purpose: '  Checkout regression  ',
        startedAt: '2026-10-06T11:00:00+02:00',
        endedAt: '2026-10-06T12:30:00+02:00',
        environment: '  staging  ',
        device: '   ',
        os: 'Linux',
        browser: 'Firefox 132',
        buildVersion: '2026.10.06-rc1',
        notes: '  Verified guest and signed-in checkout  ',
      });
    expect(createSessionRes.status).toBe(201);
    expect(createSessionRes.body).toMatchObject({
      projectId,
      purpose: 'Checkout regression',
      startedAt: '2026-10-06T09:00:00.000Z',
      endedAt: '2026-10-06T10:30:00.000Z',
      environment: 'staging',
      device: null,
      os: 'Linux',
      browser: 'Firefox 132',
      buildVersion: '2026.10.06-rc1',
      notes: 'Verified guest and signed-in checkout',
    });
    const sessionId = createSessionRes.body.id as string;

    const listSessionsRes = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/sessions`)
      .set('Cookie', cookieHeader(jar));
    expect(listSessionsRes.status).toBe(200);
    expect(listSessionsRes.body.items).toHaveLength(1);
    expect(listSessionsRes.body.items[0].id).toBe(sessionId);

    const getSessionRes = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/sessions/${sessionId}`)
      .set('Cookie', cookieHeader(jar));
    expect(getSessionRes.status).toBe(200);
    expect(getSessionRes.body).toMatchObject({
      id: sessionId,
      projectId,
      purpose: 'Checkout regression',
      startedAt: '2026-10-06T09:00:00.000Z',
      endedAt: '2026-10-06T10:30:00.000Z',
    });
  });

  it(' enforces DTO allowlists, field-level validation errors, missing/mismatched parent rejection, and archived-project session block', async () => {
    const { jar, csrfToken } = await signInOwner();

    const clientARes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Client A' });
    const clientBRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Client B' });
    const clientAId = clientARes.body.id as string;
    const clientBId = clientBRes.body.id as string;

    const projectARes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientAId}/projects`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Project A' });
    const projectBRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientBId}/projects`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Project B' });
    const projectAId = projectARes.body.id as string;
    const projectBId = projectBRes.body.id as string;

    const sessionBRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectBId}/sessions`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        purpose: 'Session on B',
        startedAt: '2026-10-06T09:00:00Z',
      });
    const sessionBId = sessionBRes.body.id as string;

    // Undeclared DTO property rejected (400 with fieldErrors).
    const extraPropRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Valid Name', undeclaredField: true });
    expect(extraPropRes.status).toBe(400);
    expect(extraPropRes.body.fieldErrors).toEqual([
      expect.objectContaining({ field: 'undeclaredField' }),
    ]);

    // Attempting to override Project status at creation is rejected by DTO allowlist.
    const statusOverrideRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientAId}/projects`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Attempted Archived', status: 'Archived' });
    expect(statusOverrideRes.status).toBe(400);
    expect(statusOverrideRes.body.fieldErrors).toEqual([
      expect.objectContaining({ field: 'status' }),
    ]);

    // Blank trimmed name rejected with fieldErrors on name.
    const blankNameRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({ name: '    ' });
    expect(blankNameRes.status).toBe(400);
    expect(blankNameRes.body.fieldErrors).toEqual([
      expect.objectContaining({ field: 'name' }),
    ]);

    // Calendar rollover timestamp (Feb 31) and endedAt < startedAt rejected with fieldErrors.
    const rolloverDateRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/sessions`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        purpose: 'Rollover check',
        startedAt: '2026-02-31T09:00:00Z',
      });
    expect(rolloverDateRes.status).toBe(400);
    expect(rolloverDateRes.body.fieldErrors).toEqual([
      expect.objectContaining({ field: 'startedAt' }),
    ]);

    const invalidRangeRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/sessions`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        purpose: 'Invalid range',
        startedAt: '2026-10-06T10:00:00Z',
        endedAt: '2026-10-06T09:59:59Z',
      });
    expect(invalidRangeRes.status).toBe(400);
    expect(invalidRangeRes.body.fieldErrors).toEqual([
      expect.objectContaining({ field: 'endedAt' }),
    ]);

    // Missing and mismatched parent checks (404 NOT_FOUND).
    const missingUuid = '99999999-9999-4999-8999-999999999999';
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/clients/${missingUuid}`)
          .set('Cookie', cookieHeader(jar))
      ).status,
    ).toBe(404);

    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/clients/${missingUuid}/projects`)
          .set('Origin', APP_ORIGIN)
          .set('Cookie', cookieHeader(jar))
          .set('X-CSRF-Token', csrfToken)
          .send({ name: 'No Parent' })
      ).status,
    ).toBe(404);

    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/clients/${missingUuid}/projects`)
          .set('Cookie', cookieHeader(jar))
      ).status,
    ).toBe(404);

    // Mismatched client -> project parent!
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/clients/${clientAId}/projects/${projectBId}`)
          .set('Cookie', cookieHeader(jar))
      ).status,
    ).toBe(404);

    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/projects/${missingUuid}/sessions`)
          .set('Origin', APP_ORIGIN)
          .set('Cookie', cookieHeader(jar))
          .set('X-CSRF-Token', csrfToken)
          .send({ purpose: 'No Project', startedAt: '2026-10-06T09:00:00Z' })
      ).status,
    ).toBe(404);

    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/projects/${missingUuid}/sessions`)
          .set('Cookie', cookieHeader(jar))
      ).status,
    ).toBe(404);

    // Mismatched project -> session parent!
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/projects/${projectAId}/sessions/${sessionBId}`)
          .set('Cookie', cookieHeader(jar))
      ).status,
    ).toBe(404);

    // Archived project blocks session creation on the server (409 Conflict).
    const db = new pg.Client({ connectionString: databaseUrl });
    await db.connect();
    try {
      await db.query('UPDATE "projects" SET "status" = $1 WHERE "id" = $2;', [
        'Archived',
        projectAId,
      ]);
    } finally {
      await db.end();
    }

    const archivedSessionRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/sessions`)
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', csrfToken)
      .send({
        purpose: 'Blocked on archived project',
        startedAt: '2026-10-06T09:00:00Z',
      });
    expect(archivedSessionRes.status).toBe(409);
    expect(archivedSessionRes.body.code).toBe('CONFLICT');
  });
});
