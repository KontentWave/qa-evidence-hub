import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFileFormatting } from './check-format.mjs';

test('accepts clean UTF-8 LF space-indented file with final newline', () => {
  const buf = Buffer.from('export const ready = true;\n  // indented\n', 'utf8');
  assert.deepEqual(validateFileFormatting(buf, 'apps/api/src/sample.ts'), []);
});

test('rejects CRLF line endings, missing final newline, trailing spaces, and leading tabs', () => {
  const crlf = Buffer.from('const a = 1;\r\n', 'utf8');
  assert.match(validateFileFormatting(crlf, 'scripts/a.mjs')[0], /CRLF/);

  const noEof = Buffer.from('const a = 1;', 'utf8');
  assert.match(validateFileFormatting(noEof, 'scripts/a.mjs')[0], /missing final newline/);

  const trailing = Buffer.from('const a = 1;   \n', 'utf8');
  assert.match(validateFileFormatting(trailing, 'scripts/a.mjs')[0], /trailing horizontal whitespace/);

  const tabs = Buffer.from('function f() {\n\treturn 1;\n}\n', 'utf8');
  assert.match(validateFileFormatting(tabs, 'scripts/a.mjs')[0], /leading tab indentation/);
});

test('allows trailing two-space line breaks in Markdown while still requiring LF and final newline', () => {
  const md = Buffer.from('# Heading  \n\nParagraph.\n', 'utf8');
  assert.deepEqual(validateFileFormatting(md, '.github/docs/runbook.md'), []);
});
