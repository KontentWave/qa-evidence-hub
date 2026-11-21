import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateContainerTrivyReports } from './security-scan.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test('allows only individually reviewed postgres gosu CVEs and snakeoil key, rejecting any unlisted CVE, path, role, or expired entry', async () => {
  const policy = JSON.parse(
    await fs.readFile(path.join(scriptDir, 'container-scan-exceptions.json'), 'utf8'),
  );

  // 1. Reviewed postgres findings pass.
  const reviewedReport = {
    SchemaVersion: 2,
    Results: [
      {
        Target: 'usr/local/bin/gosu',
        Class: 'lang-pkgs',
        Type: 'gobinary',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2025-68121',
            PkgName: 'stdlib',
            InstalledVersion: 'v1.24.6',
            Severity: 'CRITICAL',
          },
        ],
      },
      {
        Target: '/etc/ssl/private/ssl-cert-snakeoil.key',
        Class: 'secret',
        Secrets: [
          {
            RuleID: 'private-key',
            Severity: 'HIGH',
            Title: 'Asymmetric Private Key',
            StartLine: 1,
          },
        ],
      },
    ],
  };

  const passRes = evaluateContainerTrivyReports({
    imageRole: 'postgres',
    libSecretReport: reviewedReport,
    osReport: { SchemaVersion: 2, Results: [] },
    exceptionsConfig: policy,
    nowIsoDate: '2026-11-21',
  });
  assert.equal(passRes.ok, true);
  assert.equal(passRes.matchedExceptions.length, 2);

  // 2. Same findings inside "api" fail immediately (imageRole isolation).
  const wrongRoleRes = evaluateContainerTrivyReports({
    imageRole: 'api',
    libSecretReport: reviewedReport,
    osReport: { SchemaVersion: 2, Results: [] },
    exceptionsConfig: policy,
    nowIsoDate: '2026-11-21',
  });
  assert.equal(wrongRoleRes.ok, false);
  assert.equal(wrongRoleRes.errors.length, 2);

  // 3. Unlisted CVE on gosu or CVE on another library inside postgres fails immediately.
  const unlistedCveRes = evaluateContainerTrivyReports({
    imageRole: 'postgres',
    libSecretReport: {
      SchemaVersion: 2,
      Results: [
        {
          Target: 'usr/local/bin/gosu',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2099-00001',
              PkgName: 'stdlib',
              InstalledVersion: 'v1.24.6',
              Severity: 'HIGH',
            },
          ],
        },
        {
          Target: 'opt/other-helper',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2025-68121',
              PkgName: 'stdlib',
              InstalledVersion: 'v1.24.6',
              Severity: 'CRITICAL',
            },
          ],
        },
      ],
    },
    osReport: { SchemaVersion: 2, Results: [] },
    exceptionsConfig: policy,
    nowIsoDate: '2026-11-21',
  });
  assert.equal(unlistedCveRes.ok, false);
  assert.equal(unlistedCveRes.errors.length, 2);

  // 4. Secret at any non-snakeoil path inside postgres fails without leaking secret Match value.
  const leakedSecretRes = evaluateContainerTrivyReports({
    imageRole: 'postgres',
    libSecretReport: {
      SchemaVersion: 2,
      Results: [
        {
          Target: '/var/lib/postgresql/leaked.pem',
          Secrets: [
            {
              RuleID: 'private-key',
              Severity: 'HIGH',
              Title: 'Asymmetric Private Key',
              StartLine: 1,
              Match: 'NEVER_PRINT_THIS_SECRET_VALUE',
            },
          ],
        },
      ],
    },
    osReport: { SchemaVersion: 2, Results: [] },
    exceptionsConfig: policy,
    nowIsoDate: '2026-11-21',
  });
  assert.equal(leakedSecretRes.ok, false);
  assert.match(leakedSecretRes.errors[0], /\/var\/lib\/postgresql\/leaked\.pem/);
  assert.doesNotMatch(leakedSecretRes.errors[0], /NEVER_PRINT_THIS_SECRET_VALUE/);

  // 5. Expired review window fails closed.
  const expiredRes = evaluateContainerTrivyReports({
    imageRole: 'postgres',
    libSecretReport: reviewedReport,
    osReport: { SchemaVersion: 2, Results: [] },
    exceptionsConfig: policy,
    nowIsoDate: '2027-03-01',
  });
  assert.equal(expiredRes.ok, false);
  assert.match(expiredRes.errors[0], /expired on 2027-02-19/);
});
