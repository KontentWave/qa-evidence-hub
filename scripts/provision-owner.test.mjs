import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashOwnerPassword,
  parseOperatorArgs,
  validateOwnerPasswordPolicy,
} from './provision-owner.ts';

test('parseOperatorArgs parses provision and reset-password flags and defaults timezone to Europe/Bratislava', () => {
  const provisioned = parseOperatorArgs(['provision', '--login', '  owner@example.test  ', '--password-stdin']);
  assert.deepEqual(provisioned, {
    command: 'provision',
    loginIdentifier: 'owner@example.test',
    timezone: 'Europe/Bratislava',
    passwordStdin: true,
  });

  const reset = parseOperatorArgs(['reset-password', '--login=owner@example.test', '--password-stdin']);
  assert.deepEqual(reset, {
    command: 'reset-password',
    loginIdentifier: 'owner@example.test',
    timezone: 'Europe/Bratislava',
    passwordStdin: true,
  });
});

test('parseOperatorArgs rejects CLI --password flags, unknown flags, missing --login, and invalid timezones', () => {
  assert.throws(() => parseOperatorArgs(['provision', '--login', 'owner', '--password', 'secret123456']), /forbidden/i);
  assert.throws(() => parseOperatorArgs(['provision', '--login', 'owner', '--password=secret123456']), /forbidden/i);
  assert.throws(() => parseOperatorArgs(['provision', '--login', 'owner', '-p', 'secret123456']), /forbidden/i);
  assert.throws(() => parseOperatorArgs(['provision']), /requires --login/i);
  assert.throws(
    () => parseOperatorArgs(['provision', '--login', 'owner', '--timezone', 'Invalid/Not_A_Timezone']),
    /IANA timezone/i,
  );
  assert.throws(
    () => parseOperatorArgs(['reset-password', '--timezone', 'UTC']),
    /only with "provision"/i,
  );
  assert.throws(() => parseOperatorArgs(['unknown-cmd']), /Unknown or missing command/i);
});

test('validateOwnerPasswordPolicy enforces length, non-whitespace, control-char, and non-matching-login rules', () => {
  assert.throws(() => validateOwnerPasswordPolicy('short123'), /at least 12/);
  assert.throws(() => validateOwnerPasswordPolicy('            '), /non-whitespace/);
  assert.throws(() => validateOwnerPasswordPolicy('ValidLength\u0000Bad'), /control characters/);
  assert.throws(
    () => validateOwnerPasswordPolicy('owner@example.test', 'OWNER@example.test'),
    /must not match/i,
  );
  validateOwnerPasswordPolicy('StrongSyntheticPassword!2026', 'owner@example.test');
});

test('hashOwnerPassword produces salted adaptive scrypt PHC strings', async () => {
  const h1 = await hashOwnerPassword('StrongSyntheticPassword!2026');
  const h2 = await hashOwnerPassword('StrongSyntheticPassword!2026');
  assert.match(h1, /^\$scrypt\$ln=16,r=8,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
  assert.notEqual(h1, h2);
});
