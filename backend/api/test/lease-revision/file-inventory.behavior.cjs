require('./register-typescript.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { LeaseArchiveFileInventoryService } = require('../../src/modules/lease/lease-archive-file-inventory.service.ts');
test('archive file inventory requires Admin read permission and exact property scope', async () => {
  let queries = 0;
  const service = new LeaseArchiveFileInventoryService({ transaction: async () => { queries++; throw new Error('Must not query'); } });
  const user = { id: 'admin', roles: ['admin'], permissions: ['lease.read'], propertyIds: ['property'] };
  for (const denied of [
    { ...user, roles: ['property_owner'] }, { ...user, permissions: [] },
    { ...user, propertyIds: ['other'] },
  ]) await assert.rejects(service.inventory(denied, 'archive', 'property'), error => error.getStatus() === 403);
  assert.equal(queries, 0);
});
