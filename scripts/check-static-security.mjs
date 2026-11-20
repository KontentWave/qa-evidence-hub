import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';

const execFileAsync = promisify(execFile);

export const TRIVY_IMAGE =
  'ghcr.io/aquasecurity/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-bdd',
  '.next',
  'coverage',
  'playwright-report',
  'test-results',
  '.security-reports',
]);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

async function collectCodeFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return results;
    throw error;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectCodeFiles(full)));
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      if (full.includes(`${path.sep}src${path.sep}generated${path.sep}`)) {
        continue;
      }
      results.push(full);
    }
  }
  return results.sort();
}

export function scanSourceAstForHighRiskPatterns(sourceText, relPath) {
  const findings = [];
  const sourceFile = ts.createSourceFile(
    relPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const childProcessExecBindings = new Set();

  function record(node, ruleId, severity, detail) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({
      file: relPath,
      line: line + 1,
      column: character + 1,
      ruleId,
      severity,
      detail,
    });
  }

  function visit(node) {
    // Track imports from 'child_process' or 'node:child_process' that bind exec / execSync
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      (node.moduleSpecifier.text === 'child_process' ||
        node.moduleSpecifier.text === 'node:child_process')
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const importedName = (el.propertyName ?? el.name).text;
          if (importedName === 'exec' || importedName === 'execSync') {
            childProcessExecBindings.add(el.name.text);
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'eval') {
        record(node, 'SAST-001', 'CRITICAL', 'Dynamic code execution via eval() is forbidden');
      } else if (ts.isIdentifier(expr) && childProcessExecBindings.has(expr.text)) {
        record(
          node,
          'SAST-002',
          'HIGH',
          `Shell command execution via child_process.${expr.text}() is forbidden; use execFile/spawn without shell`,
        );
      } else if (ts.isPropertyAccessExpression(expr)) {
        const prop = expr.name.text;
        if (prop === '$queryRawUnsafe' || prop === '$executeRawUnsafe') {
          record(
            node,
            'SAST-003',
            'CRITICAL',
            `Unsafe raw SQL method ${prop}() is forbidden; use parameterized queries`,
          );
        } else if (
          (prop === 'exec' || prop === 'execSync') &&
          ts.isIdentifier(expr.expression) &&
          /childProcess|cp/i.test(expr.expression.text)
        ) {
          record(
            node,
            'SAST-002',
            'HIGH',
            `Shell command execution via ${expr.expression.text}.${prop}() is forbidden`,
          );
        }
      }
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Function'
    ) {
      record(node, 'SAST-001', 'CRITICAL', 'Dynamic code generation via new Function() is forbidden');
    }

    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'dangerouslySetInnerHTML'
    ) {
      record(
        node,
        'SAST-004',
        'HIGH',
        'Unescaped HTML rendering via dangerouslySetInnerHTML is forbidden (project_sheet.md §3)',
      );
    }

    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'rejectUnauthorized') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'rejectUnauthorized')) &&
      node.initializer.kind === ts.SyntaxKind.FalseKeyword
    ) {
      record(
        node,
        'SAST-005',
        'HIGH',
        'Disabling TLS certificate verification (rejectUnauthorized: false) is forbidden',
      );
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'NODE_TLS_REJECT_UNAUTHORIZED' &&
      ts.isStringLiteral(node.right) &&
      node.right.text === '0'
    ) {
      record(
        node,
        'SAST-005',
        'CRITICAL',
        'Disabling global TLS verification via NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden',
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

export async function runAstStaticSecurityScan(targetRoot) {
  const scanTargets = ['apps', 'packages', 'scripts', 'e2e'];
  let files = [];

  // Support scanning either the full monorepo or an isolated fixture directory.
  const hasMonorepoDirs = await Promise.all(
    scanTargets.map(async (sub) => {
      try {
        return (await fs.stat(path.join(targetRoot, sub))).isDirectory();
      } catch {
        return false;
      }
    }),
  );

  if (hasMonorepoDirs.some(Boolean)) {
    for (const sub of scanTargets) {
      files.push(...(await collectCodeFiles(path.join(targetRoot, sub))));
    }
  } else {
    files = await collectCodeFiles(targetRoot);
  }

  const findings = [];
  for (const absFile of files) {
    const rel = path.relative(targetRoot, absFile).split(path.sep).join('/');
    const text = await fs.readFile(absFile, 'utf8');
    findings.push(...scanSourceAstForHighRiskPatterns(text, rel));
  }

  return { filesScanned: files.length, findings };
}

export async function runTrivyConfigScan(targetRoot) {
  const trivyCacheDir = process.env.TRIVY_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'trivy');
  await fs.mkdir(trivyCacheDir, { recursive: true });

  await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${path.resolve(targetRoot)}:/target:ro`,
      '-v',
      `${trivyCacheDir}:/root/.cache`,
      TRIVY_IMAGE,
      'config',
      '--severity',
      'HIGH,CRITICAL',
      '--exit-code',
      '1',
      '/target',
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const codeOnlyIdx = args.indexOf('--code-only');
  const iacOnlyIdx = args.indexOf('--iac-only');

  if (codeOnlyIdx !== -1) {
    const dir = path.resolve(process.cwd(), args[codeOnlyIdx + 1] ?? repoRoot);
    const astRes = await runAstStaticSecurityScan(dir);
    if (astRes.findings.length > 0) {
      for (const f of astRes.findings) {
        process.stderr.write(
          `[${f.severity}] ${f.ruleId} ${f.file}:${f.line}:${f.column} — ${f.detail}\n`,
        );
      }
      process.exit(1);
    }
    process.stdout.write(`Static AST security check passed (${astRes.filesScanned} files).\n`);
    return;
  }

  if (iacOnlyIdx !== -1) {
    const dir = path.resolve(process.cwd(), args[iacOnlyIdx + 1] ?? repoRoot);
    await runTrivyConfigScan(dir);
    process.stdout.write('Static IaC/Dockerfile Trivy config scan passed (0 HIGH/CRITICAL findings).\n');
    return;
  }

  const astRes = await runAstStaticSecurityScan(repoRoot);
  if (astRes.findings.length > 0) {
    for (const f of astRes.findings) {
      process.stderr.write(
        `[${f.severity}] ${f.ruleId} ${f.file}:${f.line}:${f.column} — ${f.detail}\n`,
      );
    }
    process.exit(1);
  }

  await runTrivyConfigScan(repoRoot);
  process.stdout.write(
    `Static security gate PASSED: AST SAST (${astRes.filesScanned} files) + Trivy IaC config scan clean (0 HIGH/CRITICAL findings).\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
