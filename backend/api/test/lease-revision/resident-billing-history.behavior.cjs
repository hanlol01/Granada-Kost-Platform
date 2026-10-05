require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');

const accountId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';
const user = { id: accountId, roles: ['resident'], permissions: ['billing.self.read'], propertyIds: [] };
function serviceWith(query) {
  return new W06BillingService({ client: { query } }, {}, {});
}
test('history is account scoped, paginated and discoverable independently of the current lease', async () => {
  const queries = [];
  const service = serviceWith(async (sql, values) => {
    queries.push({ sql, values });
    return { rows: sql.includes('count(*)') ? [{ total: '2' }] : [{ id: leaseId,
      lease_code: 'LEASE-OLD', room_number: 'RK-01-02', status: 'cancelled', term_months: 12,
      start_date: null, end_date: null, closed_at: new Date('2026-10-01T00:00:00Z') }] };
  });
  const result = await service.myBillingHistory(user, { limit: 10, offset: 0 });
  assert.equal(result.data.total, 2);
  assert.equal(result.data.items[0].lease_code, 'LEASE-OLD');
  assert.equal(result.data.items[0].start_date, null, 'Unstarted service periods stay hidden');
  for (const { sql, values } of queries) {
    assert.equal(values[0], accountId);
    assert.match(sql, /resident\.user_id=\$1/);
    assert.match(sql, /l\.lease_status IN \('cancelled','ended'\)/);
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/);
  }
  assert.deepEqual(queries.find(item => !item.sql.includes('count(*)')).values, [accountId, 10, 0]);
});
test('an empty history page retains its real total', async () => {
  const service = serviceWith(async sql => ({ rows: sql.includes('count(*)') ? [{ total: '2' }] : [] }));
  assert.deepEqual((await service.myBillingHistory(user, { limit: 10, offset: 20 })).data,
    { items: [], total: 2, limit: 10, offset: 20 });
});
test('historical detail scopes the lease to the authenticated resident and is read only', async () => {
  const queries = [];
  const service = serviceWith(async (sql, values) => {
    queries.push({ sql, values });
    return { rows: [{ id: leaseId, property_id: 'property', lease_status: 'cancelled' }] };
  });
  service.projectResidentBilling = async (_client, lease, view) => ({ lease: { id: lease.id }, view });
  const result = await service.myHistoricalBilling(user, leaseId);
  assert.equal(result.data.lease.id, leaseId);
  assert.equal(result.data.view, 'self');
  assert.match(queries[0].sql, /resident\.user_id=\$1 AND l\.id=\$2/);
  assert.match(queries[0].sql, /l\.lease_status IN \('cancelled','ended'\)/);
  assert.deepEqual(queries[0].values, [accountId, leaseId]);
});
test('another resident or a live lease cannot be selected through historical detail', async () => {
  const service = serviceWith(async () => ({ rows: [] }));
  await assert.rejects(service.myHistoricalBilling(user, leaseId),
    error => error.getStatus?.() === 404 && error.getResponse().code === 'RESIDENT_BILLING_HISTORY_NOT_FOUND');
});
test('Owner and Admin cannot call self history using a supplied resident identity', async () => {
  let queried = false;
  const service = serviceWith(async () => { queried = true; return { rows: [] }; });
  for (const roles of [['property_owner'], ['admin']]) {
    await assert.rejects(service.myBillingHistory({ ...user, roles }, {}), error => error.getStatus?.() === 403);
    await assert.rejects(service.myHistoricalBilling({ ...user, roles }, leaseId), error => error.getStatus?.() === 403);
  }
  assert.equal(queried, false);
});
test('cancelled leases still cannot accept a new resident transfer claim', async () => {
  const service = serviceWith(async () => ({ rows: [{ lease_status: 'cancelled' }] }));
  await assert.rejects(service.lockLeaseTuple({ query: service.database.client.query }, 'property', leaseId, 'resident', true),
    error => error.getResponse().code === 'LEASE_BILLING_STATUS_INVALID');
});

test('resident evidence requires an account-owned lease and an attached payment or proof before storage access', async () => {
  const fileId = '33333333-3333-4333-8333-333333333333';
  let scope = false, reads = 0;
  const queries = [], audits = [];
  const record = { id: fileId, propertyId: 'property', filePurpose: 'payment_proof', mimeType: 'application/pdf' };
  const service = new W06BillingService({ client: { query: async (sql, values) => {
    queries.push({ sql, values }); return { rows: scope ? [{ property_id: 'property' }] : [] };
  } } }, {}, { write: async event => audits.push(event) }, undefined,
  { findById: async () => record }, { readStoredContent: async record => { reads++; return { record, buffer: Buffer.from('proof') }; },
    downloadName: async () => 'Bukti-Pembayaran-PAY-001-01.pdf' });
  await assert.rejects(service.myBillingEvidence(user, leaseId, fileId, {}), error => error.getStatus?.() === 404);
  assert.equal(reads, 0);
  scope = true;
  const result = await service.myBillingEvidence(user, leaseId, fileId, {});
  assert.equal(result.buffer.toString(), 'proof');
  assert.equal(result.filename, 'Bukti-Pembayaran-PAY-001-01.pdf');
  assert.equal(audits[0].actorUserId, accountId);
  assert.equal(audits[0].afterData.lease_id, leaseId);
  for (const { sql, values } of queries) {
    assert.deepEqual(values, [leaseId, accountId, fileId]);
    assert.match(sql, /resident\.user_id=\$2/);
    assert.match(sql, /payment\.lease_id=l\.id AND payment\.resident_id=l\.resident_id/);
    assert.match(sql, /proof\.resident_id=l\.resident_id/);
    assert.match(sql, /invoice\.occupancy_id=l\.occupancy_id/);
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/);
  }
  await assert.rejects(service.myBillingEvidence({ ...user, roles: ['property_owner'] }, leaseId, fileId, {}), error => error.getStatus?.() === 403);
  assert.equal(reads, 1);
});

test('self evidence never exposes a general file URL and unavailable evidence stays linkless', () => {
  const service = serviceWith(async () => ({ rows: [] }));
  const id = '33333333-3333-4333-8333-333333333333';
  const metadata = { id, original_filename: 'proof.pdf', mime_type: 'application/pdf', file_size_bytes: 50,
    content_path: `/files/${id}/content`, availability: 'available', purged_at: null };
  assert.equal(service.selfEvidenceFiles([metadata], leaseId)[0].content_path, `/my/billing/${leaseId}/evidence/${id}/content`);
  for (const availability of ['purge_pending', 'unavailable'])
    assert.equal(service.selfEvidenceFiles([{ ...metadata, availability }], leaseId)[0].content_path, null);
});
