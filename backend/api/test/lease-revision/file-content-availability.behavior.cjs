require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { FileService } = require('../../src/modules/file/file.service.ts');
const { FileRepository } = require('../../src/modules/file/file.repository.ts');
const record = { id: 'file', propertyId: 'property', uploaderUserId: 'admin', filePurpose: 'payment_proof',
  storagePath: 'property/payment_proof/file.pdf', checksumSha256: 'checksum', fileSizeBytes: 10,
  isDeleted: false, archivePurgeCommandId: null, metadata: {} };
const actor = { id: 'admin', roles: ['admin'], permissions: [] };
function fixture(storage, extra = {}) {
  const marks = [], audits = [];
  const service = new FileService({ findById: async () => ({ ...record, ...extra }),
    recordContentAvailability: async (file, available) => marks.push({ id: file.id, available }) },
    { assertCanReadProperty: async () => {} }, { write: async entry => audits.push(entry) }, {}, {}, storage);
  return { service, marks, audits };
}
test('verified missing content marks availability only, not deletion or a successful download', async () => {
  const f = fixture({ exists: async () => false });
  await assert.rejects(f.service.readContent(actor, record.id, {}), error => error.getResponse?.().code === 'FILE_CONTENT_NOT_FOUND');
  assert.deepEqual(f.marks, [{ id: record.id, available: false }]);
  assert.equal(f.audits.length, 0);
});
test('unavailable storage returns an actionable retry error without writing an absence fact', async () => {
  const f = fixture({ exists: async () => { throw Object.assign(new Error('private path'), { code: 'EACCES' }); } });
  await assert.rejects(f.service.readContent(actor, record.id, {}), error => error.getStatus?.() === 503 &&
    error.getResponse().code === 'FILE_STORAGE_UNAVAILABLE' && !error.getResponse().message.includes('private path'));
  assert.deepEqual(f.marks, []);
});
test('a restored file clears only its missing-content marker after reading successfully', async () => {
  const f = fixture({ exists: async () => true, read: async () => Buffer.from('restored') },
    { metadata: { storage_content_unavailable: true } });
  assert.equal((await f.service.readContent(actor, record.id, {})).buffer.toString(), 'restored');
  assert.deepEqual(f.marks, [{ id: record.id, available: true }]);
  assert.equal(f.audits[0].resultStatus, 'success');
});
test('a disappeared file is rechecked but a transient read failure never marks it absent', async () => {
  for (const code of ['ENOENT', 'EIO']) {
    let calls = 0;
    const f = fixture({ exists: async () => ++calls === 1,
      read: async () => { throw Object.assign(new Error('Read failed'), { code }); } });
    await assert.rejects(f.service.readStoredContent(record), error => error.getResponse?.().code ===
      (code === 'ENOENT' ? 'FILE_CONTENT_NOT_FOUND' : 'FILE_STORAGE_UNAVAILABLE'));
    assert.deepEqual(f.marks, code === 'ENOENT' ? [{ id: record.id, available: false }] : []);
  }
});
test('purge claims deny reads before checking storage or changing metadata', async () => {
  const f = fixture({ exists: async () => { throw new Error('Must not inspect storage'); } },
    { archivePurgeCommandId: 'claimed' });
  await assert.rejects(f.service.readContent(actor, record.id, {}), error => error.getResponse?.().code === 'FILE_ARCHIVE_PURGE_UNAVAILABLE');
  assert.deepEqual(f.marks, []);
});
test('availability updates match exact content identity and never mutate a purge claim or deletion state', async () => {
  const queries = [];
  const repository = new FileRepository({ client: { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; } } });
  await repository.recordContentAvailability(record, false);
  await repository.recordContentAvailability(record, true);
  for (const { sql, values } of queries) {
    assert.match(sql, /archive_purge_command_id IS NULL/);
    assert.match(sql, /is_deleted = false/);
    assert.match(sql, /storage_path = \$3 AND checksum_sha256 = \$4 AND file_size_bytes = \$5/);
    assert.doesNotMatch(sql, /SET is_deleted|deleted_at|freed_bytes|lease_file_purge_items/);
    assert.deepEqual(values.slice(0, 5), ['file', 'property', record.storagePath, 'checksum', 10]);
  }
});
