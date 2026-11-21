import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const securityScanScript = path.join(scriptDir, 'security-scan.mjs');
const staticSecurityScript = path.join(scriptDir, 'check-static-security.mjs');
const licenseCheckScript = path.join(scriptDir, 'check-licenses.mjs');
const coverageCheckScript = path.join(scriptDir, 'check-api-service-coverage.mjs');

test('1. Secret gate blocks a harmless dynamically generated credential fixture', { timeout: 120_000 }, async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-block-secret-'));
  try {
    // Construct synthetic GitHub PAT token at runtime so zero secret-shaped literals exist in git.
    const fakeToken = ['ghp', '_'.repeat(1), 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
    await fs.writeFile(
      path.join(tmpDir, 'synthetic-leak.env'),
      `SYNTHETIC_TEST_TOKEN=${fakeToken}\n`,
      'utf8',
    );

    await assert.rejects(
      () => execFileAsync(process.execPath, [securityScanScript, 'secrets', '--dir', tmpDir]),
      (err) => {
        assert.notEqual(err.code, 0, 'Expected Gitleaks secret gate to exit non-zero');
        return true;
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('2. Static security gate blocks both AST SAST (eval/$queryRawUnsafe) and IaC Dockerfile root misconfiguration', { timeout: 120_000 }, async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-block-static-'));
  try {
    // 2a. Code SAST fixture
    const codeDir = path.join(tmpDir, 'code');
    await fs.mkdir(codeDir, { recursive: true });
    await fs.writeFile(
      path.join(codeDir, 'unsafe.ts'),
      `export function runUnsafe(db: { $queryRawUnsafe: (q: string) => unknown }, q: string) {\n  eval(q);\n  return db.$queryRawUnsafe(q);\n}\n`,
      'utf8',
    );

    await assert.rejects(
      () => execFileAsync(process.execPath, [staticSecurityScript, '--code-only', codeDir]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr, /SAST-001/);
        assert.match(err.stderr, /SAST-003/);
        return true;
      },
    );

    // 2b. Trivy IaC/Dockerfile misconfiguration fixture (running explicitly as root -> DS002 HIGH)
    const iacDir = path.join(tmpDir, 'iac');
    await fs.mkdir(iacDir, { recursive: true });
    await fs.writeFile(
      path.join(iacDir, 'Dockerfile'),
      'FROM alpine:3.20\nUSER root\nCMD ["sh"]\n',
      'utf8',
    );

    await assert.rejects(
      () => execFileAsync(process.execPath, [staticSecurityScript, '--iac-only', iacDir]),
      (err) => {
        assert.notEqual(err.code, 0, 'Expected Trivy IaC config scan to block root Dockerfile');
        return true;
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('3. Dependency gate blocks unresolved HIGH/CRITICAL advisories in both audit report and lockfile scan', { timeout: 120_000 }, async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-block-deps-'));
  try {
    // 3a. pnpm audit JSON fixture with unresolved HIGH advisory
    const auditFixturePath = path.join(tmpDir, 'audit-high.json');
    await fs.writeFile(
      auditFixturePath,
      JSON.stringify({
        advisories: {
          999001: {
            id: 999001,
            github_advisory_id: 'GHSA-0000-0000-0001',
            module_name: 'synthetic-vulnerable-pkg',
            severity: 'high',
            patched_versions: '>=1.0.1',
            findings: [{ version: '1.0.0', dev: false }],
          },
        },
      }),
      'utf8',
    );

    await assert.rejects(
      () =>
        execFileAsync(process.execPath, [
          securityScanScript,
          'deps',
          '--json-input',
          auditFixturePath,
        ]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr ?? err.message, /GHSA-0000-0000-0001/);
        return true;
      },
    );

    // 3b. Real Trivy lockfile vulnerability scan on harmless package-lock.json pinning lodash 4.17.15
    const lockDir = path.join(tmpDir, 'lockfile');
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, 'package-lock.json'),
      JSON.stringify({
        name: 'harmless-vuln-fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: 'harmless-vuln-fixture',
            version: '1.0.0',
            dependencies: { lodash: '4.17.15' },
          },
          'node_modules/lodash': {
            version: '4.17.15',
            resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz',
          },
        },
      }),
      'utf8',
    );

    await assert.rejects(
      () =>
        execFileAsync(process.execPath, [
          securityScanScript,
          'deps',
          '--lockfile-dir',
          lockDir,
        ]),
      (err) => {
        assert.notEqual(err.code, 0, 'Expected Trivy fs dependency scan to block lodash@4.17.15');
        return true;
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('4. Container gate blocks OCI images containing vulnerable libraries or embedded secrets', { timeout: 120_000 }, async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-block-container-'));
  const fixtureTag = `qaeh-vuln-fixture:${Date.now().toString(36)}`;
  const secretTag = `qaeh-secret-fixture:${Date.now().toString(36)}`;
  try {
    // 4a. Vulnerable library manifest inside OCI image
    const vulnDir = path.join(tmpDir, 'vuln');
    await fs.mkdir(path.join(vulnDir, 'node_modules', 'lodash'), { recursive: true });
    await fs.writeFile(
      path.join(vulnDir, 'node_modules', 'lodash', 'package.json'),
      JSON.stringify({ name: 'lodash', version: '4.17.15' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(vulnDir, 'Dockerfile'),
      'FROM scratch\nCOPY node_modules /app/node_modules\n',
      'utf8',
    );

    await execFileAsync('docker', ['build', '-t', fixtureTag, vulnDir]);
    const tarPath = path.join(tmpDir, 'fixture-image.tar');
    await execFileAsync('docker', ['save', '-o', tarPath, fixtureTag]);

    await assert.rejects(
      () => execFileAsync(process.execPath, [securityScanScript, 'scan-image-tar', tarPath]),
      (err) => {
        assert.notEqual(err.code, 0, 'Expected Trivy container scan to reject vulnerable image');
        return true;
      },
    );

    // 4b. Embedded secret inside OCI image (constructed dynamically at runtime)
    const secretDir = path.join(tmpDir, 'secret');
    await fs.mkdir(secretDir, { recursive: true });
    const fakePat = ['ghp', '_', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'].join('');
    await fs.writeFile(path.join(secretDir, 'leaked.txt'), `TOKEN=${fakePat}\n`, 'utf8');
    await fs.writeFile(
      path.join(secretDir, 'Dockerfile'),
      'FROM scratch\nCOPY leaked.txt /etc/app/leaked.txt\n',
      'utf8',
    );

    await execFileAsync('docker', ['build', '-t', secretTag, secretDir]);
    const secretTarPath = path.join(tmpDir, 'secret-image.tar');
    await execFileAsync('docker', ['save', '-o', secretTarPath, secretTag]);

    await assert.rejects(
      () => execFileAsync(process.execPath, [securityScanScript, 'scan-image-tar', secretTarPath]),
      (err) => {
        assert.notEqual(err.code, 0, 'Expected Trivy container scan to reject embedded secret');
        assert.doesNotMatch(err.stderr ?? '', new RegExp(fakePat));
        return true;
      },
    );
  } finally {
    await execFileAsync('docker', ['rmi', '-f', fixtureTag, secretTag]).catch(() => undefined);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('5. License and API service coverage gates reject violating fixtures', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-block-lic-cov-'));
  try {
    const badLicPath = path.join(tmpDir, 'bad-licenses.json');
    await fs.writeFile(
      badLicPath,
      JSON.stringify({ 'AGPL-3.0-only': [{ name: 'agpl-lib', versions: ['1.0.0'] }] }),
      'utf8',
    );
    await assert.rejects(
      () => execFileAsync(process.execPath, [licenseCheckScript, '--input-json', badLicPath]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr, /AGPL-3\.0-only/);
        return true;
      },
    );

    const covDir = path.join(tmpDir, 'api-fixture');
    const svcFile = path.join(covDir, 'src', 'findings', 'findings.service.ts');
    await fs.mkdir(path.dirname(svcFile), { recursive: true });
    await fs.mkdir(path.join(covDir, 'coverage'), { recursive: true });
    await fs.writeFile(svcFile, 'export class FindingsService {}\n', 'utf8');
    await fs.writeFile(
      path.join(covDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: {},
        [svcFile]: {
          lines: { total: 10, covered: 7, pct: 70 },
          branches: { total: 10, covered: 7, pct: 70 },
        },
      }),
      'utf8',
    );
    await assert.rejects(
      () => execFileAsync(process.execPath, [coverageCheckScript, covDir]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr, /below required 80%/);
        return true;
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
