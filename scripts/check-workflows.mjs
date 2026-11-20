import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTION_SHA_PIN_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@([0-9a-f]{40})$/;
const ALL_ZERO_SHA40 = '0'.repeat(40);
const FORBIDDEN_CI_SECRET_PATTERNS = [
  /\bR2_[A-Z0-9_]+\b/,
  /\bCLOUDFLARE_[A-Z0-9_]+\b/,
  /\bANSIBLE_VAULT[A-Z0-9_]*\b/,
  /\bVPS_SSH[A-Z0-9_]*\b/,
  /\bDEPLOY_[A-Z0-9_]+\b/,
  /\bGHCR_PAT\b/,
  /\bCR_PAT\b/,
];

export function validateWorkflowYaml(content, relPath, { isPullRequestCi = false, isRelease = false } = {}) {
  const errors = [];
  const lines = content.split(/\r?\n/);

  if (/\bpull_request_target\s*:/.test(content)) {
    errors.push(`${relPath}: pull_request_target trigger is forbidden`);
  }

  let inRunBlock = false;
  let runBlockIndent = 0;

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const indent = rawLine.match(/^ */)?.[0]?.length ?? 0;
    const withoutComment = rawLine.replace(/\s+#.*$/, '').trim();
    if (!withoutComment || withoutComment.startsWith('#')) {
      return;
    }

    if (inRunBlock) {
      if (indent > runBlockIndent) {
        if (rawLine.includes('${{')) {
          errors.push(
            `${relPath}:${lineNo}: inline GitHub expression \${{ ... }} inside run: block is forbidden; bind via step env: instead`,
          );
        }
      } else {
        inRunBlock = false;
      }
    }

    const runKeyMatch = /^(?:-\s+)?run:\s*(.*)$/.exec(withoutComment);
    if (runKeyMatch) {
      const inlineRun = runKeyMatch[1];
      if (inlineRun === '|' || inlineRun === '>-' || inlineRun === '>') {
        inRunBlock = true;
        runBlockIndent = indent;
      } else if (rawLine.includes('${{')) {
        errors.push(
          `${relPath}:${lineNo}: inline GitHub expression \${{ ... }} inside run: command is forbidden; bind via step env: instead`,
        );
      }
    }

    const usesMatch = /^(?:-\s+)?uses:\s*['"]?([^\s'"]+)['"]?\s*$/.exec(withoutComment);
    if (usesMatch) {
      const actionRef = usesMatch[1];
      if (actionRef.startsWith('./')) {
        return;
      }
      const pinMatch = ACTION_SHA_PIN_REGEX.exec(actionRef);
      if (!pinMatch) {
        errors.push(
          `${relPath}:${lineNo}: third-party action must be pinned by full 40-char lowercase commit SHA (received "${actionRef}")`,
        );
      } else if (pinMatch[1] === ALL_ZERO_SHA40) {
        errors.push(`${relPath}:${lineNo}: placeholder all-zero commit SHA is forbidden`);
      }
    }
  });

  if (isPullRequestCi) {
    if (!/^permissions:\s*\r?\n\s+contents:\s*read\s*$/m.test(content)) {
      errors.push(`${relPath}: must declare top-level read-only "permissions: contents: read"`);
    }

    lines.forEach((rawLine, index) => {
      const lineNo = index + 1;
      const withoutComment = rawLine.replace(/\s+#.*$/, '');
      if (/:\s*write\b/.test(withoutComment)) {
        errors.push(
          `${relPath}:${lineNo}: write permission is forbidden in PR CI workflow (${withoutComment.trim()})`,
        );
      }
      for (const pattern of FORBIDDEN_CI_SECRET_PATTERNS) {
        if (pattern.test(withoutComment)) {
          errors.push(
            `${relPath}:${lineNo}: publishing, deployment, or R2 secret reference is forbidden in PR CI workflow`,
          );
        }
      }
    });

    if (/\bdocker\/login-action\b/.test(content) || /\bdocker\s+push\b/.test(content)) {
      errors.push(`${relPath}: registry login or image push is forbidden in PR CI workflow`);
    }
  }

  if (isRelease) {
    if (/^\s*pull_request\s*:/m.test(content)) {
      errors.push(`${relPath}: release workflow must never run on pull_request events`);
    }
    if (!/refs\/heads\/main/.test(content) && !/refs\/tags\/v/.test(content)) {
      errors.push(`${relPath}: release workflow must explicitly guard trusted refs (main or v* tags)`);
    }
  }

  return errors;
}

export async function verifyRepositoryWorkflows(rootDir) {
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  const requiredWorkflows = ['ci.yml', 'release.yml'];
  const errors = [];

  let entries;
  try {
    entries = await fs.readdir(workflowsDir);
  } catch (error) {
    return {
      ok: false,
      errors: [`.github/workflows: unable to read directory (${error.message})`],
    };
  }

  for (const required of requiredWorkflows) {
    if (!entries.includes(required)) {
      errors.push(`.github/workflows/${required}: required workflow file is missing`);
    }
  }

  const ymlFiles = entries.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
  for (const fileName of ymlFiles) {
    const relPath = `.github/workflows/${fileName}`;
    const content = await fs.readFile(path.join(workflowsDir, fileName), 'utf8');
    errors.push(
      ...validateWorkflowYaml(content, relPath, {
        isPullRequestCi: fileName === 'ci.yml',
        isRelease: fileName === 'release.yml',
      }),
    );
  }

  // Also ensure scanner container images in scripts/security-scan.mjs and scripts/check-static-security.mjs are @sha256-pinned.
  for (const scriptRel of ['scripts/security-scan.mjs', 'scripts/check-static-security.mjs']) {
    try {
      const scriptContent = await fs.readFile(path.join(rootDir, scriptRel), 'utf8');
      const constRegex = /export const ([A-Z0-9_]+_IMAGE)\s*=\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = constRegex.exec(scriptContent)) !== null) {
        const [, varName, imgRef] = match;
        if (!/@sha256:[0-9a-f]{64}$/.test(imgRef) || imgRef.endsWith('0'.repeat(64))) {
          errors.push(`${scriptRel} (${varName}): scanner image must carry non-zero @sha256:<64-hex> digest`);
        }
      }
    } catch (error) {
      errors.push(`${scriptRel}: unable to read scanner script (${error.message})`);
    }
  }

  return {
    ok: errors.length === 0,
    checkedWorkflows: ymlFiles,
    errors,
  };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await verifyRepositoryWorkflows(rootDir);
  if (!result.ok) {
    for (const err of result.errors) {
      process.stderr.write(`${err}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `Workflow security & SHA-pinning verified (${result.checkedWorkflows.join(', ')}).\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
