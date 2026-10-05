require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');

const id = '77777777-7777-4777-8777-777777777777';
const base = { id, original_filename: 'transfer.pdf', mime_type: 'application/pdf',
  file_size_bytes: '512', content_path: `/files/${id}/content` };
const service = new W06BillingService({});

test('available payment evidence retains only its canonical authorized content path', () => {
  assert.deepEqual(service.sanitizeEvidenceFiles([{ ...base, availability: 'available', purged_at: null }]),
    [{ ...base, file_size_bytes: 512, availability: 'available', purged_at: null }]);
});
test('verified purged payment evidence retains metadata, timestamp and no content link', () => {
  const purgedAt = '2026-10-04T10:00:00.000Z';
  const [file] = service.sanitizeEvidenceFiles([{ ...base, availability: 'purged', purged_at: purgedAt }]);
  assert.equal(file.id, id);
  assert.equal(file.availability, 'purged');
  assert.equal(file.purged_at, purgedAt);
  assert.equal(file.content_path, null);
});
test('an unresolved physical purge never claims absence or offers a content link', () => {
  const [file] = service.sanitizeEvidenceFiles([{ ...base, availability: 'purge_pending', purged_at: null }]);
  assert.equal(file.availability, 'purge_pending');
  assert.equal(file.content_path, null);
  assert.equal(file.purged_at, null);
});
test('legacy hidden metadata is unavailable, not a verified physical deletion', () => {
  const [file] = service.sanitizeEvidenceFiles([{ ...base, availability: 'unavailable', purged_at: null }]);
  assert.equal(file.availability, 'unavailable');
  assert.equal(file.content_path, null);
  assert.equal(file.purged_at, null);
});
test('inconsistent or unknown evidence state fails closed without internal details', () => {
  for (const value of [
    { ...base, availability: 'purged', purged_at: null },
    { ...base, availability: 'unsupported', purged_at: null },
    { ...base, availability: 'available', content_path: 'https://unsafe.invalid/file' },
  ]) {
    const [file] = service.sanitizeEvidenceFiles([{ ...value, storage_path: 'private', reason: 'private' }]);
    assert.equal(file.availability, 'unavailable');
    assert.equal(file.content_path, null);
    assert.equal(file.purged_at, null);
    assert.equal('storage_path' in file, false);
    assert.equal('reason' in file, false);
  }
});
