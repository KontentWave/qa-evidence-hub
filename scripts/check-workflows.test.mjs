import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowYaml } from './check-workflows.mjs';

test('accepts read-only PR CI workflow with 40-char commit SHA action pins', () => {
  const validCi = `name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - run: pnpm test
`;
  assert.deepEqual(validateWorkflowYaml(validCi, '.github/workflows/ci.yml', { isPullRequestCi: true }), []);
});

test('rejects tag-pinned actions, write permissions, pull_request_target, and R2/GHCR secrets in PR CI', () => {
  const invalidCi = `name: CI
on:
  pull_request_target:
permissions:
  contents: read
  packages: write
jobs:
  quality:
    runs-on: ubuntu-latest
    env:
      R2_SECRET_ACCESS_KEY: \${{ secrets.R2_SECRET_ACCESS_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: echo "\${{ github.event.pull_request.title }}"
`;
  const errors = validateWorkflowYaml(invalidCi, '.github/workflows/ci.yml', {
    isPullRequestCi: true,
  });
  assert.ok(errors.some((e) => /pull_request_target/.test(e)));
  assert.ok(errors.some((e) => /write permission is forbidden/.test(e)));
  assert.ok(errors.some((e) => /R2 secret reference is forbidden/.test(e)));
  assert.ok(errors.some((e) => /40-char lowercase commit SHA/.test(e)));
  assert.ok(errors.some((e) => /inline GitHub expression/.test(e)));
});

test('rejects release workflow triggered on pull_request', () => {
  const badRelease = `name: Release
on:
  pull_request:
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
`;
  const errors = validateWorkflowYaml(badRelease, '.github/workflows/release.yml', {
    isRelease: true,
  });
  assert.ok(errors.some((e) => /must never run on pull_request/.test(e)));
  assert.ok(errors.some((e) => /trusted refs/.test(e)));
});
