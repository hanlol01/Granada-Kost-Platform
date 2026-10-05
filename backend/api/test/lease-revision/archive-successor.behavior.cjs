require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareArchiveSuccessor } = require('../../src/modules/lease/lease-archive-successor.helper.ts');
const user = { id: 'admin', roles: ['admin'], permissions: ['lease.manage'], propertyIds: ['property'] };
test('ordinary onboarding performs no archive lookup, and incomplete successor authority is rejected before writes', async () => {
  let queries = 0;
  const client = { query: async () => { queries++; throw new Error('Not expected'); } };
  assert.equal(await prepareArchiveSuccessor(client, user, { property_id: 'property' }), null);
  await assert.rejects(prepareArchiveSuccessor(client, user, { property_id: 'property', source_archive_id: 'archive' }), error => error.getResponse().code === 'LEASE_ARCHIVE_SUCCESSOR_INPUT_REQUIRED');
  await assert.rejects(prepareArchiveSuccessor(client, { ...user, roles: ['property_owner'] }, {
    property_id: 'property', resident_id: 'resident', source_archive_id: 'archive', archive_replacement_reason: 'Periode dan kamar baru' }), error => error.getStatus() === 403);
  assert.equal(queries, 0);
});
