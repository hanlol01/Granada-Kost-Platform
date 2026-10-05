require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { formatRecordedAt } = require('../../../../apps/admin/src/lib/format.ts');
test('archive audit instants display date and time in Jakarta, not a date-only placeholder', () => {
  const result = formatRecordedAt('2026-10-04T18:30:00.000Z');
  assert.match(result, /5 Oktober 2026/);
  assert.match(result, /01[.:]30/);
});
test('invalid or absent audit timestamps display an em dash', () => {
  assert.equal(formatRecordedAt(''), '—');
  assert.equal(formatRecordedAt('not-a-timestamp'), '—');
});
