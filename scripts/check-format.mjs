import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.gz',
  '.tar',
]);

// Files checked for strict final-newline + trailing-whitespace + indentation rules per .editorconfig.
const SCOPED_PREFIXES = [
  'apps/',
  'packages/',
  'scripts/',
  'specs/',
  'e2e/',
  'infra/',
  '.github/workflows/',
  '.github/docs/adr/',
];

const SCOPED_ROOT_FILES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.e2e.json',
  'playwright.config.ts',
  'eslint.config.mjs',
  'compose.yaml',
  'compose.dev.yaml',
  'compose.test.yaml',
  '.editorconfig',
  '.gitignore',
  '.dockerignore',
  '.env.example',
  '.github/CODEOWNERS',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/docs/runbook.md',
  '.github/docs/CHANGELOG.md',
]);

function isScopedFile(relPath) {
  if (SCOPED_ROOT_FILES.has(relPath)) {
    return true;
  }
  return SCOPED_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

export function validateFileFormatting(buffer, relPath) {
  const errors = [];
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return errors;
  }

  // Verify valid UTF-8 decoding via fatal TextDecoder.
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    errors.push(`${relPath}: invalid UTF-8 byte sequence`);
    return errors;
  }

  if (text.includes('\r')) {
    errors.push(`${relPath}: contains CR/CRLF line endings (expected LF per .editorconfig)`);
  }

  if (text.length > 0 && !text.endsWith('\n')) {
    errors.push(`${relPath}: missing final newline at EOF`);
  }

  const isMarkdown = ext === '.md';
  const isMakefile = path.basename(relPath) === 'Makefile';
  const lines = text.split('\n');
  // Last element after final '\n' is ''.
  const limit = text.endsWith('\n') ? lines.length - 1 : lines.length;

  for (let i = 0; i < limit; i += 1) {
    const line = lines[i];
    if (!isMarkdown && /[ \t]+$/.test(line)) {
      errors.push(`${relPath}:${i + 1}: trailing horizontal whitespace`);
    }
    if (!isMakefile && /^\t+/.test(line)) {
      errors.push(`${relPath}:${i + 1}: leading tab indentation (expected spaces per .editorconfig)`);
    }
  }

  return errors;
}

export async function checkWorkspaceFormatting(rootDir) {
  const { stdout } = await execFileAsync('git', ['ls-files'], {
    cwd: rootDir,
    maxBuffer: 10 * 1024 * 1024,
  });
  const tracked = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Also include new untracked files inside scoped paths (excluding ignored dirs and .github/skills).
  const { stdout: untrackedStdout } = await execFileAsync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 },
  );
  const untracked = untrackedStdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates = [...new Set([...tracked, ...untracked])]
    .filter((rel) => isScopedFile(rel))
    .sort();

  const errors = [];
  let checkedCount = 0;

  for (const relPath of candidates) {
    const absPath = path.join(rootDir, relPath);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) {
      continue;
    }
    const buf = await fs.readFile(absPath);
    checkedCount += 1;
    errors.push(...validateFileFormatting(buf, relPath));
  }

  return {
    ok: errors.length === 0,
    checkedCount,
    errors,
  };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await checkWorkspaceFormatting(rootDir);
  if (!result.ok) {
    for (const err of result.errors) {
      process.stderr.write(`${err}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `Formatting check passed (.editorconfig LF, UTF-8, indentation, EOF newline) across ${result.checkedCount} files.\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
