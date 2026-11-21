import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { evaluateCucumberJsonReport } from './verify-cucumber-executed.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'verify-cucumber-executed.mjs',
);

test('rejects empty Cucumber JSON report when zero Foundation scenarios execute', async () => {
  const res = evaluateCucumberJsonReport([]);
  assert.equal(res.ok, false);
  assert.equal(res.executedScenarios, 0);
  assert.match(res.errors[0], /zero scenarios executed/);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-cucumber-guard-'));
  try {
    const emptyReport = path.join(tmpDir, 'empty.json');
    await fs.writeFile(emptyReport, '[]', 'utf8');
    await assert.rejects(
      () => execFileAsync(process.execPath, [scriptPath, emptyReport]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr, /zero scenarios executed/);
        return true;
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('rejects non-passing or pending steps', () => {
  const res = evaluateCucumberJsonReport([
    {
      name: 'Foundation readiness',
      elements: [
        {
          type: 'scenario',
          name: 'Pending step scenario',
          steps: [{ keyword: 'Given ', name: 'pending setup', result: { status: 'pending' } }],
        },
      ],
    },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.executedScenarios, 1);
  assert.match(res.errors[0], /pending/);
});

test('accepts report with at least one executed scenario where all steps passed', () => {
  const res = evaluateCucumberJsonReport([
    {
      name: 'Foundation readiness',
      elements: [
        {
          type: 'scenario',
          name: '/api/v1/health/ready returns 200',
          steps: [
            { keyword: 'Given ', name: 'booted', result: { status: 'passed' } },
            { keyword: 'When ', name: 'GET /api/v1/health/ready', result: { status: 'passed' } },
            { keyword: 'Then ', name: '200', result: { status: 'passed' } },
          ],
        },
      ],
    },
  ]);
  assert.equal(res.ok, true);
  assert.equal(res.executedScenarios, 1);
  assert.deepEqual(res.errors, []);
});
