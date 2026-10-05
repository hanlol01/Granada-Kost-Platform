require('./register-typescript.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { LeaseArchiveFilePurgeService } = require('../../src/modules/lease/lease-archive-file-purge.service.ts');
test('permanent purge rejects unauthorized, unconfirmed or ambiguous intent before reserving/deleting', async () => {
  let writes = 0; let deleted = 0;
  const service = new LeaseArchiveFilePurgeService({ transaction: async () => { writes++; throw new Error('Must not reserve'); } }, {},
    { purgeVerified: async () => { deleted++; } });
  const user = { id: randomUUID(), roles: ['admin'], permissions: ['lease.manage'], propertyIds: ['property'] };
  const dto = { property_id: 'property', reason: 'Kesalahan pencatatan', review_fingerprint: 'a'.repeat(64),
    selected_file_ids: [randomUUID()], permanent_deletion_confirmed: true };
  for (const denied of [{ ...user, roles: ['property_owner'] }, { ...user, propertyIds: [] }, { ...user, permissions: [] }])
    await assert.rejects(service.purge(denied, 'archive', dto, 'key'), error => error.getStatus() === 403);
  await assert.rejects(service.purge(user, 'archive', { ...dto, permanent_deletion_confirmed: false }, 'key'), error => error.getResponse().code === 'LEASE_FILE_PURGE_CONFIRMATION_REQUIRED');
  await assert.rejects(service.purge(user, 'archive', dto), error => error.getResponse().code === 'IDEMPOTENCY_KEY_REQUIRED');
  await assert.rejects(service.purge(user, 'archive', { ...dto, selected_file_ids: [...dto.selected_file_ids,...dto.selected_file_ids] }, 'key'), error => error.getResponse().code === 'LEASE_FILE_PURGE_SELECTION_INVALID');
  await assert.rejects(service.purge(user, 'archive', { ...dto, reason: 'x' }, 'key'), error => error.getResponse().code === 'LEASE_FILE_PURGE_REASON_REQUIRED');
  assert.equal(writes, 0); assert.equal(deleted, 0);
});
