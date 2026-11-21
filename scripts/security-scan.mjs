import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseComposeServiceImages } from './check-digests.mjs';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

export const GITLEAKS_IMAGE =
  'ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';
export const TRIVY_IMAGE =
  'ghcr.io/aquasecurity/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb';
export const SYFT_IMAGE =
  'ghcr.io/anchore/syft:v1.57.2@sha256:e97e20b6e6d1699c60296b66ab337941724f9bd06ac279d893eda89601fc4b2a';

function getTrivyCacheDir() {
  return process.env.TRIVY_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'trivy');
}

export async function runSecretScan({ targetDir = repoRoot, scanGitHistory = true } = {}) {
  const absTarget = path.resolve(targetDir);
  if (!scanGitHistory) {
    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${absTarget}:/target:ro`,
        GITLEAKS_IMAGE,
        'dir',
        '/target',
        '--no-banner',
        '--redact',
        '--exit-code',
        '1',
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return;
  }

  // 1. Scan full Git commit history.
  await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${absTarget}:/target:ro`,
      GITLEAKS_IMAGE,
      'git',
      '/target',
      '--no-banner',
      '--redact',
      '--exit-code',
      '1',
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );

  // 2. Stage all tracked + non-ignored untracked repository files so gitignored local files
  // (.vscode, .env) and build outputs (.next, node_modules) are never read or falsely flagged.
  const stagedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-gitleaks-wt-'));
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: absTarget, maxBuffer: 20 * 1024 * 1024 },
    );
    const relFiles = stdout.split('\0').filter(Boolean);
    for (const relFile of relFiles) {
      const srcPath = path.join(absTarget, relFile);
      let stat;
      try {
        stat = await fs.stat(srcPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) {
        continue;
      }
      const destPath = path.join(stagedDir, relFile);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }

    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${stagedDir}:/target:ro`,
        GITLEAKS_IMAGE,
        'dir',
        '/target',
        '--no-banner',
        '--redact',
        '--exit-code',
        '1',
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
  } finally {
    await fs.rm(stagedDir, { recursive: true, force: true });
  }
}

export function evaluatePnpmAuditReport(auditJson, exceptionsConfig, nowIsoDate = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  const advisories = Object.values(auditJson?.advisories ?? {});
  const exceptions = Array.isArray(exceptionsConfig?.exceptions) ? exceptionsConfig.exceptions : [];

  for (const advisory of advisories) {
    const severity = String(advisory?.severity ?? '').toLowerCase();
    if (severity !== 'high' && severity !== 'critical') {
      continue;
    }

    const ghsaId = advisory?.github_advisory_id ?? String(advisory?.id ?? 'unknown');
    const moduleName = advisory?.module_name ?? 'unknown';
    const findings = Array.isArray(advisory?.findings) ? advisory.findings : [];
    const hasProdFinding = findings.some((f) => f?.dev === false);
    const patchedVersions = String(advisory?.patched_versions ?? '');
    const hasUpstreamPatch =
      patchedVersions.length > 0 &&
      patchedVersions !== '<0.0.0' &&
      !/^none$/i.test(patchedVersions);

    const matchedExc = exceptions.find(
      (exc) => exc.ghsaId === ghsaId && exc.package === moduleName,
    );

    if (!matchedExc) {
      errors.push(
        `Unresolved ${severity.toUpperCase()} dependency advisory ${ghsaId} in "${moduleName}" (patched: ${patchedVersions || 'none'})`,
      );
      continue;
    }

    if (hasProdFinding) {
      errors.push(
        `Exception for ${ghsaId} (${moduleName}) is rejected because package is reachable in production dependencies`,
      );
      continue;
    }

    if (hasUpstreamPatch) {
      errors.push(
        `Exception for ${ghsaId} (${moduleName}) is rejected because an upstream patched version exists (${patchedVersions})`,
      );
      continue;
    }

    if (!matchedExc.expiresOn || matchedExc.expiresOn < nowIsoDate) {
      errors.push(
        `Exception for ${ghsaId} (${moduleName}) expired on ${matchedExc.expiresOn ?? 'missing'}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    totalAdvisories: advisories.length,
    errors,
  };
}

export async function runDependencyVulnerabilityGate({
  auditJsonPath = null,
  lockfileDir = null,
  exceptionsPath = path.join(scriptDir, 'dependency-exceptions.json'),
} = {}) {
  const exceptionsConfig = JSON.parse(await fs.readFile(exceptionsPath, 'utf8'));

  if (lockfileDir) {
    const trivyCache = getTrivyCacheDir();
    await fs.mkdir(trivyCache, { recursive: true });
    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${path.resolve(lockfileDir)}:/target:ro`,
        '-v',
        `${trivyCache}:/root/.cache`,
        TRIVY_IMAGE,
        'fs',
        '--scanners',
        'vuln',
        '--severity',
        'HIGH,CRITICAL',
        '--exit-code',
        '1',
        '/target',
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return;
  }

  let auditJson;
  if (auditJsonPath) {
    auditJson = JSON.parse(await fs.readFile(auditJsonPath, 'utf8'));
  } else {
    let stdout;
    try {
      const res = await execFileAsync('pnpm', ['audit', '--json'], {
        cwd: repoRoot,
        maxBuffer: 20 * 1024 * 1024,
      });
      stdout = res.stdout;
    } catch (error) {
      // pnpm audit exits non-zero when advisories are present, emitting JSON on stdout.
      if (error.stdout) {
        stdout = error.stdout;
      } else {
        throw error;
      }
    }
    auditJson = JSON.parse(stdout);
  }

  const evaluation = evaluatePnpmAuditReport(auditJson, exceptionsConfig);
  if (!evaluation.ok) {
    const message = evaluation.errors.join('\n - ');
    throw new Error(`Dependency vulnerability gate FAILED:\n - ${message}`);
  }
}

function validateContainerExceptionEntry(exc, index, nowIsoDate) {
  const errs = [];
  const requiredStrings = [
    'imageRole',
    'kind',
    'target',
    'reviewedAt',
    'reviewedBy',
    'expiresOn',
    'docRef',
    'rationale',
  ];
  for (const field of requiredStrings) {
    if (typeof exc?.[field] !== 'string' || exc[field].trim().length === 0) {
      errs.push(`container-scan-exceptions[${index}]: missing required string "${field}"`);
    }
  }
  if (exc?.docRef && !exc.docRef.startsWith('.github/docs/runbook.md')) {
    errs.push(`container-scan-exceptions[${index}]: docRef must reference .github/docs/runbook.md`);
  }
  if (exc?.expiresOn && exc.expiresOn < nowIsoDate) {
    errs.push(
      `container-scan-exceptions[${index}] (${exc.imageRole} ${exc.target}): expired on ${exc.expiresOn}`,
    );
  }
  if (exc?.reviewedAt && exc?.expiresOn) {
    const revMs = Date.parse(`${exc.reviewedAt}T00:00:00Z`);
    const expMs = Date.parse(`${exc.expiresOn}T00:00:00Z`);
    const maxHorizonMs = 95 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(revMs) || !Number.isFinite(expMs) || expMs - revMs > maxHorizonMs) {
      errs.push(
        `container-scan-exceptions[${index}]: review window (${exc.reviewedAt} -> ${exc.expiresOn}) exceeds 95-day maximum`,
      );
    }
  }
  if (exc?.kind === 'vulnerability') {
    if (typeof exc.pkgName !== 'string' || !exc.pkgName) {
      errs.push(`container-scan-exceptions[${index}]: vulnerability exception requires pkgName`);
    }
    if (typeof exc.installedVersion !== 'string' || !exc.installedVersion) {
      errs.push(
        `container-scan-exceptions[${index}]: vulnerability exception requires installedVersion`,
      );
    }
    if (!Array.isArray(exc.vulnerabilityIds) || exc.vulnerabilityIds.length === 0) {
      errs.push(
        `container-scan-exceptions[${index}]: vulnerability exception requires non-empty vulnerabilityIds[]`,
      );
    }
  } else if (exc?.kind === 'secret') {
    if (typeof exc.ruleId !== 'string' || !exc.ruleId) {
      errs.push(`container-scan-exceptions[${index}]: secret exception requires ruleId`);
    }
  } else {
    errs.push(`container-scan-exceptions[${index}]: unsupported kind "${exc?.kind ?? ''}"`);
  }
  return errs;
}

export function evaluateContainerTrivyReports({
  imageRole,
  libSecretReport,
  osReport,
  exceptionsConfig,
  nowIsoDate = new Date().toISOString().slice(0, 10),
}) {
  const errors = [];
  if (!libSecretReport || typeof libSecretReport.SchemaVersion !== 'number') {
    return {
      ok: false,
      matchedExceptions: [],
      errors: [`[${imageRole}] invalid or missing Trivy library+secret JSON report`],
    };
  }
  if (!osReport || typeof osReport.SchemaVersion !== 'number') {
    return {
      ok: false,
      matchedExceptions: [],
      errors: [`[${imageRole}] invalid or missing Trivy OS JSON report`],
    };
  }

  const exceptions = Array.isArray(exceptionsConfig?.exceptions)
    ? exceptionsConfig.exceptions
    : [];
  exceptions.forEach((exc, idx) => {
    errors.push(...validateContainerExceptionEntry(exc, idx, nowIsoDate));
  });
  if (errors.length > 0) {
    return { ok: false, matchedExceptions: [], errors };
  }

  const matchedExceptions = [];

  function checkReportVulnerabilities(report, sourceLabel) {
    for (const res of report.Results ?? []) {
      const target = res?.Target ?? '<unknown-target>';
      for (const vuln of res?.Vulnerabilities ?? []) {
        const vulnId = vuln?.VulnerabilityID ?? '<unknown-id>';
        const pkgName = vuln?.PkgName ?? '<unknown-pkg>';
        const installedVersion = vuln?.InstalledVersion ?? '<unknown-ver>';
        const severity = vuln?.Severity ?? 'UNKNOWN';

        const matched = exceptions.find(
          (exc) =>
            exc.kind === 'vulnerability' &&
            exc.imageRole === imageRole &&
            exc.target === target &&
            exc.pkgName === pkgName &&
            exc.installedVersion === installedVersion &&
            exc.vulnerabilityIds.includes(vulnId),
        );

        if (matched) {
          matchedExceptions.push({
            imageRole,
            kind: 'vulnerability',
            target,
            id: vulnId,
            pkg: `${pkgName}@${installedVersion}`,
          });
        } else {
          errors.push(
            `[${imageRole}] Unreviewed ${severity} ${sourceLabel} vulnerability ${vulnId} in ${target} (${pkgName}@${installedVersion}, fixed: ${vuln?.FixedVersion || 'unfixed'})`,
          );
        }
      }
    }
  }

  checkReportVulnerabilities(libSecretReport, 'library');
  checkReportVulnerabilities(osReport, 'os');

  for (const res of libSecretReport.Results ?? []) {
    const target = res?.Target ?? '<unknown-target>';
    for (const secret of res?.Secrets ?? []) {
      const ruleId = secret?.RuleID ?? '<unknown-rule>';
      const severity = secret?.Severity ?? 'HIGH';
      const matched = exceptions.find(
        (exc) =>
          exc.kind === 'secret' &&
          exc.imageRole === imageRole &&
          exc.target === target &&
          exc.ruleId === ruleId,
      );
      if (matched) {
        matchedExceptions.push({
          imageRole,
          kind: 'secret',
          target,
          id: ruleId,
        });
      } else {
        // Never include secret.Match in error output.
        errors.push(
          `[${imageRole}] Unreviewed ${severity} embedded secret (${ruleId}: ${secret?.Title ?? 'secret'}) at ${target}:${secret?.StartLine ?? 0}`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    matchedExceptions,
    errors,
  };
}

export async function scanOciImageTarWithTrivy(
  tarPath,
  {
    imageRole = 'unclassified',
    exceptionsConfig = { exceptions: [] },
  } = {},
) {
  const trivyCache = getTrivyCacheDir();
  await fs.mkdir(trivyCache, { recursive: true });
  const absTar = path.resolve(tarPath);
  const workDir = path.dirname(absTar);
  const tarName = path.basename(absTar);

  const libSecretOut = await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${workDir}:/scan:ro`,
      '-v',
      `${trivyCache}:/root/.cache`,
      TRIVY_IMAGE,
      'image',
      '--input',
      `/scan/${tarName}`,
      '--scanners',
      'vuln,secret',
      '--pkg-types',
      'library',
      '--severity',
      'HIGH,CRITICAL',
      '--format',
      'json',
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );

  const osOut = await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${workDir}:/scan:ro`,
      '-v',
      `${trivyCache}:/root/.cache`,
      TRIVY_IMAGE,
      'image',
      '--input',
      `/scan/${tarName}`,
      '--scanners',
      'vuln',
      '--pkg-types',
      'os',
      '--severity',
      'HIGH,CRITICAL',
      '--ignore-unfixed',
      '--format',
      'json',
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );

  const libSecretReport = JSON.parse(libSecretOut.stdout);
  const osReport = JSON.parse(osOut.stdout);
  const evalRes = evaluateContainerTrivyReports({
    imageRole,
    libSecretReport,
    osReport,
    exceptionsConfig,
  });

  if (!evalRes.ok) {
    throw new Error(
      `Container security gate FAILED for "${imageRole}":\n - ${evalRes.errors.join('\n - ')}`,
    );
  }

  return evalRes;
}

export async function runContainerVulnerabilityGate({
  prebuiltApiImage = process.env.PREBUILT_API_IMAGE ?? '',
  prebuiltWebImage = process.env.PREBUILT_WEB_IMAGE ?? '',
  exceptionsPath = path.join(scriptDir, 'container-scan-exceptions.json'),
} = {}) {
  const exceptionsConfig = JSON.parse(await fs.readFile(exceptionsPath, 'utf8'));
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-trivy-img-'));
  const runId = Date.now().toString(36);
  const usingPrebuilt = Boolean(prebuiltApiImage && prebuiltWebImage);
  const apiRef = prebuiltApiImage || `qaeh-scan-api:${runId}`;
  const webRef = prebuiltWebImage || `qaeh-scan-web:${runId}`;

  try {
    if (!usingPrebuilt) {
      await Promise.all([
        execFileAsync(
          'docker',
          ['build', '--target', 'runner', '-f', 'apps/api/Dockerfile', '-t', apiRef, '.'],
          { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
        ),
        execFileAsync(
          'docker',
          ['build', '--target', 'runner', '-f', 'apps/web/Dockerfile', '-t', webRef, '.'],
          { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
        ),
      ]);
    }

    const composeContent = await fs.readFile(path.join(repoRoot, 'compose.yaml'), 'utf8');
    const parsedCompose = parseComposeServiceImages(composeContent, 'compose.yaml');
    const nginxRef = parsedCompose.services.get('nginx')?.image;
    const postgresRef = parsedCompose.services.get('postgres')?.image;
    assert.ok(nginxRef, 'Expected pinned nginx image in compose.yaml');
    assert.ok(postgresRef, 'Expected pinned postgres image in compose.yaml');

    // Ensure third-party runtime images are pulled locally before docker save.
    for (const ref of [nginxRef, postgresRef]) {
      await execFileAsync('docker', ['image', 'inspect', ref]).catch(async () => {
        await execFileAsync('docker', ['pull', ref], { maxBuffer: 20 * 1024 * 1024 });
      });
    }

    const apiTar = path.join(tmpDir, 'api.tar');
    const webTar = path.join(tmpDir, 'web.tar');
    const nginxTar = path.join(tmpDir, 'nginx.tar');
    const postgresTar = path.join(tmpDir, 'postgres.tar');

    await execFileAsync('docker', ['save', '-o', apiTar, apiRef]);
    await execFileAsync('docker', ['save', '-o', webTar, webRef]);
    await execFileAsync('docker', ['save', '-o', nginxTar, nginxRef]);
    await execFileAsync('docker', ['save', '-o', postgresTar, postgresRef]);

    // Sequential Trivy invocations prevent local cache DB lock contention.
    // Every image (including postgres) runs full library + embedded-secret + fixable-OS scans.
    await scanOciImageTarWithTrivy(apiTar, { imageRole: 'api', exceptionsConfig });
    await scanOciImageTarWithTrivy(webTar, { imageRole: 'web', exceptionsConfig });
    await scanOciImageTarWithTrivy(nginxTar, { imageRole: 'nginx', exceptionsConfig });
    await scanOciImageTarWithTrivy(postgresTar, { imageRole: 'postgres', exceptionsConfig });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    if (!usingPrebuilt) {
      await execFileAsync('docker', ['rmi', '-f', apiRef, webRef]).catch(() => undefined);
    }
  }
}

export async function generateImageSpdxSbom(imageRef, outputSpdxPath) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-sbom-'));
  try {
    const tarPath = path.join(tmpDir, 'image.tar');
    const sbomTmpPath = path.join(tmpDir, 'sbom.spdx.json');
    await fs.mkdir(path.join(tmpDir, 'tmp'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'home'), { recursive: true });
    await execFileAsync('docker', ['save', '-o', tarPath, imageRef]);

    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;

    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '--user',
        `${uid}:${gid}`,
        '-e',
        'TMPDIR=/work/tmp',
        '-e',
        'HOME=/work/home',
        '-v',
        `${tmpDir}:/work`,
        SYFT_IMAGE,
        'docker-archive:/work/image.tar',
        '-o',
        'spdx-json=/work/sbom.spdx.json',
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );

    const sbomRaw = await fs.readFile(sbomTmpPath, 'utf8');
    const parsed = JSON.parse(sbomRaw);
    assert.ok(parsed.spdxVersion?.startsWith('SPDX-'), 'Expected valid SPDX JSON document');
    assert.ok(Array.isArray(parsed.packages) && parsed.packages.length > 0, 'Expected non-empty SPDX packages array');

    await fs.mkdir(path.dirname(path.resolve(outputSpdxPath)), { recursive: true });
    await fs.copyFile(sbomTmpPath, path.resolve(outputSpdxPath));
    const sha256 = crypto.createHash('sha256').update(sbomRaw).digest('hex');

    return {
      spdxVersion: parsed.spdxVersion,
      packageCount: parsed.packages.length,
      sha256,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'secrets') {
    const dirIdx = rest.indexOf('--dir');
    if (dirIdx !== -1 && rest[dirIdx + 1]) {
      await runSecretScan({
        targetDir: path.resolve(process.cwd(), rest[dirIdx + 1]),
        scanGitHistory: false,
      });
      process.stdout.write('Secret scan PASSED on target directory.\n');
      return;
    }
    await runSecretScan({ targetDir: repoRoot, scanGitHistory: true });
    process.stdout.write('Secret scan PASSED (Gitleaks git history + working tree: 0 leaks).\n');
    return;
  }

  if (command === 'deps') {
    const jsonIdx = rest.indexOf('--json-input');
    const lockDirIdx = rest.indexOf('--lockfile-dir');
    await runDependencyVulnerabilityGate({
      auditJsonPath: jsonIdx !== -1 ? path.resolve(process.cwd(), rest[jsonIdx + 1]) : null,
      lockfileDir: lockDirIdx !== -1 ? path.resolve(process.cwd(), rest[lockDirIdx + 1]) : null,
    });
    process.stdout.write(
      'Dependency vulnerability gate PASSED (0 unresolved HIGH/CRITICAL advisories across prod and dev).\n',
    );
    return;
  }

  if (command === 'containers') {
    const apiIdx = rest.indexOf('--api-image');
    const webIdx = rest.indexOf('--web-image');
    await runContainerVulnerabilityGate({
      prebuiltApiImage: apiIdx !== -1 ? rest[apiIdx + 1] : process.env.PREBUILT_API_IMAGE ?? '',
      prebuiltWebImage: webIdx !== -1 ? rest[webIdx + 1] : process.env.PREBUILT_WEB_IMAGE ?? '',
    });
    process.stdout.write(
      'Container vulnerability gate PASSED (Trivy HIGH/CRITICAL scan clean across api, web, nginx, postgres).\n',
    );
    return;
  }

  if (command === 'scan-image-tar') {
    assert.ok(rest[0], 'Usage: node scripts/security-scan.mjs scan-image-tar <tarPath>');
    await scanOciImageTarWithTrivy(rest[0]);
    process.stdout.write('Container tarball scan PASSED.\n');
    return;
  }

  if (command === 'sbom') {
    const [imageRef, outPath] = rest;
    assert.ok(imageRef && outPath, 'Usage: node scripts/security-scan.mjs sbom <imageRef> <outputSpdxPath>');
    const res = await generateImageSpdxSbom(imageRef, outPath);
    process.stdout.write(
      JSON.stringify({ imageRef, outputSpdxPath: outPath, ...res }) + '\n',
    );
    return;
  }

  process.stderr.write(
    'Usage: node scripts/security-scan.mjs <secrets|deps|containers|scan-image-tar|sbom>\n',
  );
  process.exit(1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
