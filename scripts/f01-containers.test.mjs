import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import net from 'node:net';
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
    const pgUser = 'qaeh_f01_user';
    const pgPassword = `qaeh_f01_pw_${runId}`;
    const pgDb = 'qaeh_f01_db';

    let apiImageId = '';
    let webImageId = '';

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
    });

    const compose = (args) =>
      execFileAsync('docker', ['compose', '-p', project, '-f', composeFile, ...args], {
        cwd: repoRoot,
        env: composeEnv(),
        maxBuffer: 20 * 1024 * 1024,
      });

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

    // 5. Verify single-origin routing, security headers, and static asset serving through Nginx.
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

    const rootRes = await fetch(`${baseOrigin}/`);
    assert.equal(rootRes.status, 200);
    assert.match(rootRes.headers.get('content-type') ?? '', /text\/html/i);
    assert.equal(rootRes.headers.get('cache-control'), 'private, no-store, no-transform');
    assert.equal(rootRes.headers.get('x-content-type-options'), 'nosniff');
    const rootHtml = await rootRes.text();
    assert.match(rootHtml, /<html[^>]*lang="en"/i);
    assert.match(rootHtml, /<main[^>]*id="main-content"/i);
    assert.match(rootHtml, /<h1>QA Evidence Hub<\/h1>/);
    assert.match(rootHtml, /System status:\s*(?:<!-- -->)?Ready/);

    const staticAssetMatch = /\/_next\/static\/[^"'<>\\\s)]+/.exec(rootHtml);
    assert.ok(staticAssetMatch, 'Expected Next.js HTML to reference at least one /_next/static/* asset');
    const staticRes = await fetch(`${baseOrigin}${staticAssetMatch[0]}`);
    assert.equal(staticRes.status, 200);
    assert.equal(staticRes.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(staticRes.headers.get('x-content-type-options'), 'nosniff');
    const staticBytes = await staticRes.arrayBuffer();
    assert.ok(staticBytes.byteLength > 0);

    // Default 1 MiB body limit check on ordinary routes.
    const oversizedDefaultPayload = Buffer.alloc(1536 * 1024, 0x61);
    const oversizedDefaultRes = await fetch(`${baseOrigin}/api/v1/health`, {
      method: 'POST',
      body: oversizedDefaultPayload,
      headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(oversizedDefaultRes.status, 413);

    // 6. Record observed idle container memory usage (RSS/WorkingSet via docker stats).
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
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
    ]);
    assert.equal(publicTablesOut.stdout.trim(), '0');

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
