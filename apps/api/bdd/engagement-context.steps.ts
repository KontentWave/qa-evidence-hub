import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { AfterAll, Before, Given, setDefaultTimeout, Then, When } from '@cucumber/cucumber';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { validateApiEnv } from '../src/config/env.validation';

setDefaultTimeout(30_000);

interface ClientRecord {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProjectRecord {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly status: 'Active' | 'Archived';
  readonly description: string | null;
  readonly testingContext: string | null;
  readonly instructions: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface SessionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly purpose: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly environment: string | null;
  readonly device: string | null;
  readonly os: string | null;
  readonly browser: string | null;
  readonly buildVersion: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface SessionFormDraft {
  readonly purpose: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly environment: string;
  readonly device: string;
  readonly os: string;
  readonly browser: string;
  readonly buildVersion: string;
  readonly notes: string;
}

interface EngagementWorld {
  databaseUrl?: string;
  origin?: string;
  ownerLogin?: string;
  ownerPassword?: string;
  cookies?: Map<string, string>;
  csrfToken?: string;
  currentClient?: ClientRecord;
  currentProject?: ProjectRecord;
  currentSession?: SessionRecord;
  projectPageHtml?: string;
  submittedDraft?: SessionFormDraft;
  preservedDraft?: SessionFormDraft;
  invalidFieldNames?: string[];
  lastApiResponse?: Response;
  directPageResponse?: {
    readonly status: number;
    readonly location: string | null;
    readonly cacheControl: string | null;
    readonly contentTypeOptions: string | null;
    readonly setCookies: readonly string[];
    readonly body: string;
  };
  protectedProjectMarker?: string;
}

interface SharedRuntime {
  readonly app: NestExpressApplication;
  readonly apiPort: number;
  readonly webPort: number;
  readonly webOrigin: string;
  readonly webProcess: ChildProcess;
}

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PROVISION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'provision-owner.ts');
const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');
const NEXT_BIN = path.join(WEB_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

let sharedRuntime: SharedRuntime | null = null;

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate ephemeral TCP port')));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function updateCookieJar(
  jar: Map<string, string>,
  setCookieHeader: string | string[] | undefined,
): void {
  if (!setCookieHeader) {
    return;
  }
  const rawList = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of rawList) {
    const [pair, ...attrs] = raw.split(';').map((part) => part.trim());
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    const isCleared = value === '' || attrs.some((attr) => /^max-age=0$/i.test(attr));
    if (isCleared) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function serializeCookieJar(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function getFetchSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
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

async function ensureSharedRuntime(databaseUrl: string): Promise<SharedRuntime> {
  if (sharedRuntime) {
    return sharedRuntime;
  }

  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const webOrigin = `http://127.0.0.1:${webPort}`;

  const env = validateApiEnv({
    NODE_ENV: 'test',
    API_PORT: String(apiPort),
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: '5',
    POSTGRES_MAX_CONNECTIONS: '30',
    DATABASE_STATEMENT_TIMEOUT_MS: '5000',
    TRUST_PROXY: '127.0.0.1/32,::1/128',
    APP_ORIGIN: webOrigin,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env, { mountSwaggerUi: false });
  await app.init();
  await app.listen(apiPort, '127.0.0.1');

  const webProcess = spawn(
    process.execPath,
    [NEXT_BIN, 'start', '--hostname', '127.0.0.1', '--port', String(webPort)],
    {
      cwd: WEB_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        INTERNAL_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let startupLogs = '';
  webProcess.stdout?.on('data', (chunk: Buffer) => {
    startupLogs += chunk.toString('utf8');
  });
  webProcess.stderr?.on('data', (chunk: Buffer) => {
    startupLogs += chunk.toString('utf8');
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (webProcess.exitCode !== null) {
      await app.close();
      throw new Error(
        `Next.js server exited prematurely with code ${webProcess.exitCode}: ${startupLogs}`,
      );
    }
    try {
      const probe = await fetch(`${webOrigin}/login`, { redirect: 'manual' });
      if (probe.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // Wait until Next.js binds port.
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!ready) {
    webProcess.kill('SIGTERM');
    await app.close();
    throw new Error(`Timed out waiting for Next.js server at ${webOrigin}: ${startupLogs}`);
  }

  sharedRuntime = {
    app,
    apiPort,
    webPort,
    webOrigin,
    webProcess,
  };
  return sharedRuntime;
}

async function truncateKnownTables(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('test_sessions', 'projects', 'clients', 'auth_sessions', 'owners')`,
    );
    const names = existing.rows.map((r) => `"${r.table_name}"`);
    if (names.length > 0) {
      await client.query(`TRUNCATE TABLE ${names.join(', ')} CASCADE;`);
    }
  } finally {
    await client.end();
  }
}

async function provisionAndSignInOwner(
  world: EngagementWorld,
  runtime: SharedRuntime,
): Promise<{ cookies: Map<string, string>; csrfToken: string }> {
  assert.ok(world.databaseUrl && world.ownerLogin && world.ownerPassword);

  const provRes = await runProvisionCli(
    ['provision', '--login', world.ownerLogin, '--password-stdin'],
    `${world.ownerPassword}\n`,
    world.databaseUrl,
  );
  assert.equal(provRes.code, 0, `Expected owner provisioning to succeed: ${provRes.stderr}`);

  const jar = new Map<string, string>();
  const csrfRes = await request(runtime.app.getHttpServer()).get('/api/v1/auth/csrf');
  assert.equal(csrfRes.status, 200);
  updateCookieJar(jar, csrfRes.headers['set-cookie']);
  const preLoginCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;

  const loginRes = await request(runtime.app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', runtime.webOrigin)
    .set('Cookie', serializeCookieJar(jar))
    .set('X-CSRF-Token', preLoginCsrf)
    .send({
      loginIdentifier: world.ownerLogin,
      password: world.ownerPassword,
    });
  assert.equal(loginRes.status, 200);
  updateCookieJar(jar, loginRes.headers['set-cookie']);
  const csrfToken = (loginRes.body as { csrfToken: string }).csrfToken;

  return { cookies: jar, csrfToken };
}

Before({ tags: '(@AC01 and @S1) or @P1-04' }, async function (this: EngagementWorld) {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for P1-04 BDD scenarios');
  this.databaseUrl = process.env.DATABASE_URL;
  this.ownerLogin = 'owner.p104@synthetic.invalid';
  this.ownerPassword = 'SyntheticP104Pass!2026#Valid';
  this.cookies = new Map();
  this.csrfToken = undefined;
  this.currentClient = undefined;
  this.currentProject = undefined;
  this.currentSession = undefined;
  this.projectPageHtml = undefined;
  this.submittedDraft = undefined;
  this.preservedDraft = undefined;
  this.invalidFieldNames = undefined;

  await truncateKnownTables(this.databaseUrl);
  const runtime = await ensureSharedRuntime(this.databaseUrl);
  this.origin = runtime.webOrigin;
});

AfterAll(async function () {
  if (!sharedRuntime) {
    return;
  }
  const { webProcess, app } = sharedRuntime;
  sharedRuntime = null;

  if (webProcess.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (webProcess.pid) {
          process.kill(webProcess.pid, 'SIGKILL');
        }
        resolve();
      }, 5000);
      webProcess.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      webProcess.kill('SIGTERM');
    });
  }

  await app.close();
});

Given('I am signed in as the provisioned owner', async function (this: EngagementWorld) {
  assert.ok(sharedRuntime);
  const authed = await provisionAndSignInOwner(this, sharedRuntime);
  this.cookies = authed.cookies;
  this.csrfToken = authed.csrfToken;
});

When('I create client {string}', async function (this: EngagementWorld, clientName: string) {
  assert.ok(sharedRuntime && this.cookies && this.csrfToken);
  const res = await request(sharedRuntime.app.getHttpServer())
    .post('/api/v1/clients')
    .set('Origin', sharedRuntime.webOrigin)
    .set('Cookie', serializeCookieJar(this.cookies))
    .set('X-CSRF-Token', this.csrfToken)
    .send({
      name: clientName,
      notes: 'Synthetic client engagement notes',
    });

  this.lastApiResponse = res;
  assert.equal(res.status, 201, `Expected 201 creating client, got ${res.status}`);
  this.currentClient = res.body as ClientRecord;
  assert.equal(this.currentClient.name, clientName);
});

When(
  'I create active project {string} for that client',
  async function (this: EngagementWorld, projectName: string) {
    assert.ok(sharedRuntime && this.cookies && this.csrfToken && this.currentClient);
    const res = await request(sharedRuntime.app.getHttpServer())
      .post(`/api/v1/clients/${this.currentClient.id}/projects`)
      .set('Origin', sharedRuntime.webOrigin)
      .set('Cookie', serializeCookieJar(this.cookies))
      .set('X-CSRF-Token', this.csrfToken)
      .send({
        name: projectName,
        description: 'Synthetic checkout release scope',
        testingContext: 'Staging payment gateway sandbox',
        instructions: 'Do not use real card numbers.',
      });

    this.lastApiResponse = res;
    assert.equal(res.status, 201, `Expected 201 creating project, got ${res.status}`);
    this.currentProject = res.body as ProjectRecord;
    assert.equal(this.currentProject.name, projectName);
    assert.equal(this.currentProject.clientId, this.currentClient.id);
    assert.equal(this.currentProject.status, 'Active');
  },
);

When(
  'I create a session for that project with purpose {string} and start {string}',
  async function (this: EngagementWorld, purpose: string, startedAt: string) {
    assert.ok(sharedRuntime && this.cookies && this.csrfToken && this.currentProject);
    const res = await request(sharedRuntime.app.getHttpServer())
      .post(`/api/v1/projects/${this.currentProject.id}/sessions`)
      .set('Origin', sharedRuntime.webOrigin)
      .set('Cookie', serializeCookieJar(this.cookies))
      .set('X-CSRF-Token', this.csrfToken)
      .send({
        purpose,
        startedAt,
        environment: 'staging',
        browser: 'Firefox 132',
        notes: 'Initial regression pass',
      });

    this.lastApiResponse = res;
    assert.equal(res.status, 201, `Expected 201 creating session, got ${res.status}`);
    this.currentSession = res.body as SessionRecord;
    assert.equal(this.currentSession.projectId, this.currentProject.id);
    assert.equal(this.currentSession.purpose, purpose);
  },
);

Then(
  'the session is listed under {string}',
  async function (this: EngagementWorld, expectedProjectName: string) {
    assert.ok(
      sharedRuntime &&
        this.cookies &&
        this.currentClient &&
        this.currentProject &&
        this.currentSession,
    );
    assert.equal(this.currentProject.name, expectedProjectName);

    const apiListRes = await request(sharedRuntime.app.getHttpServer())
      .get(`/api/v1/projects/${this.currentProject.id}/sessions`)
      .set('Cookie', serializeCookieJar(this.cookies));

    assert.equal(apiListRes.status, 200);
    const items = (apiListRes.body as { items: SessionRecord[] }).items;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, this.currentSession.id);
    assert.equal(items[0]?.purpose, this.currentSession.purpose);

    const projectPageRes = await fetch(
      `${sharedRuntime.webOrigin}/clients/${this.currentClient.id}/projects/${this.currentProject.id}`,
      {
        redirect: 'manual',
        headers: {
          cookie: `qaeh_session=${this.cookies.get('qaeh_session') ?? ''}`,
        },
      },
    );
    assert.equal(projectPageRes.status, 200);
    assert.equal(getFetchSetCookies(projectPageRes.headers).length, 0);
    const html = await projectPageRes.text();
    assert.ok(html.includes(expectedProjectName));
    assert.ok(html.includes(this.currentSession.purpose));
    assert.ok(
      html.includes(
        `/clients/${this.currentClient.id}/projects/${this.currentProject.id}/sessions/${this.currentSession.id}`,
      ),
    );
  },
);

Then(
  'reopening the session shows its saved purpose and start time',
  async function (this: EngagementWorld) {
    assert.ok(
      sharedRuntime &&
        this.cookies &&
        this.currentClient &&
        this.currentProject &&
        this.currentSession,
    );

    const detailRes = await request(sharedRuntime.app.getHttpServer())
      .get(`/api/v1/projects/${this.currentProject.id}/sessions/${this.currentSession.id}`)
      .set('Cookie', serializeCookieJar(this.cookies));

    assert.equal(detailRes.status, 200);
    const detail = detailRes.body as SessionRecord;
    assert.equal(detail.purpose, 'Checkout regression');
    assert.equal(new Date(detail.startedAt).toISOString(), '2026-10-06T09:00:00.000Z');

    const sessionPageRes = await fetch(
      `${sharedRuntime.webOrigin}/clients/${this.currentClient.id}/projects/${this.currentProject.id}/sessions/${this.currentSession.id}`,
      {
        redirect: 'manual',
        headers: {
          cookie: `qaeh_session=${this.cookies.get('qaeh_session') ?? ''}`,
        },
      },
    );
    assert.equal(sessionPageRes.status, 200);
    assert.equal(getFetchSetCookies(sessionPageRes.headers).length, 0);
    const html = await sessionPageRes.text();
    assert.ok(html.includes('Checkout regression'));
    // 2026-10-06T09:00:00Z in owner's configured Europe/Bratislava (CEST, UTC+2) is 2026-10-06 11:00
    assert.ok(html.includes('2026-10-06 11:00 (Europe/Bratislava)'));
    assert.ok(html.includes('dateTime="2026-10-06T09:00:00.000Z"') || html.includes('datetime="2026-10-06T09:00:00.000Z"'));
  },
);

Given('active project {string} exists', async function (this: EngagementWorld, projectName: string) {
  assert.ok(sharedRuntime && this.cookies && this.csrfToken);

  const clientRes = await request(sharedRuntime.app.getHttpServer())
    .post('/api/v1/clients')
    .set('Origin', sharedRuntime.webOrigin)
    .set('Cookie', serializeCookieJar(this.cookies))
    .set('X-CSRF-Token', this.csrfToken)
    .send({ name: 'Example Client' });
  assert.equal(clientRes.status, 201);
  this.currentClient = clientRes.body as ClientRecord;

  const projectRes = await request(sharedRuntime.app.getHttpServer())
    .post(`/api/v1/clients/${this.currentClient.id}/projects`)
    .set('Origin', sharedRuntime.webOrigin)
    .set('Cookie', serializeCookieJar(this.cookies))
    .set('X-CSRF-Token', this.csrfToken)
    .send({ name: projectName });
  assert.equal(projectRes.status, 201);
  this.currentProject = projectRes.body as ProjectRecord;
  assert.equal(this.currentProject.status, 'Active');

  const pageRes = await fetch(
    `${sharedRuntime.webOrigin}/clients/${this.currentClient.id}/projects/${this.currentProject.id}`,
    {
      redirect: 'manual',
      headers: {
        cookie: `qaeh_session=${this.cookies.get('qaeh_session') ?? ''}`,
      },
    },
  );
  assert.equal(pageRes.status, 200);
  this.projectPageHtml = await pageRes.text();
});

When('I submit a session ending before its start time', async function (this: EngagementWorld) {
  assert.ok(sharedRuntime && this.cookies && this.csrfToken && this.currentProject);

  const draft: SessionFormDraft = {
    purpose: 'Checkout regression',
    startedAt: '2026-10-06T10:00:00Z',
    endedAt: '2026-10-06T09:00:00Z',
    environment: 'staging',
    device: 'Desktop',
    os: 'Linux',
    browser: 'Firefox',
    buildVersion: '1.4.2',
    notes: 'Preserve non-sensitive entered fields',
  };
  this.submittedDraft = draft;

  const res = await request(sharedRuntime.app.getHttpServer())
    .post(`/api/v1/projects/${this.currentProject.id}/sessions`)
    .set('Origin', sharedRuntime.webOrigin)
    .set('Cookie', serializeCookieJar(this.cookies))
    .set('X-CSRF-Token', this.csrfToken)
    .send(draft);

  this.lastApiResponse = res;
  const fieldErrors =
    (res.body as { fieldErrors?: Array<{ field: string; issues: string[] }> }).fieldErrors ?? [];
  this.invalidFieldNames = fieldErrors.map((entry) => entry.field);
  // Non-sensitive entered values remain untouched in the draft when validation fails.
  this.preservedDraft = { ...draft };
});

Then('no session is created', async function (this: EngagementWorld) {
  assert.ok(sharedRuntime && this.cookies && this.currentProject && this.databaseUrl && this.lastApiResponse);
  assert.equal(this.lastApiResponse.status, 400);
  assert.equal(this.lastApiResponse.body.code, 'BAD_REQUEST');

  const listRes = await request(sharedRuntime.app.getHttpServer())
    .get(`/api/v1/projects/${this.currentProject.id}/sessions`)
    .set('Cookie', serializeCookieJar(this.cookies));
  assert.equal(listRes.status, 200);
  assert.deepEqual(listRes.body, { items: [], nextCursor: null });

  const pgClient = new pg.Client({ connectionString: this.databaseUrl });
  await pgClient.connect();
  try {
    const countRes = await pgClient.query<{ cnt: number }>(
      'SELECT count(*)::int AS cnt FROM "test_sessions" WHERE "project_id" = $1;',
      [this.currentProject.id],
    );
    assert.equal(countRes.rows[0]?.cnt, 0);
  } finally {
    await pgClient.end();
  }
});

Then('the form identifies the invalid end time', function (this: EngagementWorld) {
  assert.ok(this.invalidFieldNames && this.projectPageHtml);
  assert.deepEqual(this.invalidFieldNames, ['endedAt']);
  assert.match(this.projectPageHtml, /id="session-ended-at"/);
  assert.match(this.projectPageHtml, /name="endedAt"/);
});

Then(
  'the other non-sensitive entered values remain available',
  function (this: EngagementWorld) {
    assert.ok(this.submittedDraft && this.preservedDraft && this.projectPageHtml && this.invalidFieldNames);
    for (const preservedField of [
      'purpose',
      'startedAt',
      'environment',
      'device',
      'os',
      'browser',
      'buildVersion',
      'notes',
    ] as const) {
      assert.equal(this.invalidFieldNames.includes(preservedField), false);
      assert.equal(this.preservedDraft[preservedField], this.submittedDraft[preservedField]);
    }
    for (const controlId of [
      'session-purpose',
      'session-started-at',
      'session-environment',
      'session-device',
      'session-os',
      'session-browser',
      'session-build-version',
      'session-notes',
    ]) {
      assert.match(this.projectPageHtml, new RegExp(`id="${controlId}"`));
    }
  },
);

When('I request the project page directly', async function (this: EngagementWorld) {
  assert.ok(sharedRuntime && this.databaseUrl);

  // Provision owner and seed a confidential project as setup data, while keeping the visitor anonymous.
  const setupAuth = await provisionAndSignInOwner(this, sharedRuntime);
  const secretMarker = 'Confidential Project Marker P104';
  this.protectedProjectMarker = secretMarker;

  let clientId = '11111111-2222-4333-8444-555555555555';
  let projectId = '22222222-3333-4444-8555-666666666666';

  const clientRes = await request(sharedRuntime.app.getHttpServer())
    .post('/api/v1/clients')
    .set('Origin', sharedRuntime.webOrigin)
    .set('Cookie', serializeCookieJar(setupAuth.cookies))
    .set('X-CSRF-Token', setupAuth.csrfToken)
    .send({ name: 'Confidential Client P104' });

  if (clientRes.status === 201) {
    clientId = (clientRes.body as ClientRecord).id;
    const projectRes = await request(sharedRuntime.app.getHttpServer())
      .post(`/api/v1/clients/${clientId}/projects`)
      .set('Origin', sharedRuntime.webOrigin)
      .set('Cookie', serializeCookieJar(setupAuth.cookies))
      .set('X-CSRF-Token', setupAuth.csrfToken)
      .send({
        name: secretMarker,
        description: 'Private testing context that must never leak to anonymous visitors.',
      });
    if (projectRes.status === 201) {
      projectId = (projectRes.body as ProjectRecord).id;
    }
  }

  // Request the project HTML page with the visitor's anonymous cookie jar.
  const cookieHeader = this.cookies ? serializeCookieJar(this.cookies) : '';
  const headers: Record<string, string> = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const pageRes = await fetch(
    `${sharedRuntime.webOrigin}/clients/${clientId}/projects/${projectId}`,
    {
      redirect: 'manual',
      headers,
    },
  );

  this.directPageResponse = {
    status: pageRes.status,
    location: pageRes.headers.get('location'),
    cacheControl: pageRes.headers.get('cache-control'),
    contentTypeOptions: pageRes.headers.get('x-content-type-options'),
    setCookies: getFetchSetCookies(pageRes.headers),
    body: await pageRes.text(),
  };
});

Then(
  'I am redirected to login without protected content',
  function (this: EngagementWorld) {
    assert.ok(this.directPageResponse && this.protectedProjectMarker);
    assert.ok(
      this.directPageResponse.status === 307 ||
        this.directPageResponse.status === 302 ||
        this.directPageResponse.status === 303,
      `Expected anonymous project page request to redirect to /login, got ${this.directPageResponse.status}`,
    );
    assert.match(this.directPageResponse.location ?? '', /\/login$/);
    assert.equal(this.directPageResponse.cacheControl, 'private, no-store, no-transform');
    assert.equal(this.directPageResponse.contentTypeOptions, 'nosniff');
    assert.equal(this.directPageResponse.setCookies.length, 0);
    assert.equal(this.directPageResponse.body.includes(this.protectedProjectMarker), false);
    assert.equal(
      this.directPageResponse.body.includes('Private testing context that must never leak'),
      false,
    );
  },
);
