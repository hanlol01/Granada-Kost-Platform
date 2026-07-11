import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sanitizeEvidenceText } from '../../src/infrastructure/database/scripts/admin-ux-m1/sanitized-evidence';

test('redacts database URLs and authorization material from evidence text', () => {
  const sanitized = sanitizeEvidenceText(
    'DATABASE_URL=postgresql://qa_user:qa_password@127.0.0.1:5432/granada_kost_m1_qa bearer abc.def.ghi token=opaque',
  );

  assert.equal(sanitized.includes('qa_password'), false);
  assert.equal(sanitized.includes('abc.def.ghi'), false);
  assert.equal(sanitized.includes('opaque'), false);
  assert.match(sanitized, /\[redacted-database-url\]/);
});
