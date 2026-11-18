import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyWorkspaceDigests } from './check-digests.mjs';

const NODE_PINNED =
  'node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66';
const PG_PINNED =
  'postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536';
const NGINX_PINNED =
  'nginx:1.30-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287e0a'.replace(
    '7e0a',
    '7d0a',
  );

async function makeFixtureRepo(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-digest-test-'));
  await fs.mkdir(path.join(root, 'apps/api'), { recursive: true });
  await fs.mkdir(path.join(root, 'apps/web'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'apps/api/Dockerfile'),
    overrides.apiDockerfile ??
      `FROM ${NODE_PINNED} AS builder\nRUN echo build\nFROM ${NODE_PINNED} AS runner\nCOPY --from=builder /app /app\nUSER node\n`,
    'utf8',
  );

  await fs.writeFile(
    path.join(root, 'apps/web/Dockerfile'),
    overrides.webDockerfile ??
      `FROM ${NODE_PINNED} AS deps\nFROM deps AS builder\nFROM ${NODE_PINNED} AS runner\nUSER node\n`,
    'utf8',
  );

  await fs.writeFile(
    path.join(root, 'compose.yaml'),
    overrides.composeYaml ??
      [
        'services:',
        '  postgres:',
        `    image: ${PG_PINNED}`,
        '  api:',
        '    image: ${API_IMAGE}',
        '  web:',
        '    image: ${WEB_IMAGE}',
        '  nginx:',
        `    image: ${NGINX_PINNED}`,
        '',
      ].join('\n'),
    'utf8',
  );

  await fs.writeFile(
    path.join(root, 'compose.test.yaml'),
    overrides.composeTestYaml ??
      ['services:', '  postgres_test:', `    image: ${PG_PINNED}`, ''].join('\n'),
    'utf8',
  );

  return root;
}

test('accepts digest-pinned Dockerfiles, Compose files, and valid @sha256 runtime image vars', async (t) => {
  const root = await makeFixtureRepo();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await verifyWorkspaceDigests({
    rootDir: root,
    env: {
      API_IMAGE:
        'ghcr.io/kontentwave/qa-evidence-hub-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      WEB_IMAGE:
        'ghcr.io/kontentwave/qa-evidence-hub-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('rejects tag-only or unpinned Dockerfile FROM lines', async (t) => {
  const root = await makeFixtureRepo({
    apiDockerfile: 'FROM node:24.21.0-trixie-slim AS runner\nUSER node\n',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await verifyWorkspaceDigests({ rootDir: root, env: {} });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /apps\/api\/Dockerfile.*@sha256:/);
});

test('rejects malformed or uppercase sha256 digests and undeclared stage aliases', async (t) => {
  const root = await makeFixtureRepo({
    webDockerfile:
      'FROM node:24-slim@sha256:1234ABCD AS builder\nFROM unknown_stage AS runner\n',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await verifyWorkspaceDigests({ rootDir: root, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length >= 2, true);
});

test('rejects tag-only Compose images and unpinned fallback defaults on ${API_IMAGE}', async (t) => {
  const root = await makeFixtureRepo({
    composeYaml: [
      'services:',
      '  postgres:',
      `    image: ${PG_PINNED}`,
      '  api:',
      '    image: ${API_IMAGE:-ghcr.io/example/api:latest}',
      '  web:',
      '    image: ${WEB_IMAGE}',
      '  nginx:',
      '    image: nginx:1.30-alpine',
      '',
    ].join('\n'),
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await verifyWorkspaceDigests({ rootDir: root, env: {} });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /api/);
  assert.match(result.errors.join('\n'), /nginx/);
});

test('rejects mismatched postgres digest between compose.yaml and compose.test.yaml', async (t) => {
  const root = await makeFixtureRepo({
    composeTestYaml: [
      'services:',
      '  postgres_test:',
      '    image: postgres:17-bookworm@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '',
    ].join('\n'),
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await verifyWorkspaceDigests({ rootDir: root, env: {} });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /postgres.*digest mismatch/i);
});

test('rejects tag-only API_IMAGE or WEB_IMAGE environment values and all-zero placeholder digests', async (t) => {
  const root = await makeFixtureRepo();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const tagOnlyResult = await verifyWorkspaceDigests({
    rootDir: root,
    env: {
      API_IMAGE: 'ghcr.io/kontentwave/qa-evidence-hub-api:v0.1.0',
      WEB_IMAGE:
        'ghcr.io/kontentwave/qa-evidence-hub-web@sha256:0000000000000000000000000000000000000000000000000000000000000000',
    },
  });

  assert.equal(tagOnlyResult.ok, false);
  assert.match(tagOnlyResult.errors.join('\n'), /API_IMAGE/);
  assert.match(tagOnlyResult.errors.join('\n'), /WEB_IMAGE.*placeholder/i);
});
