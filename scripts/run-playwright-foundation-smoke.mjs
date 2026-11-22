import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(repoRoot, 'compose.yaml');
const reportFile = path.join(repoRoot, 'test-results', 'playwright-foundation.json');

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

function countPassedPlaywrightSpecs(suite) {
  let executed = 0;
  let passed = 0;
  for (const spec of suite?.specs ?? []) {
    for (const testCase of spec?.tests ?? []) {
      executed += 1;
      if (testCase.status === 'expected') {
        passed += 1;
      }
    }
  }
  for (const child of suite?.suites ?? []) {
    const childCounts = countPassedPlaywrightSpecs(child);
    executed += childCounts.executed;
    passed += childCounts.passed;
  }
  return { executed, passed };
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

async function runPlaywrightAgainstOrigin(baseOrigin, extraEnv = {}) {
  await fs.rm(reportFile, { force: true });
  await execFileAsync('pnpm', ['exec', 'playwright', 'test'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...extraEnv,
      PLAYWRIGHT_BASE_URL: baseOrigin,
    },
    maxBuffer: 20 * 1024 * 1024,
  });

  const rawReport = await fs.readFile(reportFile, 'utf8');
  const parsed = JSON.parse(rawReport);
  let totalExecuted = 0;
  let totalPassed = 0;
  for (const rootSuite of parsed.suites ?? []) {
    const counts = countPassedPlaywrightSpecs(rootSuite);
    totalExecuted += counts.executed;
    totalPassed += counts.passed;
  }

  if (totalExecuted === 0 || totalPassed !== totalExecuted) {
    throw new Error(
      `Playwright Foundation smoke gate requires >= 1 executed passing test (observed executed=${totalExecuted}, passed=${totalPassed})`,
    );
  }

  process.stdout.write(
    `Playwright Foundation smoke verified against ${baseOrigin}: ${totalPassed}/${totalExecuted} passed.\n`,
  );
}

async function main() {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    await runPlaywrightAgainstOrigin(process.env.PLAYWRIGHT_BASE_URL);
    return;
  }

  const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const project = `qaeh_pw_${runId}`;
  const prebuiltApi = process.env.PREBUILT_API_IMAGE?.trim() ?? '';
  const prebuiltWeb = process.env.PREBUILT_WEB_IMAGE?.trim() ?? '';
  const usingPrebuilt = Boolean(prebuiltApi && prebuiltWeb);
  const apiTag = prebuiltApi || `qaeh-pw-api:${runId}`;
  const webTag = prebuiltWeb || `qaeh-pw-web:${runId}`;
  const nginxPort = await getFreePort();
  const pgUser = 'qaeh_pw_user';
  const pgPassword = `qaeh_pw_${runId}`;
  const pgDb = 'qaeh_pw_db';
  const ownerLogin = `owner.pw.${runId}@synthetic.invalid`;
  const ownerPassword = `SyntheticPlaywrightPass!2026#${runId}`;
  const baseOrigin = `http://127.0.0.1:${nginxPort}`;
  const internalDbUrl = `postgresql://${pgUser}:${pgPassword}@postgres:5432/${pgDb}?schema=public`;

  let apiImageId = '';
  let webImageId = '';

  const composeEnv = () => ({
    ...process.env,
    COMPOSE_PROJECT_NAME: project,
    POSTGRES_USER: pgUser,
    POSTGRES_PASSWORD: pgPassword,
    POSTGRES_DB: pgDb,
    DATABASE_URL: internalDbUrl,
    API_IMAGE: apiImageId || 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    WEB_IMAGE: webImageId || 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    NGINX_BIND_ADDRESS: '127.0.0.1',
    NGINX_HTTP_PORT: String(nginxPort),
    APP_ORIGIN: baseOrigin,
    TRUST_PROXY: 'nginx',
  });

  const compose = (args) =>
    execFileAsync('docker', ['compose', '-p', project, '-f', composeFile, ...args], {
      cwd: repoRoot,
      env: composeEnv(),
      maxBuffer: 20 * 1024 * 1024,
    });

  try {
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
      execFileAsync('docker', ['image', 'inspect', apiTag, '--format', '{{.Id}}']),
      execFileAsync('docker', ['image', 'inspect', webTag, '--format', '{{.Id}}']),
    ]);
    apiImageId = apiInspectOut.stdout.trim();
    webImageId = webInspectOut.stdout.trim();
    assert.match(apiImageId, /^sha256:[0-9a-f]{64}$/);
    assert.match(webImageId, /^sha256:[0-9a-f]{64}$/);

    await compose(['up', '-d', '--wait']);

    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        `${project}_data_net`,
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

    await execWithStdin(
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

    await runPlaywrightAgainstOrigin(baseOrigin, {
      E2E_OWNER_LOGIN: ownerLogin,
      E2E_OWNER_PASSWORD: ownerPassword,
    });
  } finally {
    await compose(['down', '-v', '--remove-orphans']).catch(() => undefined);
    if (!usingPrebuilt) {
      await execFileAsync('docker', ['rmi', '-f', apiTag, webTag]).catch(() => undefined);
    }
  }
}

await main();
