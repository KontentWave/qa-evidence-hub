import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { evaluateWorkspaceLicenses, isSpdxExpressionSatisfied } from './check-licenses.mjs';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checkLicensesPath = path.join(scriptDir, 'check-licenses.mjs');

test('parses compound SPDX OR/AND expressions accurately', () => {
  const allowed = new Set(['MIT', 'ISC', 'Apache-2.0']);
  assert.equal(isSpdxExpressionSatisfied('MIT', allowed), true);
  assert.equal(isSpdxExpressionSatisfied('(MIT OR GPL-3.0-only)', allowed), true);
  assert.equal(isSpdxExpressionSatisfied('Apache-2.0 AND MIT', allowed), true);
  assert.equal(isSpdxExpressionSatisfied('MIT and GPL-3.0-only', allowed), false);
  assert.equal(isSpdxExpressionSatisfied('AGPL-3.0-only', allowed), false);
  assert.equal(isSpdxExpressionSatisfied('UNLICENSED', allowed), false);
});

test('blocks unreviewed copyleft, UNLICENSED, and undocumented exception entries via CLI', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaeh-lic-test-'));
  try {
    const violatingInputPath = path.join(tmpDir, 'violating-licenses.json');
    await fs.writeFile(
      violatingInputPath,
      JSON.stringify({
        MIT: [{ name: 'safe-pkg', versions: ['1.0.0'] }],
        'GPL-3.0-only': [{ name: 'copyleft-pkg', versions: ['2.1.0'] }],
        UNLICENSED: [{ name: 'proprietary-pkg', versions: ['0.1.0'] }],
      }),
      'utf8',
    );

    await assert.rejects(
      () => execFileAsync(process.execPath, [checkLicensesPath, '--input-json', violatingInputPath]),
      (err) => {
        assert.notEqual(err.code, 0);
        assert.match(err.stderr, /GPL-3\.0-only.*copyleft-pkg@2\.1\.0/);
        assert.match(err.stderr, /UNLICENSED.*proprietary-pkg@0\.1\.0/);
        return true;
      },
    );

    // Also reject an exception entry missing required runbook rationale/docRef.
    const badPolicyEval = evaluateWorkspaceLicenses(
      { 'MPL-2.0': [{ name: 'foo', versions: ['1.0.0'] }] },
      {
        allowedSpdxIds: ['MIT'],
        reviewedExceptions: [{ packagePattern: 'foo', license: 'MPL-2.0' }],
      },
    );
    assert.equal(badPolicyEval.ok, false);
    assert.ok(badPolicyEval.errors.some((e) => /missing required field/.test(e)));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
