import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { validateApiEnv } from '../src/config/env.validation';

interface PrivateAccessWorld {
  app?: NestExpressApplication;
  databaseUrl?: string;
  origin?: string;
  ownerLogin?: string;
  ownerPassword?: string;
  cookies?: Map<string, string>;
  csrfToken?: string;
  lastResponse?: Response;
  registrationResponses?: Response[];
}

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PROVISION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'provision-owner.ts');

function updateCookieJar(jar: Map<string, string>, setCookieHeader: string | string[] | undefined): void {
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
    const isCleared =
      value === '' ||
      attrs.some((attr) => /^max-age=0$/i.test(attr));
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

Before({ tags: '@P1-03' }, async function (this: PrivateAccessWorld) {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for @P1-03 BDD scenarios');
  this.databaseUrl = process.env.DATABASE_URL;
  this.origin = 'http://127.0.0.1:8080';
  this.ownerLogin = 'owner.bdd@synthetic.invalid';
  this.ownerPassword = 'SyntheticOwnerPass!2026#Bdd';
  this.cookies = new Map();

  const client = new pg.Client({ connectionString: this.databaseUrl });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE "auth_sessions", "owners" CASCADE;');
  } finally {
    await client.end();
  }

  const env = validateApiEnv({
    NODE_ENV: 'test',
    DATABASE_URL: this.databaseUrl,
    DATABASE_POOL_MAX: '5',
    POSTGRES_MAX_CONNECTIONS: '30',
    DATABASE_STATEMENT_TIMEOUT_MS: '5000',
    TRUST_PROXY: '127.0.0.1/32,::1/128',
    APP_ORIGIN: this.origin,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env, { mountSwaggerUi: false });
  await app.init();
  this.app = app;
});

After({ tags: '@P1-03' }, async function (this: PrivateAccessWorld) {
  if (this.app) {
    await this.app.close();
    this.app = undefined;
  }
});

Given('the owner account has been provisioned', async function (this: PrivateAccessWorld) {
  assert.ok(this.databaseUrl && this.ownerLogin && this.ownerPassword);
  const res = await runProvisionCli(
    ['provision', '--login', this.ownerLogin, '--password-stdin'],
    `${this.ownerPassword}\n`,
    this.databaseUrl,
  );
  assert.equal(res.code, 0, `Expected provision-owner.ts to succeed: ${res.stderr}`);
});

Given('I am not signed in', function (this: PrivateAccessWorld) {
  this.cookies = new Map();
  this.csrfToken = undefined;
});

When('an anonymous visitor attempts to register an account', async function (this: PrivateAccessWorld) {
  assert.ok(this.app && this.origin);
  const candidateRoutes = [
    '/api/v1/auth/register',
    '/api/v1/auth/signup',
    '/api/v1/users',
    '/api/v1/owners',
  ];
  this.registrationResponses = [];
  for (const route of candidateRoutes) {
    const res = await request(this.app.getHttpServer())
      .post(route)
      .set('Origin', this.origin)
      .send({
        loginIdentifier: 'intruder@synthetic.invalid',
        password: 'IntruderPassword!2026#Test',
      });
    this.registrationResponses.push(res);
  }
});

Then('no public registration operation is available', function (this: PrivateAccessWorld) {
  assert.ok(this.registrationResponses && this.registrationResponses.length > 0);
  for (const res of this.registrationResponses) {
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  }
});

Then('no additional account is created', async function (this: PrivateAccessWorld) {
  assert.ok(this.databaseUrl && this.ownerLogin);
  const client = new pg.Client({ connectionString: this.databaseUrl });
  await client.connect();
  try {
    const owners = await client.query<{ login_identifier: string }>(
      'SELECT login_identifier FROM "owners";',
    );
    assert.equal(owners.rows.length, 1);
    assert.equal(owners.rows[0]?.login_identifier, this.ownerLogin);
  } finally {
    await client.end();
  }
});

When('I request the current owner session', async function (this: PrivateAccessWorld) {
  assert.ok(this.app && this.cookies);
  const req = request(this.app.getHttpServer()).get('/api/v1/auth/session');
  const cookieHeader = serializeCookieJar(this.cookies);
  if (cookieHeader) {
    req.set('Cookie', cookieHeader);
  }
  this.lastResponse = await req;
});

Then('I receive an unauthorized response without owner data', function (this: PrivateAccessWorld) {
  assert.ok(this.lastResponse);
  assert.equal(this.lastResponse.status, 401);
  assert.deepEqual(this.lastResponse.body, {
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });
});

When(
  'I sign in as the provisioned owner with a valid pre-login anti-CSRF token',
  async function (this: PrivateAccessWorld) {
    assert.ok(this.app && this.origin && this.ownerLogin && this.ownerPassword && this.cookies);

    const csrfRes = await request(this.app.getHttpServer()).get('/api/v1/auth/csrf');
    assert.equal(csrfRes.status, 200);
    updateCookieJar(this.cookies, csrfRes.headers['set-cookie']);
    const preLoginCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;

    const loginRes = await request(this.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', this.origin)
      .set('Cookie', serializeCookieJar(this.cookies))
      .set('X-CSRF-Token', preLoginCsrf)
      .send({
        loginIdentifier: this.ownerLogin,
        password: this.ownerPassword,
      });

    this.lastResponse = loginRes;
    updateCookieJar(this.cookies, loginRes.headers['set-cookie']);
    this.csrfToken = (loginRes.body as { csrfToken?: string }).csrfToken;
  },
);

Then('my owner session is active', async function (this: PrivateAccessWorld) {
  assert.ok(this.app && this.lastResponse && this.cookies && this.ownerLogin);
  assert.equal(this.lastResponse.status, 200);
  assert.equal(this.lastResponse.body.authenticated, true);
  assert.equal(this.lastResponse.body.owner.loginIdentifier, this.ownerLogin);

  const sessionRes = await request(this.app.getHttpServer())
    .get('/api/v1/auth/session')
    .set('Cookie', serializeCookieJar(this.cookies));
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.authenticated, true);
  assert.equal(sessionRes.body.owner.loginIdentifier, this.ownerLogin);
  assert.equal(sessionRes.headers['set-cookie'], undefined);
});

When(
  'I sign out with a valid authenticated anti-CSRF token',
  async function (this: PrivateAccessWorld) {
    assert.ok(this.app && this.origin && this.cookies && this.csrfToken);
    const logoutRes = await request(this.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', this.origin)
      .set('Cookie', serializeCookieJar(this.cookies))
      .set('X-CSRF-Token', this.csrfToken)
      .send({});

    this.lastResponse = logoutRes;
    updateCookieJar(this.cookies, logoutRes.headers['set-cookie']);
  },
);

Then(
  'my session cookie is cleared and the session is invalidated',
  async function (this: PrivateAccessWorld) {
    assert.ok(this.app && this.lastResponse && this.cookies);
    assert.equal(this.lastResponse.status, 200);
    assert.deepEqual(this.lastResponse.body, { authenticated: false });
    assert.equal(this.cookies.has('qaeh_session'), false);

    const checkRes = await request(this.app.getHttpServer()).get('/api/v1/auth/session');
    assert.equal(checkRes.status, 401);
  },
);

When(
  'I attempt to sign in with an incorrect password and a valid pre-login anti-CSRF token',
  async function (this: PrivateAccessWorld) {
    assert.ok(this.app && this.origin && this.ownerLogin && this.cookies);

    const csrfRes = await request(this.app.getHttpServer()).get('/api/v1/auth/csrf');
    assert.equal(csrfRes.status, 200);
    updateCookieJar(this.cookies, csrfRes.headers['set-cookie']);
    const preLoginCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;

    const loginRes = await request(this.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', this.origin)
      .set('Cookie', serializeCookieJar(this.cookies))
      .set('X-CSRF-Token', preLoginCsrf)
      .send({
        loginIdentifier: this.ownerLogin,
        password: 'WrongSyntheticPassword!2026#Invalid',
      });

    this.lastResponse = loginRes;
    updateCookieJar(this.cookies, loginRes.headers['set-cookie']);
  },
);

Then(
  'the login attempt is rejected generically without issuing a session',
  function (this: PrivateAccessWorld) {
    assert.ok(this.lastResponse && this.cookies);
    assert.equal(this.lastResponse.status, 401);
    assert.deepEqual(this.lastResponse.body, {
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
    assert.equal(this.cookies.has('qaeh_session'), false);
  },
);
