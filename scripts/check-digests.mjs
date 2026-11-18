import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PINNED_IMAGE_REGEX =
  /^[a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[a-zA-Z0-9_.-]+)?@sha256:([0-9a-f]{64})$/;
const LOCAL_IMAGE_ID_REGEX = /^sha256:([0-9a-f]{64})$/;
const ALL_ZERO_DIGEST = '0'.repeat(64);
const ALLOWED_COMPOSE_ENV_REFS = new Map([
  ['api', '${API_IMAGE}'],
  ['web', '${WEB_IMAGE}'],
]);

function validatePinnedImageRef(ref, contextLabel, options = {}) {
  const trimmed = ref.trim();
  const pinnedMatch = PINNED_IMAGE_REGEX.exec(trimmed);
  if (pinnedMatch) {
    if (pinnedMatch[1] === ALL_ZERO_DIGEST) {
      return `${contextLabel}: placeholder all-zero @sha256 digest is forbidden (${trimmed})`;
    }
    return null;
  }

  if (options.allowLocalImageId) {
    const localMatch = LOCAL_IMAGE_ID_REGEX.exec(trimmed);
    if (localMatch) {
      if (localMatch[1] === ALL_ZERO_DIGEST) {
        return `${contextLabel}: placeholder all-zero sha256 image ID is forbidden (${trimmed})`;
      }
      return null;
    }
  }

  return `${contextLabel}: image reference must carry a lowercase 64-hex @sha256:<64-hex> digest (received "${trimmed}")`;
}

export function validateDockerfileContent(content, relativePath) {
  const errors = [];
  const declaredStages = new Set();
  const lines = content.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const stripped = rawLine.replace(/^\s+/, '');
    if (!stripped || stripped.startsWith('#')) {
      return;
    }
    const fromMatch = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+([a-zA-Z0-9._-]+))?\s*$/i.exec(
      stripped,
    );
    if (!fromMatch) {
      return;
    }

    const imageOrStage = fromMatch[1];
    const alias = fromMatch[2];

    if (!declaredStages.has(imageOrStage)) {
      const err = validatePinnedImageRef(
        imageOrStage,
        `${relativePath}:${lineNo} (FROM)`,
      );
      if (err) {
        errors.push(err);
      }
    }

    if (alias) {
      declaredStages.add(alias);
    }
  });

  if (lines.every((line) => !/^\s*FROM\s+/i.test(line))) {
    errors.push(`${relativePath}: no FROM instruction found`);
  }

  return errors;
}

export function parseComposeServiceImages(content, relativePath) {
  const services = new Map();
  const errors = [];
  const lines = content.split(/\r?\n/);

  let inServicesBlock = false;
  let currentService = null;

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const withoutComment = rawLine.replace(/\s+#.*$/, '');
    if (!withoutComment.trim() || /^\s*#/.test(rawLine)) {
      return;
    }

    if (/^services:\s*$/.test(withoutComment)) {
      inServicesBlock = true;
      currentService = null;
      return;
    }

    if (/^\S/.test(withoutComment)) {
      inServicesBlock = false;
      currentService = null;
      return;
    }

    if (!inServicesBlock) {
      return;
    }

    const serviceMatch = /^ {2}([a-zA-Z0-9_-]+):\s*$/.exec(withoutComment);
    if (serviceMatch) {
      currentService = serviceMatch[1];
      if (!services.has(currentService)) {
        services.set(currentService, { image: null, lineNo });
      }
      return;
    }

    if (currentService) {
      const imageMatch = /^ {4}image:\s*(.+?)\s*$/.exec(withoutComment);
      if (imageMatch) {
        const unquoted = imageMatch[1].replace(/^['"]|['"]$/g, '');
        services.set(currentService, { image: unquoted, lineNo });
      }
    }
  });

  if (services.size === 0) {
    errors.push(`${relativePath}: no services block parsed`);
  }

  return { services, errors };
}

export async function verifyWorkspaceDigests({
  rootDir,
  env = process.env,
  requireRuntimeEnv = false,
  allowLocalImageId = false,
} = {}) {
  const errors = [];
  const dockerfilePaths = ['apps/api/Dockerfile', 'apps/web/Dockerfile'];

  for (const relPath of dockerfilePaths) {
    const absPath = path.join(rootDir, relPath);
    try {
      const content = await fs.readFile(absPath, 'utf8');
      errors.push(...validateDockerfileContent(content, relPath));
    } catch (error) {
      errors.push(`${relPath}: unable to read file (${error.message})`);
    }
  }

  let prodPostgresImage = null;
  const composeProdPath = path.join(rootDir, 'compose.yaml');
  try {
    const content = await fs.readFile(composeProdPath, 'utf8');
    const parsed = parseComposeServiceImages(content, 'compose.yaml');
    errors.push(...parsed.errors);

    for (const [serviceName, info] of parsed.services.entries()) {
      if (!info.image) {
        errors.push(`compose.yaml:${info.lineNo} (services.${serviceName}): missing image field`);
        continue;
      }

      const expectedEnvExpr = ALLOWED_COMPOSE_ENV_REFS.get(serviceName);
      if (expectedEnvExpr && info.image === expectedEnvExpr) {
        continue;
      }

      const err = validatePinnedImageRef(
        info.image,
        `compose.yaml:${info.lineNo} (services.${serviceName}.image)`,
      );
      if (err) {
        errors.push(err);
      } else if (serviceName === 'postgres') {
        prodPostgresImage = info.image;
      }
    }
  } catch (error) {
    errors.push(`compose.yaml: unable to read file (${error.message})`);
  }

  const composeTestPath = path.join(rootDir, 'compose.test.yaml');
  try {
    const content = await fs.readFile(composeTestPath, 'utf8');
    const parsed = parseComposeServiceImages(content, 'compose.test.yaml');
    errors.push(...parsed.errors);

    for (const [serviceName, info] of parsed.services.entries()) {
      if (!info.image) {
        errors.push(
          `compose.test.yaml:${info.lineNo} (services.${serviceName}): missing image field`,
        );
        continue;
      }

      const err = validatePinnedImageRef(
        info.image,
        `compose.test.yaml:${info.lineNo} (services.${serviceName}.image)`,
      );
      if (err) {
        errors.push(err);
      } else if (prodPostgresImage && info.image !== prodPostgresImage) {
        errors.push(
          `compose.test.yaml:${info.lineNo}: postgres image digest mismatch with compose.yaml ("${info.image}" !== "${prodPostgresImage}")`,
        );
      }
    }
  } catch (error) {
    errors.push(`compose.test.yaml: unable to read file (${error.message})`);
  }

  for (const envName of ['API_IMAGE', 'WEB_IMAGE']) {
    const rawValue = env[envName];
    if (rawValue === undefined || rawValue.trim() === '') {
      if (requireRuntimeEnv) {
        errors.push(`${envName}: environment variable is required and must specify @sha256:<64-hex>`);
      }
      continue;
    }

    const err = validatePinnedImageRef(rawValue, `${envName} (env)`, {
      allowLocalImageId,
    });
    if (err) {
      errors.push(err);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const requireRuntimeEnv = args.includes('--require-env');
  const allowLocalImageId = args.includes('--allow-local-image-id');
  const rootFlagIndex = args.indexOf('--root');
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rootDir =
    rootFlagIndex !== -1 && args[rootFlagIndex + 1]
      ? path.resolve(args[rootFlagIndex + 1])
      : defaultRoot;

  const result = await verifyWorkspaceDigests({
    rootDir,
    env: process.env,
    requireRuntimeEnv,
    allowLocalImageId,
  });

  if (!result.ok) {
    for (const err of result.errors) {
      process.stderr.write(`[digest-check] FAIL: ${err}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('[digest-check] PASS: All Dockerfile and Compose image digests verified.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runCli();
}
