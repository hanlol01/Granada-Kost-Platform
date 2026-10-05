require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { LeaseArchiveRestorationService } = require('../../src/modules/lease/lease-archive-restoration.service.ts');

test('restoration rejects non-Admin access and invalid confirmation before any database write', async () => {
  let writes = 0;
  const repository = { transaction: async () => { writes++; throw new Error('Must not write'); } };
  const service = new LeaseArchiveRestorationService(repository, {}, {}, {});
  const user = { id: 'admin', roles: ['admin'], permissions: ['lease.manage'], propertyIds: ['property'] };
  const dto = { property_id: 'property', reason: 'Kesalahan pencatatan', review_fingerprint: 'a'.repeat(64), restoration_confirmed: true };
  await assert.rejects(service.restore({ ...user, roles: ['property_owner'] }, 'archive', dto, 'key'), error => error.getStatus() === 403);
  await assert.rejects(service.restore(user, 'archive', { ...dto, restoration_confirmed: false }, 'key'), error => error.getResponse().code === 'LEASE_ARCHIVE_RESTORE_CONFIRMATION_REQUIRED');
  await assert.rejects(service.restore(user, 'archive', dto), error => error.getResponse().code === 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(writes, 0);
});
