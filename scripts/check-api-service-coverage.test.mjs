import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { evaluateApiServiceCoverage } from './check-api-service-coverage.mjs';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const gateScript = path.join(scriptDir, 'check-api-service-coverage.mjs');
const vitestBin = path.join(repoRoot, 'apps', 'api', 'node_modules', '.bin', 'vitest');

test('reports N/A when zero eligible auth/domain service files exist', async () => {
  const tmpApi = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-cov-na-'));
  try {
    await fs.mkdir(path.join(tmpApi, 'src', 'health'), { recursive: true });
    await fs.writeFile(
      path.join(tmpApi, 'src', 'health', 'health.service.ts'),
      'export class HealthService {}\n',
      'utf8',
    );
    // Excluded controller/dto/module files inside auth/ do not count as domain service logic.
    await fs.mkdir(path.join(tmpApi, 'src', 'auth'), { recursive: true });
    await fs.writeFile(
      path.join(tmpApi, 'src', 'auth', 'auth.controller.ts'),
      'export class AuthController {}\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpApi, 'src', 'auth', 'login.dto.ts'),
      'export class LoginDto {}\n',
      'utf8',
    );

    const res = await evaluateApiServiceCoverage({ apiDir: tmpApi });
    assert.equal(res.ok, true);
    assert.equal(res.status, 'N/A');
    assert.equal(res.linePct, null);
    assert.equal(res.branchPct, null);
    assert.match(res.message, /N\/A/);
  } finally {
    await fs.rm(tmpApi, { recursive: true, force: true });
  }
});

test('rejects below-threshold line or branch coverage and unexecuted eligible files', async () => {
  const tmpApi = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-cov-unit-'));
  try {
    const authServicePath = path.join(tmpApi, 'src', 'auth', 'auth.service.ts');
    await fs.mkdir(path.dirname(authServicePath), { recursive: true });
    await fs.writeFile(authServicePath, 'export function verify() { return true; }\n', 'utf8');
    await fs.mkdir(path.join(tmpApi, 'coverage'), { recursive: true });

    // Case 1: unexecuted file omitted from coverage-summary.json
    const summaryPath = path.join(tmpApi, 'coverage', 'coverage-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify({ total: {} }), 'utf8');
    const missingRes = await evaluateApiServiceCoverage({ apiDir: tmpApi });
    assert.equal(missingRes.ok, false);
    assert.match(missingRes.errors[0], /missing from coverage-summary\.json/);

    // Case 2: line coverage >= 80% but branch coverage < 80% (75%)
    await fs.writeFile(
      summaryPath,
      JSON.stringify({
        total: {},
        [authServicePath]: {
          lines: { total: 20, covered: 18, pct: 90 },
          branches: { total: 4, covered: 3, pct: 75 },
        },
      }),
      'utf8',
    );
    const lowBranchRes = await evaluateApiServiceCoverage({ apiDir: tmpApi });
    assert.equal(lowBranchRes.ok, false);
    assert.equal(lowBranchRes.status, 'FAIL');
    assert.ok(lowBranchRes.errors.some((e) => /branch coverage 75% is below required 80%/.test(e)));

    // Case 3: both lines >= 80% and branches >= 80%
    await fs.writeFile(
      summaryPath,
      JSON.stringify({
        total: {},
        [authServicePath]: {
          lines: { total: 20, covered: 17, pct: 85 },
          branches: { total: 5, covered: 4, pct: 80 },
        },
      }),
      'utf8',
    );
    const passRes = await evaluateApiServiceCoverage({ apiDir: tmpApi });
    assert.equal(passRes.ok, true);
    assert.equal(passRes.status, 'PASS');
  } finally {
    await fs.rm(tmpApi, { recursive: true, force: true });
  }
});

test('end-to-end V8 coverage run rejects a real below-threshold auth service fixture via CLI', async () => {
  const tmpApi = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-cov-e2e-'));
  try {
    await fs.mkdir(path.join(tmpApi, 'src', 'auth'), { recursive: true });
    await fs.writeFile(
      path.join(tmpApi, 'vitest.fixture.config.mjs'),
      `export default {
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['json-summary'],
      include: ['src/auth/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
    },
  },
};\n`,
      'utf8',
    );

    await fs.writeFile(
      path.join(tmpApi, 'src', 'auth', 'session-policy.service.ts'),
      `export function evaluateSessionAccess(input: {
  hasCookie: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  csrfValid: boolean;
}): string {
  if (!input.hasCookie) {
    return 'anonymous';
  }
  if (input.isExpired) {
    const reason = 'session_expired';
    return reason;
  }
  if (input.isRevoked) {
    const reason = 'session_revoked';
    return reason;
  }
  if (!input.csrfValid) {
    const reason = 'csrf_invalid';
    return reason;
  }
  return 'authorized';
}
`,
      'utf8',
    );

    // Spec exercises only 1 path ('anonymous'), leaving both lines and branches well below 80%.
    await fs.writeFile(
      path.join(tmpApi, 'src', 'auth', 'session-policy.service.spec.ts'),
      `import { describe, expect, it } from 'vitest';
import { evaluateSessionAccess } from './session-policy.service';

describe('below-threshold fixture', () => {
  it('checks only the anonymous path', () => {
    expect(
      evaluateSessionAccess({
        hasCookie: false,
        isExpired: false,
        isRevoked: false,
        csrfValid: false,
      }),
    ).toBe('anonymous');
  });
});
`,
      'utf8',
    );

    await execFileAsync(
      vitestBin,
      ['run', '--config', 'vitest.fixture.config.mjs', '--coverage'],
      { cwd: tmpApi, env: { ...process.env, NODE_PATH: path.join(repoRoot, 'apps', 'api', 'node_modules') } },
    );

    await assert.rejects(
      () => execFileAsync(process.execPath, [gateScript, tmpApi]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr, /Service coverage \(API auth\/domain\): FAIL/);
        assert.match(err.stderr, /below required 80%/);
        return true;
      },
    );
  } finally {
    await fs.rm(tmpApi, { recursive: true, force: true });
  }
});
