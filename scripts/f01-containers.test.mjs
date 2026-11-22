import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { verifyWorkspaceDigests } from './check-digests.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(repoRoot, 'compose.yaml');

async function getFreePort() {
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

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function execWithStdin(cmd, args, stdinText, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command ${cmd} exited with ${code}: ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin.end(stdinText);
  });
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function applySetCookiesToJar(jar, setCookieList) {
  for (const raw of setCookieList) {
    const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
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

function formatCookieJar(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function httpsRequestWithCa(urlString, { method = 'GET', headers = {}, body, ca }) {
  const url = new URL(urlString);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        ca,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const rawSetCookie = res.headers['set-cookie'] ?? [];
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            setCookies: Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie],
            text,
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

async function listProjectDockerResources(project) {
  const [cOut, nOut, vOut] = await Promise.all([
    execFileAsync('docker', ['ps', '-a', '--filter', `name=${project}`, '--format', '{{.Names}}']),
    execFileAsync('docker', ['network', 'ls', '--filter', `name=${project}`, '--format', '{{.Name}}']),
    execFileAsync('docker', ['volume', 'ls', '--filter', `name=${project}`, '--format', '{{.Name}}']),
  ]);
  const split = (s) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    containers: split(cOut.stdout),
    networks: split(nOut.stdout),
    volumes: split(vOut.stdout),
  };
}

test(
  'F01 production containers: non-root UID, digest boot behind Nginx, port isolation, header overwrite, and volume persistence',
  { timeout: 300_000 },
  async (t) => {
    const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const project = `qaeh_f01_${runId}`;
    const prebuiltApi = process.env.PREBUILT_API_IMAGE?.trim() ?? '';
    const prebuiltWeb = process.env.PREBUILT_WEB_IMAGE?.trim() ?? '';
    const usingPrebuilt = Boolean(prebuiltApi && prebuiltWeb);
    const apiTag = prebuiltApi || `qaeh-f01-api:${runId}`;
    const webTag = prebuiltWeb || `qaeh-f01-web:${runId}`;
    const probeContainerName = `${project}_header_probe`;
    const nginxPort = await getFreePort();
    const nginxHttpsPort = await getFreePort();
    const pgUser = 'qaeh_f01_user';
    const pgPassword = `qaeh_f01_pw_${runId}`;
    const pgDb = 'qaeh_f01_db';
    const ownerLogin = `owner.${runId}@synthetic.invalid`;
    const ownerPassword = `SyntheticF01Pass!2026#${runId}`;
    const tlsTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `qaeh-f01-tls-${runId}-`));

    let apiImageId = '';
    let webImageId = '';
    let currentAppOrigin = `http://127.0.0.1:${nginxPort}`;

    const composeEnv = () => ({
      ...process.env,
      COMPOSE_PROJECT_NAME: project,
      POSTGRES_USER: pgUser,
      POSTGRES_PASSWORD: pgPassword,
      POSTGRES_DB: pgDb,
      DATABASE_URL: `postgresql://${pgUser}:${pgPassword}@postgres:5432/${pgDb}?schema=public`,
      API_IMAGE: apiImageId,
      WEB_IMAGE: webImageId,
      NGINX_BIND_ADDRESS: '127.0.0.1',
      NGINX_HTTP_PORT: String(nginxPort),
      APP_ORIGIN: currentAppOrigin,
      TRUST_PROXY: 'nginx',
    });

    const compose = (args, extraFiles = []) =>
      execFileAsync(
        'docker',
        [
          'compose',
          '-p',
          project,
          '-f',
          composeFile,
          ...extraFiles.flatMap((f) => ['-f', f]),
          ...args,
        ],
        {
          cwd: repoRoot,
          env: composeEnv(),
          maxBuffer: 20 * 1024 * 1024,
        },
      );

    t.after(async () => {
      await execFileAsync('docker', ['rm', '-f', probeContainerName]).catch(() => undefined);
      if (apiImageId && webImageId) {
        await compose(['down', '-v', '--remove-orphans']).catch(() => undefined);
      } else {
        await execFileAsync('docker', ['compose', '-p', project, '-f', composeFile, 'down', '-v', '--remove-orphans'], {
          cwd: repoRoot,
          env: {
            ...composeEnv(),
            API_IMAGE: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            WEB_IMAGE: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          },
        }).catch(() => undefined);
      }
      if (!usingPrebuilt) {
        await execFileAsync('docker', ['rmi', '-f', apiTag, webTag]).catch(() => undefined);
      }
      await fs.rm(tlsTmpDir, { recursive: true, force: true }).catch(() => undefined);
    });

    // 1. Build production API and Web images from Dockerfiles (unless prebuilt image refs are supplied).
    if (!usingPrebuilt) {
      await Promise.all([
        execFileAsync(
          'docker',
          ['build', '--target', 'runner', '-f', 'apps/api/Dockerfile', '-t', apiTag, '.'],
          { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
        ),
        execFileAsync(
          'docker',
          ['build', '--target', 'runner', '-f', 'apps/web/Dockerfile', '-t', webTag, '.'],
          { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
        ),
      ]);
    }

    const [apiInspectOut, webInspectOut] = await Promise.all([
      execFileAsync('docker', ['image', 'inspect', apiTag, '--format', '{{.Id}}|{{.Size}}']),
      execFileAsync('docker', ['image', 'inspect', webTag, '--format', '{{.Id}}|{{.Size}}']),
    ]);

    const [parsedApiId, parsedApiSize] = apiInspectOut.stdout.trim().split('|');
    const [parsedWebId, parsedWebSize] = webInspectOut.stdout.trim().split('|');
    apiImageId = parsedApiId;
    webImageId = parsedWebId;

    assert.match(apiImageId, /^sha256:[0-9a-f]{64}$/);
    assert.match(webImageId, /^sha256:[0-9a-f]{64}$/);

    process.stdout.write(
      `[f01-metrics] api_image=${apiImageId} size=${formatMiB(Number(parsedApiSize))} (${parsedApiSize} bytes)\n`,
    );
    process.stdout.write(
      `[f01-metrics] web_image=${webImageId} size=${formatMiB(Number(parsedWebSize))} (${parsedWebSize} bytes)\n`,
    );

    const digestCheck = await verifyWorkspaceDigests({
      rootDir: repoRoot,
      env: composeEnv(),
      requireRuntimeEnv: true,
      allowLocalImageId: true,
    });
    assert.equal(digestCheck.ok, true, digestCheck.errors.join('; '));

    // 2. Verify non-root UID/GID (!= 0) in both production images.
    const [apiUidOut, webUidOut] = await Promise.all([
      execFileAsync('docker', ['run', '--rm', apiImageId, 'id', '-u']),
      execFileAsync('docker', ['run', '--rm', webImageId, 'id', '-u']),
    ]);
    const apiUid = Number.parseInt(apiUidOut.stdout.trim(), 10);
    const webUid = Number.parseInt(webUidOut.stdout.trim(), 10);
    assert.notEqual(apiUid, 0, 'API container must not run as root');
    assert.notEqual(webUid, 0, 'Web container must not run as root');
    assert.equal(apiUid, 1000);
    assert.equal(webUid, 1000);

    // 3. Boot full production stack behind Nginx in isolated Compose project.
    await compose(['up', '-d', '--wait']);

    // 4. Verify zero host-published ports on postgres, api, and web; only nginx publishes host port.
    for (const internalService of ['postgres', 'api', 'web']) {
      const cidOut = await compose(['ps', '-q', internalService]);
      const cid = cidOut.stdout.trim();
      assert.ok(cid, `Expected running container for ${internalService}`);

      const portsJsonOut = await execFileAsync('docker', [
        'inspect',
        cid,
        '--format',
        '{{json .NetworkSettings.Ports}}',
      ]);
      const portsMap = JSON.parse(portsJsonOut.stdout.trim());
      for (const [containerPort, hostBindings] of Object.entries(portsMap || {})) {
        assert.equal(
          hostBindings,
          null,
          `Service "${internalService}" must not publish ${containerPort} to host (got ${JSON.stringify(hostBindings)})`,
        );
      }
    }

    const nginxCid = (await compose(['ps', '-q', 'nginx'])).stdout.trim();
    const nginxPortsOut = await execFileAsync('docker', [
      'inspect',
      nginxCid,
      '--format',
      '{{json .NetworkSettings.Ports}}',
    ]);
    const nginxPorts = JSON.parse(nginxPortsOut.stdout.trim());
    assert.equal(nginxPorts['80/tcp']?.[0]?.HostPort, String(nginxPort));

    // 5. Apply Prisma migrations on internal data_net and provision synthetic single owner via operator CLI.
    const dataNetworkName = `${project}_data_net`;
    const internalDbUrl = `postgresql://${pgUser}:${pgPassword}@postgres:5432/${pgDb}?schema=public`;
    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        dataNetworkName,
        '-v',
        `${repoRoot}:/workspace:ro`,
        '-w',
        '/workspace/apps/api',
        '-e',
        `DATABASE_URL=${internalDbUrl}`,
        '-e',
        'HOME=/tmp',
        '-e',
        'JITI_FS_CACHE=0',
        apiImageId,
        './node_modules/.bin/prisma',
        'migrate',
        'deploy',
      ],
      { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
    );

    const provisionOut = await execWithStdin(
      'docker',
      [
        'compose',
        '-p',
        project,
        '-f',
        composeFile,
        'exec',
        '-T',
        'api',
        'node',
        '/app/scripts/provision-owner.ts',
        'provision',
        '--login',
        ownerLogin,
        '--password-stdin',
      ],
      `${ownerPassword}\n`,
      { cwd: repoRoot, env: composeEnv() },
    );
    assert.doesNotMatch(`${provisionOut.stdout}\n${provisionOut.stderr}`, new RegExp(ownerPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    // 5b. On Node 24.22.3 (production API image), verify AUTH_PASSWORD_SCRYPT_LN=17 and 18 fail validation cleanly,
    // while upper bound 16 initializes the API and verifies both fresh ln=16 hashes and CLI-provisioned hashes (including under ln=14).
    const apiNodeVersionOut = await execFileAsync('docker', ['run', '--rm', apiImageId, 'node', '--version']);
    assert.equal(apiNodeVersionOut.stdout.trim(), 'v24.22.3');

    for (const rejectedLn of ['17', '18']) {
      let rejectedExit = 0;
      let rejectedOutput = '';
      try {
        await execFileAsync('docker', [
          'run',
          '--rm',
          '-e',
          'NODE_ENV=production',
          '-e',
          'APP_ORIGIN=http://127.0.0.1:8080',
          '-e',
          `DATABASE_URL=${internalDbUrl}`,
          '-e',
          'TRUST_PROXY=nginx',
          '-e',
          `AUTH_PASSWORD_SCRYPT_LN=${rejectedLn}`,
          apiImageId,
          'node',
          'dist/main.js',
        ]);
      } catch (err) {
        rejectedExit = err.code ?? 1;
        rejectedOutput = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
      }
      assert.notEqual(rejectedExit, 0, `Expected AUTH_PASSWORD_SCRYPT_LN=${rejectedLn} to exit non-zero`);
      assert.match(rejectedOutput, /AUTH_PASSWORD_SCRYPT_LN.*14.*16/);
      assert.doesNotMatch(rejectedOutput, /memory limit exceeded/i);
    }

    const scryptRuntimeProbeScript = [
      'require("reflect-metadata");',
      'const assert = require("node:assert/strict");',
      'const { NestFactory } = require("@nestjs/core");',
      'const { AppModule } = require("./dist/app.module");',
      'const { configureApp } = require("./dist/app.setup");',
      'const { validateApiEnv } = require("./dist/config/env.validation");',
      'const { PasswordHasherService } = require("./dist/auth/password-hasher.service");',
      'const { AuthService } = require("./dist/auth/auth.service");',
      'const { PrismaService } = require("./dist/prisma/prisma.service");',
      '(async () => {',
      '  assert.equal(process.version, "v24.22.3");',
      '  const baseRaw = {',
      '    NODE_ENV: "production",',
      '    APP_ORIGIN: "http://127.0.0.1:8080",',
      '    DATABASE_URL: process.env.DATABASE_URL,',
      '    TRUST_PROXY: "nginx",',
      '  };',
      '  const env16 = validateApiEnv({ ...baseRaw, AUTH_PASSWORD_SCRYPT_LN: "16" });',
      '  const app16 = await NestFactory.create(AppModule.register(env16), { logger: false });',
      '  configureApp(app16, env16, { mountSwaggerUi: false });',
      '  await app16.init();',
      '  try {',
      '    const hasher16 = app16.get(PasswordHasherService);',
      '    const sampleHash = await hasher16.hashPassword("SyntheticUpperBound!2026#Node24223");',
      '    assert.match(sampleHash, /^\\$scrypt\\$ln=16,r=8,p=1\\$/);',
      '    assert.equal(await hasher16.verifyPassword("SyntheticUpperBound!2026#Node24223", sampleHash), true);',
      '    const login16 = await app16.get(AuthService).login({',
      '      loginIdentifier: process.env.OWNER_LOGIN,',
      '      password: process.env.OWNER_PASSWORD,',
      '      clientIp: "198.51.100.70",',
      '    });',
      '    assert.equal(login16.owner.loginIdentifier, process.env.OWNER_LOGIN);',
      '  } finally {',
      '    await app16.close();',
      '  }',
      '  const env14 = validateApiEnv({ ...baseRaw, AUTH_PASSWORD_SCRYPT_LN: "14" });',
      '  const app14 = await NestFactory.create(AppModule.register(env14), { logger: false });',
      '  configureApp(app14, env14, { mountSwaggerUi: false });',
      '  await app14.init();',
      '  try {',
      '    const login14 = await app14.get(AuthService).login({',
      '      loginIdentifier: process.env.OWNER_LOGIN,',
      '      password: process.env.OWNER_PASSWORD,',
      '      clientIp: "198.51.100.71",',
      '    });',
      '    assert.equal(login14.owner.loginIdentifier, process.env.OWNER_LOGIN);',
      '    await app14.get(PrismaService).client.authSession.deleteMany({});',
      '  } finally {',
      '    await app14.close();',
      '  }',
      '})().catch((err) => {',
      '  console.error(err);',
      '  process.exit(1);',
      '});',
    ].join('\n');

    await execFileAsync('docker', [
      'run',
      '--rm',
      '--network',
      dataNetworkName,
      '-e',
      `DATABASE_URL=${internalDbUrl}`,
      '-e',
      `OWNER_LOGIN=${ownerLogin}`,
      '-e',
      `OWNER_PASSWORD=${ownerPassword}`,
      apiImageId,
      'node',
      '-e',
      scryptRuntimeProbeScript,
    ]);

    // 6. Verify single-origin routing, anonymous denial, login/Ready/logout boundary, and static assets via Nginx.
    const baseOrigin = `http://127.0.0.1:${nginxPort}`;

    const healthRes = await fetch(`${baseOrigin}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { status: 'ok' });
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.doesNotMatch(healthRes.headers.get('server') ?? '', /nginx\//i);

    const readyRes = await fetch(`${baseOrigin}/api/v1/health/ready`);
    assert.equal(readyRes.status, 200);
    assert.deepEqual(await readyRes.json(), { status: 'ready' });
    assert.equal(readyRes.headers.get('cache-control'), 'no-store');
    assert.equal(readyRes.headers.get('x-content-type-options'), 'nosniff');

    const anonSessionRes = await fetch(`${baseOrigin}/api/v1/auth/session`);
    assert.equal(anonSessionRes.status, 401);
    assert.match(anonSessionRes.headers.get('cache-control') ?? '', /private/);
    assert.match(anonSessionRes.headers.get('cache-control') ?? '', /no-store/);

    // Anonymous GET / must redirect to /login without protected Ready content or Set-Cookie.
    const anonRootRes = await fetch(`${baseOrigin}/`, { redirect: 'manual' });
    assert.ok(
      anonRootRes.status === 307 || anonRootRes.status === 302 || anonRootRes.status === 303,
      `Expected anonymous / to redirect to /login, got ${anonRootRes.status}`,
    );
    assert.match(anonRootRes.headers.get('location') ?? '', /\/login$/);
    assert.equal(anonRootRes.headers.get('cache-control'), 'private, no-store, no-transform');
    assert.equal(anonRootRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(getSetCookieHeaders(anonRootRes.headers).length, 0);
    const anonRootBody = await anonRootRes.text();
    assert.doesNotMatch(anonRootBody, /System status:\s*(?:<!-- -->)?Ready/);

    const loginPageRes = await fetch(`${baseOrigin}/login`);
    assert.equal(loginPageRes.status, 200);
    assert.match(loginPageRes.headers.get('content-type') ?? '', /text\/html/i);
    assert.equal(loginPageRes.headers.get('cache-control'), 'private, no-store, no-transform');
    assert.equal(loginPageRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(getSetCookieHeaders(loginPageRes.headers).length, 0);
    const loginHtml = await loginPageRes.text();
    assert.match(loginHtml, /<html[^>]*lang="en"/i);
    assert.match(loginHtml, /<main[^>]*id="main-content"/i);
    assert.match(loginHtml, /Sign in to QA Evidence Hub/);

    const staticAssetMatch = /\/_next\/static\/[^"'<>\\\s)]+/.exec(loginHtml);
    assert.ok(staticAssetMatch, 'Expected Next.js HTML to reference at least one /_next/static/* asset');
    const staticRes = await fetch(`${baseOrigin}${staticAssetMatch[0]}`);
    assert.equal(staticRes.status, 200);
    assert.equal(staticRes.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(staticRes.headers.get('x-content-type-options'), 'nosniff');
    const staticBytes = await staticRes.arrayBuffer();
    assert.ok(staticBytes.byteLength > 0);

    // Sign in as provisioned owner through Nginx, verify Ready on / with read-only SSR, then sign out.
    const cookieJar = new Map();
    const csrfRes = await fetch(`${baseOrigin}/api/v1/auth/csrf`);
    assert.equal(csrfRes.status, 200);
    applySetCookiesToJar(cookieJar, getSetCookieHeaders(csrfRes.headers));
    const { csrfToken: preLoginCsrf } = await csrfRes.json();

    const loginApiRes = await fetch(`${baseOrigin}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseOrigin,
        cookie: formatCookieJar(cookieJar),
        'x-csrf-token': preLoginCsrf,
      },
      body: JSON.stringify({ loginIdentifier: ownerLogin, password: ownerPassword }),
    });
    assert.equal(loginApiRes.status, 200);
    const loginSetCookies = getSetCookieHeaders(loginApiRes.headers);
    const sessionSetCookie = loginSetCookies.find((c) => c.startsWith('qaeh_session='));
    assert.ok(sessionSetCookie, 'Expected qaeh_session Set-Cookie on login');
    assert.match(sessionSetCookie, /;\s*HttpOnly/i);
    assert.match(sessionSetCookie, /;\s*Secure/i);
    assert.match(sessionSetCookie, /;\s*SameSite=Lax/i);
    assert.match(sessionSetCookie, /;\s*Path=\//i);
    assert.doesNotMatch(sessionSetCookie, /;\s*Domain=/i);
    applySetCookiesToJar(cookieJar, loginSetCookies);
    const { csrfToken: authCsrf } = await loginApiRes.json();
    const activeSessionToken = cookieJar.get('qaeh_session');
    assert.ok(activeSessionToken);

    const authedRootRes = await fetch(`${baseOrigin}/`, {
      redirect: 'manual',
      headers: { cookie: `qaeh_session=${activeSessionToken}` },
    });
    assert.equal(authedRootRes.status, 200);
    assert.equal(authedRootRes.headers.get('cache-control'), 'private, no-store, no-transform');
    assert.equal(authedRootRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(
      getSetCookieHeaders(authedRootRes.headers).length,
      0,
      'SSR read on / must emit zero Set-Cookie headers',
    );
    const rootHtml = await authedRootRes.text();
    assert.match(rootHtml, /<h1>QA Evidence Hub<\/h1>/);
    assert.match(rootHtml, /System status:\s*(?:<!-- -->)?Ready/);
    assert.ok(rootHtml.includes(ownerLogin));

    const logoutApiRes = await fetch(`${baseOrigin}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseOrigin,
        cookie: `qaeh_session=${activeSessionToken}`,
        'x-csrf-token': authCsrf,
      },
      body: JSON.stringify({}),
    });
    assert.equal(logoutApiRes.status, 200);
    const logoutCookies = getSetCookieHeaders(logoutApiRes.headers);
    assert.ok(logoutCookies.some((c) => c.startsWith('qaeh_session=') && /Max-Age=0/i.test(c)));

    const postLogoutReplay = await fetch(`${baseOrigin}/`, {
      redirect: 'manual',
      headers: { cookie: `qaeh_session=${activeSessionToken}` },
    });
    assert.ok(postLogoutReplay.status === 307 || postLogoutReplay.status === 302);
    assert.match(postLogoutReplay.headers.get('location') ?? '', /\/login$/);

    // Default 1 MiB body limit check on ordinary routes.
    const oversizedDefaultPayload = Buffer.alloc(1536 * 1024, 0x61);
    const oversizedDefaultRes = await fetch(`${baseOrigin}/api/v1/health`, {
      method: 'POST',
      body: oversizedDefaultPayload,
      headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(oversizedDefaultRes.status, 413);

    // 7. Record observed idle container memory usage (RSS/WorkingSet via docker stats).
    const containerIds = (await compose(['ps', '-q']))
      .stdout.split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const statsOut = await execFileAsync('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}',
      ...containerIds,
    ]);
    for (const line of statsOut.stdout.trim().split(/\r?\n/)) {
      process.stdout.write(`[f01-metrics] container_idle=${line}\n`);
    }

    // 7. Verify synthetic PostgreSQL row survives container recreation without -v (no permanent business tables).
    const initialPgCid = (await compose(['ps', '-q', 'postgres'])).stdout.trim();
    await compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      pgUser,
      '-d',
      pgDb,
      '-c',
      "CREATE SCHEMA qaeh_f01_synthetic; CREATE TABLE qaeh_f01_synthetic.persistence_probe (id text PRIMARY KEY, marker text NOT NULL); INSERT INTO qaeh_f01_synthetic.persistence_probe (id, marker) VALUES ('f01', 'survived-container-recreation');",
    ]);

    await compose(['down']);
    await compose(['up', '-d', '--wait']);

    const recreatedPgCid = (await compose(['ps', '-q', 'postgres'])).stdout.trim();
    assert.notEqual(recreatedPgCid, initialPgCid, 'Postgres container must be newly recreated');

    const persistedOut = await compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-t',
      '-A',
      '-U',
      pgUser,
      '-d',
      pgDb,
      '-c',
      "SELECT marker FROM qaeh_f01_synthetic.persistence_probe WHERE id = 'f01';",
    ]);
    assert.equal(persistedOut.stdout.trim(), 'survived-container-recreation');

    const publicTablesOut = await compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-t',
      '-A',
      '-U',
      pgUser,
      '-d',
      pgDb,
      '-c',
      "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
    ]);
    assert.equal(publicTablesOut.stdout.trim(), '_prisma_migrations,auth_sessions,owners');

    // 7b. Verify Secure cookie issuance and transport enforcement through Nginx with test-only HTTPS.
    const certPath = path.join(tlsTmpDir, 'nginx-test.crt');
    const keyPath = path.join(tlsTmpDir, 'nginx-test.key');
    const tlsNginxConfPath = path.join(tlsTmpDir, 'tls-default.conf');
    const tlsComposeOverridePath = path.join(tlsTmpDir, 'compose.tls-override.yaml');

    await execFileAsync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ]);
    const caCertPem = await fs.readFile(certPath);
    const baseNginxConf = await fs.readFile(path.join(repoRoot, 'infra', 'nginx', 'default.conf'), 'utf8');
    const httpsNginxConf = baseNginxConf
      .replace(/^server_tokens off;\s*/m, '')
      .replace(
        '  listen 80;\n  server_name _;',
        [
          '  listen 443 ssl;',
          '  server_name _;',
          '  ssl_certificate /etc/nginx/tls/nginx-test.crt;',
          '  ssl_certificate_key /etc/nginx/tls/nginx-test.key;',
          '  ssl_protocols TLSv1.2 TLSv1.3;',
        ].join('\n'),
      );
    await fs.writeFile(tlsNginxConfPath, httpsNginxConf, 'utf8');

    const httpsOrigin = `https://127.0.0.1:${nginxHttpsPort}`;
    currentAppOrigin = httpsOrigin;
    await fs.writeFile(
      tlsComposeOverridePath,
      [
        'services:',
        '  nginx:',
        '    ports:',
        `      - "127.0.0.1:${nginxHttpsPort}:443"`,
        '    volumes:',
        `      - ${tlsNginxConfPath}:/etc/nginx/conf.d/tls-https.conf:ro`,
        `      - ${certPath}:/etc/nginx/tls/nginx-test.crt:ro`,
        `      - ${keyPath}:/etc/nginx/tls/nginx-test.key:ro`,
      ].join('\n') + '\n',
      'utf8',
    );

    await compose(['up', '-d', '--wait'], [tlsComposeOverridePath]);

    // Plain HTTP request with spoofed X-Forwarded-Proto: https must be overwritten by Nginx and rejected (403) when APP_ORIGIN is https://.
    const httpDowngradeAttempt = await fetch(`${baseOrigin}/api/v1/auth/csrf`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(httpDowngradeAttempt.status, 403);
    assert.equal(getSetCookieHeaders(httpDowngradeAttempt.headers).length, 0);

    // Real HTTPS through Nginx succeeds with verified CA and issues host-only HttpOnly; Secure; SameSite=Lax; Path=/ cookie.
    const httpsJar = new Map();
    const httpsCsrfRes = await httpsRequestWithCa(`${httpsOrigin}/api/v1/auth/csrf`, {
      ca: caCertPem,
    });
    assert.equal(httpsCsrfRes.status, 200);
    applySetCookiesToJar(httpsJar, httpsCsrfRes.setCookies);
    const { csrfToken: httpsPreCsrf } = JSON.parse(httpsCsrfRes.text);

    const httpsLoginBody = JSON.stringify({
      loginIdentifier: ownerLogin,
      password: ownerPassword,
    });
    const httpsLoginRes = await httpsRequestWithCa(`${httpsOrigin}/api/v1/auth/login`, {
      method: 'POST',
      ca: caCertPem,
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(httpsLoginBody)),
        origin: httpsOrigin,
        cookie: formatCookieJar(httpsJar),
        'x-csrf-token': httpsPreCsrf,
      },
      body: httpsLoginBody,
    });
    assert.equal(httpsLoginRes.status, 200);
    const httpsSessionSetCookie = httpsLoginRes.setCookies.find((c) => c.startsWith('qaeh_session='));
    assert.ok(httpsSessionSetCookie, 'Expected qaeh_session cookie over Nginx HTTPS');
    assert.match(httpsSessionSetCookie, /;\s*HttpOnly/i);
    assert.match(httpsSessionSetCookie, /;\s*Secure/i);
    assert.match(httpsSessionSetCookie, /;\s*SameSite=Lax/i);
    assert.match(httpsSessionSetCookie, /;\s*Path=\//i);
    assert.doesNotMatch(httpsSessionSetCookie, /;\s*Domain=/i);
    applySetCookiesToJar(httpsJar, httpsLoginRes.setCookies);
    const { csrfToken: httpsAuthCsrf } = JSON.parse(httpsLoginRes.text);

    const httpsRootRes = await httpsRequestWithCa(`${httpsOrigin}/`, {
      ca: caCertPem,
      headers: {
        cookie: `qaeh_session=${httpsJar.get('qaeh_session')}`,
      },
    });
    assert.equal(httpsRootRes.status, 200);
    assert.equal(httpsRootRes.setCookies.length, 0);
    assert.match(httpsRootRes.text, /System status:\s*(?:<!-- -->)?Ready/);

    const httpsLogoutPayload = '{}';
    const httpsLogoutRes = await httpsRequestWithCa(`${httpsOrigin}/api/v1/auth/logout`, {
      method: 'POST',
      ca: caCertPem,
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(httpsLogoutPayload)),
        origin: httpsOrigin,
        cookie: `qaeh_session=${httpsJar.get('qaeh_session')}`,
        'x-csrf-token': httpsAuthCsrf,
      },
      body: httpsLogoutPayload,
    });
    assert.equal(httpsLogoutRes.status, 200);
    assert.ok(httpsLogoutRes.setCookies.some((c) => c.startsWith('qaeh_session=') && /Max-Age=0/i.test(c) && /;\s*Secure/i.test(c)));

    const httpsAfterLogout = await httpsRequestWithCa(`${httpsOrigin}/`, {
      ca: caCertPem,
      headers: {
        cookie: `qaeh_session=${httpsJar.get('qaeh_session')}`,
      },
    });
    assert.ok(httpsAfterLogout.status === 307 || httpsAfterLogout.status === 302);
    assert.match(String(httpsAfterLogout.headers.location ?? ''), /\/login$/);

    // Restore base HTTP stack for the Nginx header-overwrite & upload streaming probe.
    currentAppOrigin = baseOrigin;
    await compose(['up', '-d', '--wait']);

    // 8. Verify Nginx overwrites spoofed X-Forwarded-For / X-Forwarded-Proto / X-Forwarded-Host
    // and enforces /api/v1/evidence HTTP/1.1 streaming + 11 MiB body limit.
    await compose(['stop', 'api']);
    const edgeNetworkName = `${project}_edge_net`;
    const echoScript = `
      const http = require('node:http');
      const server = http.createServer((req, res) => {
        let byteLength = 0;
        req.on('data', (chunk) => { byteLength += chunk.length; });
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            httpVersion: req.httpVersion,
            url: req.url,
            headers: req.headers,
            byteLength
          }));
        });
      });
      server.listen(3001, '0.0.0.0');
    `;
    await execFileAsync('docker', [
      'run',
      '-d',
      '--name',
      probeContainerName,
      '--network',
      edgeNetworkName,
      '--network-alias',
      'api',
      apiImageId,
      'node',
      '-e',
      echoScript,
    ]);
    await compose(['restart', 'nginx']);

    // Wait briefly for restarted nginx to accept connections.
    for (let i = 0; i < 20; i += 1) {
      try {
        const check = await fetch(`${baseOrigin}/api/v1/health`);
        if (check.ok) break;
      } catch {
        // retry
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    const spoofRes = await fetch(`${baseOrigin}/api/v1/health`, {
      headers: {
        'X-Forwarded-For': '203.0.113.195, 198.51.100.42',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'spoofed.attacker.invalid',
      },
    });
    assert.equal(spoofRes.status, 200);
    const spoofObserved = await spoofRes.json();
    assert.equal(spoofObserved.httpVersion, '1.1');
    assert.equal(spoofObserved.headers['x-forwarded-proto'], 'http');
    assert.equal(spoofObserved.headers['x-forwarded-host'], `127.0.0.1:${nginxPort}`);
    assert.doesNotMatch(spoofObserved.headers['x-forwarded-for'] ?? '', /203\.0\.113\.195/);
    assert.doesNotMatch(spoofObserved.headers['x-forwarded-for'] ?? '', /198\.51\.100\.42/);
    assert.ok((spoofObserved.headers['x-forwarded-for'] ?? '').length > 0);

    // 2 MiB body succeeds on /api/v1/evidence (up to 11 MiB allowed) while >11 MiB returns 413.
    const twoMiBBody = Buffer.alloc(2 * 1024 * 1024, 0x62);
    const evidencePassRes = await fetch(`${baseOrigin}/api/v1/evidence`, {
      method: 'POST',
      body: twoMiBBody,
      headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(evidencePassRes.status, 200);
    const evidenceObserved = await evidencePassRes.json();
    assert.equal(evidenceObserved.httpVersion, '1.1');
    assert.equal(evidenceObserved.byteLength, twoMiBBody.length);

    const twelveMiBBody = Buffer.alloc(12 * 1024 * 1024, 0x63);
    const evidenceTooLargeRes = await fetch(`${baseOrigin}/api/v1/evidence`, {
      method: 'POST',
      body: twelveMiBBody,
      headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(evidenceTooLargeRes.status, 413);

    // 9. Tear down explicitly and verify zero leftover containers, networks, or volumes.
    await execFileAsync('docker', ['rm', '-f', probeContainerName]);
    await compose(['down', '-v', '--remove-orphans']);

    const leftovers = await listProjectDockerResources(project);
    assert.deepEqual(leftovers, { containers: [], networks: [], volumes: [] });
  },
);
