import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { validateApiEnv, type ApiEnv } from '../src/config/env.validation';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PROVISION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'provision-owner.ts');
const APP_ORIGIN = 'http://127.0.0.1:8080';
const OWNER_LOGIN = 'owner@synthetic.invalid';
const OWNER_PASSWORD = 'SyntheticOwnerPass!2026#Valid';

let multipartStorageHandleCalls = 0;
let multipartHandlerCalls = 0;

const trackingStorage = {
  _handleFile(
    _req: unknown,
    file: { stream: NodeJS.ReadableStream },
    cb: (error: Error | null, info?: { size: number }) => void,
  ): void {
    multipartStorageHandleCalls += 1;
    let size = 0;
    file.stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
    });
    file.stream.on('end', () => cb(null, { size }));
    file.stream.on('error', (err: Error) => cb(err));
  },
  _removeFile(_req: unknown, _file: unknown, cb: (error: Error | null) => void): void {
    cb(null);
  },
};

@Controller('test-only')
class TestProtectedProbeController {
  @Get('protected-data')
  public getProtectedData(): { secretMarker: string } {
    return { secretMarker: 'owner-only-workspace-payload' };
  }

  @Post('multipart-probe')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: trackingStorage,
      limits: { fileSize: 1024 * 1024, files: 1 },
    }),
  )
  public uploadProbe(@UploadedFile() file?: { size?: number }): { receivedBytes: number } {
    multipartHandlerCalls += 1;
    return { receivedBytes: file?.size ?? 0 };
  }
}

function parseSetCookies(header: string | string[] | undefined): string[] {
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

function applySetCookies(jar: Map<string, string>, header: string | string[] | undefined): void {
  for (const raw of parseSetCookies(header)) {
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

function cookieHeaderFromJar(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function runProvisionCli(
  args: readonly string[],
  stdinInput: string,
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
    child.stdin.end(stdinInput);
  });
}

async function createTestAuthApp(overrides: Partial<Record<string, string | undefined>> = {}): Promise<{
  app: NestExpressApplication;
  env: ApiEnv;
}> {
  const env = validateApiEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_POOL_MAX: '5',
    POSTGRES_MAX_CONNECTIONS: '30',
    DATABASE_STATEMENT_TIMEOUT_MS: '5000',
    TRUST_PROXY: '127.0.0.1/32,::1/128',
    APP_ORIGIN,
    AUTH_LOGIN_MAX_ATTEMPTS: '4',
    AUTH_LOGIN_WINDOW_SECONDS: '300',
    AUTH_LOGIN_BLOCK_SECONDS: '300',
    ...overrides,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
    controllers: [TestProtectedProbeController],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env, { mountSwaggerUi: false });
  await app.init();
  return { app, env };
}

describe('AC07 single-owner authentication, CSRF, session & proxy integration', () => {
  let app: NestExpressApplication;
  let databaseUrl: string;
  let pgClient: pg.Client;

  beforeAll(async () => {
    const booted = await createTestAuthApp();
    app = booted.app;
    databaseUrl = booted.env.databaseUrl;

    pgClient = new pg.Client({ connectionString: databaseUrl });
    await pgClient.connect();
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.end();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    multipartStorageHandleCalls = 0;
    multipartHandlerCalls = 0;
    await pgClient.query('TRUNCATE TABLE "auth_sessions", "owners" CASCADE;');
  });

  it('enforces single owner even under concurrent provisioning, rejects CLI --password flag, and keeps secrets out of output', async () => {
    const cliPasswordFlagAttempt = await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password', OWNER_PASSWORD],
      '',
      databaseUrl,
    );
    expect(cliPasswordFlagAttempt.code).not.toBe(0);
    expect(cliPasswordFlagAttempt.stdout + cliPasswordFlagAttempt.stderr).not.toContain(OWNER_PASSWORD);

    const concurrentAttempts = await Promise.all([
      runProvisionCli(
        ['provision', '--login', 'owner-race-a@synthetic.invalid', '--password-stdin'],
        `${OWNER_PASSWORD}\n`,
        databaseUrl,
      ),
      runProvisionCli(
        ['provision', '--login', 'owner-race-b@synthetic.invalid', '--password-stdin'],
        `${OWNER_PASSWORD}\n`,
        databaseUrl,
      ),
      runProvisionCli(
        ['provision', '--login', 'owner-race-c@synthetic.invalid', '--password-stdin'],
        `${OWNER_PASSWORD}\n`,
        databaseUrl,
      ),
    ]);

    const succeeded = concurrentAttempts.filter((r) => r.code === 0);
    const rejected = concurrentAttempts.filter((r) => r.code !== 0);
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(2);

    for (const attempt of concurrentAttempts) {
      const combinedLogs = `${attempt.stdout}\n${attempt.stderr}`;
      expect(combinedLogs).not.toContain(OWNER_PASSWORD);
      expect(combinedLogs).not.toContain('$scrypt$');
      expect(combinedLogs).not.toContain(databaseUrl);
    }

    const dbOwners = await pgClient.query<{
      id: string;
      login_identifier: string;
      password_hash: string;
      timezone: string;
    }>('SELECT id, login_identifier, password_hash, timezone FROM "owners";');

    expect(dbOwners.rows).toHaveLength(1);
    expect(dbOwners.rows[0]?.timezone).toBe('Europe/Bratislava');
    expect(dbOwners.rows[0]?.password_hash).toMatch(/^\$scrypt\$ln=\d+,r=\d+,p=\d+\$/);
    expect(dbOwners.rows[0]?.password_hash).not.toContain(OWNER_PASSWORD);
  });

  it('denies anonymous requests to protected routes with 401 private, no-store while keeping health public', async () => {
    const healthRes = await request(app.getHttpServer()).get('/api/v1/health');
    expect(healthRes.status).toBe(200);

    const sessionRes = await request(app.getHttpServer()).get('/api/v1/auth/session');
    expect(sessionRes.status).toBe(401);
    expect(sessionRes.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
    expect(sessionRes.headers['cache-control']).toContain('private');
    expect(sessionRes.headers['cache-control']).toContain('no-store');
    expect(sessionRes.headers['x-content-type-options']).toBe('nosniff');

    const probeRes = await request(app.getHttpServer()).get('/api/v1/test-only/protected-data');
    expect(probeRes.status).toBe(401);
    expect(JSON.stringify(probeRes.body)).not.toContain('owner-only-workspace-payload');
  });

  it('binds pre-login CSRF to its browser, enforces exact Origin, issues digest-stored session + fresh authenticated CSRF on login, and clears/revokes on logout', async () => {
    const prov = await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password-stdin'],
      `${OWNER_PASSWORD}\n`,
      databaseUrl,
    );
    expect(prov.code).toBe(0);

    const browserA = new Map<string, string>();
    const browserB = new Map<string, string>();

    const csrfARes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    expect(csrfARes.status).toBe(200);
    expect(csrfARes.headers['cache-control']).toContain('private');
    expect(csrfARes.headers['cache-control']).toContain('no-store');
    applySetCookies(browserA, csrfARes.headers['set-cookie']);
    const preLoginTokenA = (csrfARes.body as { csrfToken: string }).csrfToken;
    expect(typeof preLoginTokenA).toBe('string');
    expect(preLoginTokenA.length).toBeGreaterThanOrEqual(32);

    // Cross-browser reuse of Browser A's pre-login token without Browser A's cookie must fail (403).
    const crossBrowserLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(browserB))
      .set('X-CSRF-Token', preLoginTokenA)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    expect(crossBrowserLogin.status).toBe(403);

    // Missing or mismatching Origin must fail (403).
    const missingOriginLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookieHeaderFromJar(browserA))
      .set('X-CSRF-Token', preLoginTokenA)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    expect(missingOriginLogin.status).toBe(403);

    const wrongOriginLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:8080')
      .set('Cookie', cookieHeaderFromJar(browserA))
      .set('X-CSRF-Token', preLoginTokenA)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    expect(wrongOriginLogin.status).toBe(403);

    // Valid Browser A login succeeds, sets host-only HttpOnly/Secure/SameSite=Lax/Path=/ cookie, and returns fresh CSRF token.
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(browserA))
      .set('X-CSRF-Token', preLoginTokenA)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.headers['cache-control']).toContain('private');
    expect(loginRes.headers['cache-control']).toContain('no-store');
    const setCookies = parseSetCookies(loginRes.headers['set-cookie']);
    const sessionSetCookie = setCookies.find((c) => c.startsWith('qaeh_session='));
    expect(sessionSetCookie).toBeDefined();
    expect(sessionSetCookie).toMatch(/;\s*Path=\/(?:;|$)/i);
    expect(sessionSetCookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
    expect(sessionSetCookie).toMatch(/;\s*Secure(?:;|$)/i);
    expect(sessionSetCookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
    expect(sessionSetCookie).not.toMatch(/;\s*Domain=/i);

    applySetCookies(browserA, setCookies);
    const rawSessionCookie = browserA.get('qaeh_session');
    expect(rawSessionCookie).toBeTruthy();

    const authCsrfToken = (loginRes.body as { csrfToken: string }).csrfToken;
    expect(authCsrfToken).toBeTruthy();
    expect(authCsrfToken).not.toBe(preLoginTokenA);

    // Verify PostgreSQL stores only the SHA-256 digest of the session token, never the raw token.
    const expectedDigest = crypto.createHash('sha256').update(rawSessionCookie!, 'utf8').digest('hex');
    const sessionRows = await pgClient.query<{
      token_digest: string;
      revoked_at: Date | null;
    }>('SELECT token_digest, revoked_at FROM "auth_sessions";');
    expect(sessionRows.rows).toHaveLength(1);
    expect(sessionRows.rows[0]?.token_digest).toBe(expectedDigest);
    expect(sessionRows.rows[0]?.token_digest).not.toBe(rawSessionCookie);
    expect(sessionRows.rows[0]?.revoked_at).toBeNull();

    // Pre-login CSRF token must NOT be accepted for authenticated mutations such as logout.
    const staleCsrfLogout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(browserA))
      .set('X-CSRF-Token', preLoginTokenA)
      .send({});
    expect(staleCsrfLogout.status).toBe(403);

    // Valid authenticated CSRF token on logout revokes the DB session and clears the browser cookie.
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(browserA))
      .set('X-CSRF-Token', authCsrfToken)
      .send({});
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ authenticated: false });

    const logoutCookies = parseSetCookies(logoutRes.headers['set-cookie']);
    const clearSessionCookie = logoutCookies.find((c) => c.startsWith('qaeh_session='));
    expect(clearSessionCookie).toBeDefined();
    expect(clearSessionCookie).toMatch(/Max-Age=0/i);
    expect(clearSessionCookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
    expect(clearSessionCookie).toMatch(/;\s*Secure(?:;|$)/i);
    expect(clearSessionCookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
    expect(clearSessionCookie).not.toMatch(/;\s*Domain=/i);

    // Replaying the old raw session cookie after logout must return 401.
    const replayAfterLogout = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', `qaeh_session=${rawSessionCookie}`);
    expect(replayAfterLogout.status).toBe(401);
  });

  it('keeps SSR session reads strictly read-only with zero DB mutation and zero Set-Cookie headers', async () => {
    await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password-stdin'],
      `${OWNER_PASSWORD}\n`,
      databaseUrl,
    );

    const jar = new Map<string, string>();
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    applySetCookies(jar, csrfRes.headers['set-cookie']);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', (csrfRes.body as { csrfToken: string }).csrfToken)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    applySetCookies(jar, loginRes.headers['set-cookie']);

    const beforeRead = await pgClient.query<{
      id: string;
      token_digest: string;
      csrf_salt: string;
      created_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
      xmin: string;
    }>(
      'SELECT id, token_digest, csrf_salt, created_at, expires_at, revoked_at, xmin::text AS xmin FROM "auth_sessions";',
    );
    expect(beforeRead.rows).toHaveLength(1);

    for (let i = 0; i < 3; i += 1) {
      const ssrRes = await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', `qaeh_session=${jar.get('qaeh_session')}`);
      expect(ssrRes.status).toBe(200);
      expect(ssrRes.headers['set-cookie']).toBeUndefined();
      expect(ssrRes.headers['cache-control']).toContain('private');
      expect(ssrRes.headers['cache-control']).toContain('no-store');
      expect(ssrRes.body).toEqual({
        authenticated: true,
        owner: {
          id: expect.any(String),
          loginIdentifier: OWNER_LOGIN,
          timezone: 'Europe/Bratislava',
        },
      });
    }

    const afterRead = await pgClient.query<{
      id: string;
      token_digest: string;
      csrf_salt: string;
      created_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
      xmin: string;
    }>(
      'SELECT id, token_digest, csrf_salt, created_at, expires_at, revoked_at, xmin::text AS xmin FROM "auth_sessions";',
    );

    // PostgreSQL tuple xmin is unchanged when zero UPDATEs touched the row!
    expect(afterRead.rows).toEqual(beforeRead.rows);
  });

  it('enforces session expiry and revokes all existing sessions on operator password reset', async () => {
    await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password-stdin'],
      `${OWNER_PASSWORD}\n`,
      databaseUrl,
    );

    const jar1 = new Map<string, string>();
    const csrf1 = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    applySetCookies(jar1, csrf1.headers['set-cookie']);
    const login1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar1))
      .set('X-CSRF-Token', (csrf1.body as { csrfToken: string }).csrfToken)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    applySetCookies(jar1, login1.headers['set-cookie']);

    const jar2 = new Map<string, string>();
    const csrf2 = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    applySetCookies(jar2, csrf2.headers['set-cookie']);
    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar2))
      .set('X-CSRF-Token', (csrf2.body as { csrfToken: string }).csrfToken)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    applySetCookies(jar2, login2.headers['set-cookie']);

    // Expire session 1 in PostgreSQL and verify immediate 401.
    const digest1 = crypto
      .createHash('sha256')
      .update(jar1.get('qaeh_session')!, 'utf8')
      .digest('hex');
    await pgClient.query(
      `UPDATE "auth_sessions"
       SET created_at = NOW() - INTERVAL '2 hours',
           expires_at = NOW() - INTERVAL '1 second'
       WHERE token_digest = $1;`,
      [digest1],
    );

    const expiredRes = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', `qaeh_session=${jar1.get('qaeh_session')}`);
    expect(expiredRes.status).toBe(401);

    // Session 2 is still active until operator runs reset-password.
    const activeBeforeReset = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', `qaeh_session=${jar2.get('qaeh_session')}`);
    expect(activeBeforeReset.status).toBe(200);

    const rotatedPassword = 'RotatedSyntheticPassword!2026#New';
    const resetResult = await runProvisionCli(
      ['reset-password', '--login', OWNER_LOGIN, '--password-stdin'],
      `${rotatedPassword}\n`,
      databaseUrl,
    );
    expect(resetResult.code).toBe(0);
    expect(resetResult.stdout + resetResult.stderr).not.toContain(rotatedPassword);

    // Session 2 must now be revoked (401).
    const afterReset = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', `qaeh_session=${jar2.get('qaeh_session')}`);
    expect(afterReset.status).toBe(401);

    // Old password rejected; rotated password accepted.
    const jar3 = new Map<string, string>();
    const csrf3 = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    applySetCookies(jar3, csrf3.headers['set-cookie']);
    const oldPwAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar3))
      .set('X-CSRF-Token', (csrf3.body as { csrfToken: string }).csrfToken)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    expect(oldPwAttempt.status).toBe(401);

    const newPwAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar3))
      .set('X-CSRF-Token', (csrf3.body as { csrfToken: string }).csrfToken)
      .send({ loginIdentifier: OWNER_LOGIN, password: rotatedPassword });
    expect(newPwAttempt.status).toBe(200);
  });

  it('rejects missing or invalid Auth, Origin, or X-CSRF-Token BEFORE multipart stream or handler runs', async () => {
    await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password-stdin'],
      `${OWNER_PASSWORD}\n`,
      databaseUrl,
    );

    const jar = new Map<string, string>();
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    applySetCookies(jar, csrfRes.headers['set-cookie']);
    const preLoginCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;

    // 1. Anonymous multipart request -> 401 before Multer runs
    const anonUpload = await request(app.getHttpServer())
      .post('/api/v1/test-only/multipart-probe')
      .set('Origin', APP_ORIGIN)
      .set('X-CSRF-Token', preLoginCsrf)
      .attach('file', Buffer.from('synthetic-payload'), 'probe.txt');
    expect(anonUpload.status).toBe(401);
    expect(multipartStorageHandleCalls).toBe(0);
    expect(multipartHandlerCalls).toBe(0);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    applySetCookies(jar, loginRes.headers['set-cookie']);
    const authCsrf = (loginRes.body as { csrfToken: string }).csrfToken;

    // 2. Missing Origin -> 403 before Multer runs
    const noOriginUpload = await request(app.getHttpServer())
      .post('/api/v1/test-only/multipart-probe')
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', authCsrf)
      .attach('file', Buffer.from('synthetic-payload'), 'probe.txt');
    expect(noOriginUpload.status).toBe(403);
    expect(multipartStorageHandleCalls).toBe(0);
    expect(multipartHandlerCalls).toBe(0);

    // 3. Incorrect Origin -> 403 before Multer runs
    const wrongOriginUpload = await request(app.getHttpServer())
      .post('/api/v1/test-only/multipart-probe')
      .set('Origin', 'https://evil.synthetic.invalid')
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', authCsrf)
      .attach('file', Buffer.from('synthetic-payload'), 'probe.txt');
    expect(wrongOriginUpload.status).toBe(403);
    expect(multipartStorageHandleCalls).toBe(0);
    expect(multipartHandlerCalls).toBe(0);

    // 4. Missing or stale pre-login CSRF token -> 403 before Multer runs
    const noCsrfUpload = await request(app.getHttpServer())
      .post('/api/v1/test-only/multipart-probe')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .attach('file', Buffer.from('synthetic-payload'), 'probe.txt');
    expect(noCsrfUpload.status).toBe(403);

    const preLoginCsrfUpload = await request(app.getHttpServer())
      .post('/api/v1/test-only/multipart-probe')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .attach('file', Buffer.from('synthetic-payload'), 'probe.txt');
    expect(preLoginCsrfUpload.status).toBe(403);
    expect(multipartStorageHandleCalls).toBe(0);
    expect(multipartHandlerCalls).toBe(0);

    // 5. Positive control: authenticated + exact Origin + valid authenticated X-CSRF-Token succeeds
    const validUpload = await request(app.getHttpServer())
      .post('/api/v1/test-only/multipart-probe')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', authCsrf)
      .attach('file', Buffer.from('synthetic-payload'), 'probe.txt');
    expect(validUpload.status).toBe(201);
    expect(validUpload.body).toEqual({ receivedBytes: 17 });
    expect(multipartStorageHandleCalls).toBe(1);
    expect(multipartHandlerCalls).toBe(1);
  });

  it('enforces DTO allowlisting, generic login failure bodies, bounded login throttling, and explicit Nginx proxy trust', async () => {
    await runProvisionCli(
      ['provision', '--login', OWNER_LOGIN, '--password-stdin'],
      `${OWNER_PASSWORD}\n`,
      databaseUrl,
    );

    const jar = new Map<string, string>();
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('X-Forwarded-For', '198.51.100.10');
    applySetCookies(jar, csrfRes.headers['set-cookie']);
    const preLoginCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;

    // Undeclared DTO property must fail with 400 BAD_REQUEST.
    const extraFieldRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .set('X-Forwarded-For', '198.51.100.10')
      .send({
        loginIdentifier: OWNER_LOGIN,
        password: OWNER_PASSWORD,
        isAdmin: true,
      });
    expect(extraFieldRes.status).toBe(400);
    expect(extraFieldRes.body.code).toBe('BAD_REQUEST');

    // Wrong identifier vs wrong password return identical generic 401 response body.
    const wrongUserRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .set('X-Forwarded-For', '198.51.100.11')
      .send({ loginIdentifier: 'nonexistent@synthetic.invalid', password: OWNER_PASSWORD });

    const wrongPassRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .set('X-Forwarded-For', '198.51.100.12')
      .send({ loginIdentifier: OWNER_LOGIN, password: 'WrongPassword!2026#Test' });

    expect(wrongUserRes.status).toBe(401);
    expect(wrongPassRes.status).toBe(401);
    expect(wrongUserRes.body).toEqual(wrongPassRes.body);

    // Bounded login throttling per client IP via trusted Nginx X-Forwarded-For (maxAttempts=4).
    const throttledIp = '198.51.100.55';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const failRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', cookieHeaderFromJar(jar))
        .set('X-CSRF-Token', preLoginCsrf)
        .set('X-Forwarded-For', throttledIp)
        .send({ loginIdentifier: OWNER_LOGIN, password: 'WrongPassword!2026#Test' });
      expect(failRes.status).toBe(401);
    }

    const fourthFailRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .set('X-Forwarded-For', throttledIp)
      .send({ loginIdentifier: OWNER_LOGIN, password: 'WrongPassword!2026#Test' });
    expect(fourthFailRes.status).toBe(429);
    expect(fourthFailRes.body.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(fourthFailRes.headers['retry-after'])).toBeGreaterThan(0);

    // A different client IP through trusted Nginx is NOT blocked by throttledIp.
    const otherIpSuccess = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', cookieHeaderFromJar(jar))
      .set('X-CSRF-Token', preLoginCsrf)
      .set('X-Forwarded-For', '198.51.100.99')
      .send({ loginIdentifier: OWNER_LOGIN, password: OWNER_PASSWORD });
    expect(otherIpSuccess.status).toBe(200);

    // Untrusted peer IP test: when TRUST_PROXY is set to a dedicated Nginx IP (192.0.2.10/32)
    // and APP_ORIGIN is https://..., direct loopback requests spoofing X-Forwarded-Proto: https
    // and rotating X-Forwarded-For IPs are NOT trusted!
    const { app: strictProxyApp } = await createTestAuthApp({
      TRUST_PROXY: '192.0.2.10/32',
      APP_ORIGIN: 'https://hub.synthetic.invalid',
      AUTH_LOGIN_MAX_ATTEMPTS: '2',
    });
    try {
      const spoofedHttpsCsrf = await request(strictProxyApp.getHttpServer())
        .get('/api/v1/auth/csrf')
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-For', '203.0.113.9');
      expect(spoofedHttpsCsrf.status).toBe(403);
      expect(spoofedHttpsCsrf.headers['set-cookie']).toBeUndefined();
    } finally {
      await strictProxyApp.close();
    }

    // Untrusted peer cannot bypass per-IP login throttling by spoofing rotating X-Forwarded-For headers.
    const { app: untrustedXffApp } = await createTestAuthApp({
      TRUST_PROXY: '192.0.2.10/32',
      APP_ORIGIN,
      AUTH_LOGIN_MAX_ATTEMPTS: '2',
    });
    try {
      const uJar = new Map<string, string>();
      const uCsrf = await request(untrustedXffApp.getHttpServer()).get('/api/v1/auth/csrf');
      applySetCookies(uJar, uCsrf.headers['set-cookie']);
      const uToken = (uCsrf.body as { csrfToken: string }).csrfToken;

      const attempt1 = await request(untrustedXffApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', cookieHeaderFromJar(uJar))
        .set('X-CSRF-Token', uToken)
        .set('X-Forwarded-For', '203.0.113.1')
        .send({ loginIdentifier: OWNER_LOGIN, password: 'WrongPassword!1' });
      expect(attempt1.status).toBe(401);

      const attempt2WithSpoofedDifferentIp = await request(untrustedXffApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', cookieHeaderFromJar(uJar))
        .set('X-CSRF-Token', uToken)
        .set('X-Forwarded-For', '203.0.113.2')
        .send({ loginIdentifier: OWNER_LOGIN, password: 'WrongPassword!2' });
      expect(attempt2WithSpoofedDifferentIp.status).toBe(429);
    } finally {
      await untrustedXffApp.close();
    }
  });
});
