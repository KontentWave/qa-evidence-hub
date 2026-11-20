import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function matchesPackagePattern(pkgName, pattern) {
  if (pattern.endsWith('*')) {
    return pkgName.startsWith(pattern.slice(0, -1));
  }
  return pkgName === pattern;
}

/**
 * Evaluates a normalized SPDX expression such as:
 * - "MIT"
 * - "(MIT OR CC0-1.0)"
 * - "Apache-2.0 AND MIT"
 * - "MIT and ISC"
 * Under OR, at least one branch must be allowed; under AND, all branches must be allowed.
 */
export function isSpdxExpressionSatisfied(rawExpr, allowedSet) {
  if (!rawExpr || typeof rawExpr !== 'string') {
    return false;
  }
  const trimmed = rawExpr.trim();
  if (!trimmed || /^UNLICENSED$/i.test(trimmed) || /^UNKNOWN$/i.test(trimmed) || /^NONE$/i.test(trimmed)) {
    return false;
  }

  // Strip balanced outer parentheses repeatedly.
  let expr = trimmed;
  while (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < expr.length; i += 1) {
      if (expr[i] === '(') depth += 1;
      else if (expr[i] === ')') depth -= 1;
      if (depth === 0 && i < expr.length - 1) {
        wrapsWhole = false;
        break;
      }
    }
    if (wrapsWhole) {
      expr = expr.slice(1, -1).trim();
    } else {
      break;
    }
  }

  // Top-level OR split
  const orParts = splitTopLevelOperator(expr, 'OR');
  if (orParts.length > 1) {
    return orParts.some((part) => isSpdxExpressionSatisfied(part, allowedSet));
  }

  // Top-level AND split
  const andParts = splitTopLevelOperator(expr, 'AND');
  if (andParts.length > 1) {
    return andParts.every((part) => isSpdxExpressionSatisfied(part, allowedSet));
  }

  return allowedSet.has(expr);
}

function splitTopLevelOperator(expr, operator) {
  const parts = [];
  let depth = 0;
  let lastIdx = 0;
  const opRegex = new RegExp(`^\\s+${operator}\\s+`, 'i');

  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0) {
      const slice = expr.slice(i);
      const match = opRegex.exec(slice);
      if (match) {
        parts.push(expr.slice(lastIdx, i).trim());
        i += match[0].length - 1;
        lastIdx = i + 1;
      }
    }
  }

  if (parts.length > 0) {
    parts.push(expr.slice(lastIdx).trim());
    return parts;
  }
  return [expr];
}

function validateExceptionMetadata(exc, index) {
  const requiredFields = ['packagePattern', 'license', 'scope', 'reviewedAt', 'reviewedBy', 'docRef', 'rationale'];
  const errs = [];
  for (const field of requiredFields) {
    if (typeof exc?.[field] !== 'string' || exc[field].trim().length === 0) {
      errs.push(`reviewedExceptions[${index}]: missing required field "${field}"`);
    }
  }
  if (exc?.docRef && !exc.docRef.startsWith('.github/docs/runbook.md')) {
    errs.push(`reviewedExceptions[${index}]: docRef must reference .github/docs/runbook.md`);
  }
  return errs;
}

export function evaluateWorkspaceLicenses(licensesMap, policy) {
  const errors = [];
  const allowedSet = new Set(policy?.allowedSpdxIds ?? []);
  const reviewedExceptions = Array.isArray(policy?.reviewedExceptions)
    ? policy.reviewedExceptions
    : [];

  reviewedExceptions.forEach((exc, idx) => {
    errors.push(...validateExceptionMetadata(exc, idx));
  });

  if (errors.length > 0) {
    return { ok: false, checkedPackages: 0, matchedExceptions: [], errors };
  }

  let checkedPackages = 0;
  const matchedExceptions = [];

  for (const [licenseKey, pkgEntries] of Object.entries(licensesMap ?? {})) {
    const entries = Array.isArray(pkgEntries) ? pkgEntries : [];
    for (const pkg of entries) {
      const pkgName = pkg?.name ?? '<unknown>';
      const versions = Array.isArray(pkg?.versions)
        ? pkg.versions.join(',')
        : String(pkg?.version ?? 'unknown');
      checkedPackages += 1;

      if (isSpdxExpressionSatisfied(licenseKey, allowedSet)) {
        continue;
      }

      const matchingException = reviewedExceptions.find(
        (exc) =>
          exc.license === licenseKey && matchesPackagePattern(pkgName, exc.packagePattern),
      );

      if (matchingException) {
        matchedExceptions.push({
          package: `${pkgName}@${versions}`,
          license: licenseKey,
          docRef: matchingException.docRef,
        });
        continue;
      }

      errors.push(
        `Unreviewed or disallowed license "${licenseKey}" on package ${pkgName}@${versions} (not in allowedSpdxIds and no reviewed exception in .github/docs/runbook.md)`,
      );
    }
  }

  if (checkedPackages === 0) {
    errors.push('License inventory returned 0 packages; expected locked workspace dependencies');
  }

  return {
    ok: errors.length === 0,
    checkedPackages,
    matchedExceptions,
    errors,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const args = process.argv.slice(2);

  let policyPath = path.join(scriptDir, 'license-policy.json');
  let inputJsonPath = null;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--policy' && args[i + 1]) {
      policyPath = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (args[i] === '--input-json' && args[i + 1]) {
      inputJsonPath = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    }
  }

  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  let licensesMap;

  if (inputJsonPath) {
    licensesMap = JSON.parse(await fs.readFile(inputJsonPath, 'utf8'));
  } else {
    const { stdout } = await execFileAsync('pnpm', ['licenses', 'list', '-r', '--json'], {
      cwd: repoRoot,
      maxBuffer: 20 * 1024 * 1024,
    });
    licensesMap = JSON.parse(stdout);
  }

  const result = evaluateWorkspaceLicenses(licensesMap, policy);
  if (!result.ok) {
    process.stderr.write('License policy gate FAILED:\n');
    for (const err of result.errors) {
      process.stderr.write(` - ${err}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `License policy gate PASSED: ${result.checkedPackages} package entries verified (${result.matchedExceptions.length} reviewed exception(s) matched per .github/docs/runbook.md).\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
