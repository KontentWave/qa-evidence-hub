import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const pg = requireFromApi('pg');

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDbScript = path.join(repoRoot, 'scripts/test-db.sh');

async function runScript(args, extraEnv = {}) {
  return execFileAsync('bash', [testDbScript, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

async function listMatchingDockerArtifacts(projectName) {
  const [containersOut, networksOut, volumesOut] = await Promise.all([
    execFileAsync('docker', ['ps', '-a', '--filter', `name=${projectName}`, '--format', '{{.Names}}']),
    execFileAsync('docker', ['network', 'ls', '--filter', `name=${projectName}`, '--format', '{{.Name}}']),
    execFileAsync('docker', ['volume', 'ls', '--filter', `name=${projectName}`, '--format', '{{.Name}}']),
  ]);

  const splitLines = (s) =>
    s
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  return {
    containers: splitLines(containersOut.stdout),
    networks: splitLines(networksOut.stdout),
    volumes: splitLines(volumesOut.stdout),
  };
}

test('refuses non-qaeh_test_ COMPOSE_PROJECT_NAME values across all commands', async () => {
  for (const subcommand of ['up', 'reset', 'down']) {
    await assert.rejects(
      () => runScript([subcommand], { COMPOSE_PROJECT_NAME: 'qaeh_prod_main' }),
      (err) => {
        assert.match(err.stderr, /COMPOSE_PROJECT_NAME.*qaeh_test_/);
        return true;
      },
    );
  }
});

test('isolates two concurrent TEST_RUN_ID instances, resets clean state, and tears down cleanly', async (t) => {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const runIdA = `isoa_${suffix}`;
  const runIdB = `isob_${suffix}`;
  const projA = `qaeh_test_${runIdA}`;
  const projB = `qaeh_test_${runIdB}`;

  t.after(async () => {
    await Promise.allSettled([
      runScript(['down'], { TEST_RUN_ID: runIdA }),
      runScript(['down'], { TEST_RUN_ID: runIdB }),
    ]);
  });

  const [upA, upB] = await Promise.all([
    runScript(['up'], { TEST_RUN_ID: runIdA }),
    runScript(['up'], { TEST_RUN_ID: runIdB }),
  ]);

  const urlA = upA.stdout.trim();
  const urlB = upB.stdout.trim();
  assert.match(urlA, /^postgresql:\/\//);
  assert.match(urlB, /^postgresql:\/\//);
  assert.notEqual(urlA, urlB, 'Concurrent test DB instances must bind distinct ephemeral ports');

  const clientA = new pg.Client({ connectionString: urlA });
  const clientB = new pg.Client({ connectionString: urlB });
  await Promise.all([clientA.connect(), clientB.connect()]);

  try {
    await clientA.query('CREATE TABLE isolation_probe (id text PRIMARY KEY);');
    await clientA.query('INSERT INTO isolation_probe VALUES ($1);', ['only-in-a']);

    const checkB = await clientB.query(
      "SELECT to_regclass('public.isolation_probe') AS table_exists;",
    );
    assert.equal(checkB.rows[0].table_exists, null, 'Run B must not see Run A schema mutations');
  } finally {
    await Promise.allSettled([clientA.end(), clientB.end()]);
  }

  await runScript(['reset'], { TEST_RUN_ID: runIdA });

  const clientAfterReset = new pg.Client({ connectionString: urlA });
  await clientAfterReset.connect();
  try {
    const probeAfter = await clientAfterReset.query(
      "SELECT to_regclass('public.isolation_probe') AS table_exists;",
    );
    assert.equal(probeAfter.rows[0].table_exists, null, 'reset must clear prior test tables');

    const migrationsAfter = await clientAfterReset.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name;',
    );
    assert.deepEqual(
      migrationsAfter.rows.map((r) => r.migration_name),
      [
        '20261118000000_baseline',
        '20261121000000_owner_and_auth_sessions',
        '20261123000000_engagement_context',
      ],
    );
  } finally {
    await clientAfterReset.end();
  }

  await Promise.all([
    runScript(['down'], { TEST_RUN_ID: runIdA }),
    runScript(['down'], { TEST_RUN_ID: runIdB }),
  ]);

  const [leftA, leftB] = await Promise.all([
    listMatchingDockerArtifacts(projA),
    listMatchingDockerArtifacts(projB),
  ]);
  assert.deepEqual(leftA, { containers: [], networks: [], volumes: [] });
  assert.deepEqual(leftB, { containers: [], networks: [], volumes: [] });
});

test('induced failure during test-db.sh run leaves zero leftover containers, networks, or volumes', async () => {
  const runId = `fail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const projectName = `qaeh_test_${runId}`;

  await assert.rejects(
    () => runScript(['run', 'sh', '-c', 'exit 42'], { TEST_RUN_ID: runId }),
    (err) => {
      assert.equal(err.code, 42);
      return true;
    },
  );

  const leftovers = await listMatchingDockerArtifacts(projectName);
  assert.deepEqual(leftovers, { containers: [], networks: [], volumes: [] });
});
