require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const originalLoad = Module._load;
// Keep API/browser dependencies outside this parser unit test; the actual read
// contract and request-path functions execute unchanged with an injected requester.
Module._load = function(id, ...args) {
  if (id === '@/lib/api') return { apiClient: {} };
  if (id === '@/lib/document-download') return {};
  if (id === '@/lib/env') return { env: {} };
  return originalLoad.call(this, id, ...args);
};
const contract = require('../../../../apps/penghuni/src/lib/penghuni-w06-billing.ts');
Module._load = originalLoad;
const id = '11111111-1111-4111-8111-111111111111';
function payload() {
  return { data: { lease: { id, property_id: id, status: 'cancelled', start_date: '2026-08-01', end_date: '2027-08-01',
    payment_plan: 'annual_full', commercial_mode: 'owner_sponsored', contract_rent: 0, monthly_rate: 0,
    pricing_source: 'owner_sponsored', remaining_days: 0, note: 'Catatan kontrak' },
    summary: { rent_invoiced: 0, rent_paid: 0, rent_outstanding: 0, security_deposit_required: 0,
      security_deposit_target: 0, deposit_collected: 0, deposit_deducted: 0, deposit_refunded: 0,
      deposit_balance: 0, installment_paid: 0, installment_total: 0, next_due_date: null, overdue_count: 0 },
    owner_sponsorship: null, contract_settlement: null, invoices: [], payments: [], proofs: [],
    financial_timeline: [], exit_documents: [] } };
}
test('the real self projection accepts cancelled sponsored contracts without fabricating an active lease', () => {
  const result = contract.parseMyW06Billing(payload());
  assert.equal(result.lease.status, 'cancelled');
  assert.equal(result.lease.commercial_mode, 'owner_sponsored');
  assert.equal(result.summary.security_deposit_target, 0);
});
test('the current server settlement policy remains readable after cancellation with no payment authority', () => {
  const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');
  const service = new W06BillingService({}, {}, {});
  const input = payload();
  input.data.contract_settlement = service.projectContractSettlement({ id, invoice_id: id,
    state: 'cancelled', policy_snapshot_id: id, policy_version: 'lease_settlement_v4',
    total_amount: '12000', credit_amount: '0', allocated_amount: '3000',
    initial_payment_allocated: '3000', deposit_offset_amount: '0' });
  const settlement = contract.parseMyW06Billing(input).contract_settlement;
  assert.equal(settlement.policy_version, 'lease_settlement_v4');
  assert.equal(settlement.status, 'cancelled');
  assert.equal(settlement.partial_payment_allowed, false);
  assert.equal(settlement.full_payment_required, false);
  input.data.contract_settlement.policy_version = 'unknown_policy';
  assert.throws(() => contract.parseMyW06Billing(input), /Versi kebijakan/);
});
test('explicit reversal fields from the server are parsed rather than rejecting all payment history', () => {
  const input = payload();
  input.data.payments = [{ id, payment_code: 'PAY-OLD', payment_method: 'bank_transfer', payment_status: 'reversed',
    payment_purpose: 'management_fee', amount: 1000, paid_at: null, verified_at: null,
    reversal_id: id, receipt_id: id, reversal_receipt_id: id, reversal_reason: 'Koreksi pembayaran',
    reversed_at: '2026-10-01T00:00:00.000Z', allocations: [] }];
  assert.equal(contract.parseMyW06Billing(input).payments[0].reversal_receipt_id, id);
});
test('history pagination is strict and preserves null dates before physical check-in', () => {
  const value = { data: { items: [{ id, lease_code: 'LEASE-OLD', room_number: 'RK-01-02', status: 'cancelled',
    term_months: 12, start_date: null, end_date: null, closed_at: '2026-10-01T00:00:00.000Z' }],
    total: 1, offset: 0, limit: 20 } };
  assert.equal(contract.parseMyBillingHistory(value).items[0].start_date, null);
  assert.throws(() => contract.parseMyBillingHistory({ data: { ...value.data, private_note: 'No' } }));
  assert.throws(() => contract.parseMyBillingHistory({ data: { ...value.data, total: -1 } }));
});
test('historical requests use only the self endpoint and return no active data placeholder', async () => {
  const paths = [];
  const requester = { get: async path => { paths.push(path); return path.endsWith(id) ? payload().data :
    { items: [], total: 2, offset: 20, limit: 20 }; } };
  assert.equal((await contract.getMyBillingHistory(20, undefined, requester)).total, 2);
  assert.equal((await contract.getMyHistoricalBilling(id, undefined, requester)).lease.status, 'cancelled');
  assert.deepEqual(paths, ['/my/billing/history?limit=20&offset=20', `/my/billing/history/${id}`]);
});

test('resident evidence strictly binds links to the selected lease and never invents purge confirmation', () => {
  const input = payload();
  const fileId = '22222222-2222-4222-8222-222222222222';
  const evidence = { id: fileId, original_filename: 'proof.pdf', mime_type: 'application/pdf', file_size_bytes: 50,
    availability: 'available', purged_at: null, content_path: `/my/billing/${id}/evidence/${fileId}/content` };
  input.data.proofs = [{ id, invoice_id: id, proof_status: 'pending_review', claimed_amount: 1000, payment_purpose: 'rent',
    uploaded_at: '2026-10-01T00:00:00Z', reviewed_at: null, reject_reason: null, evidence: [evidence] }];
  assert.equal(contract.parseMyW06Billing(input).proofs[0].evidence[0].id, fileId);
  for (const path of [`/files/${fileId}/content`, `/my/billing/${fileId}/evidence/${fileId}/content`, 'https://untrusted.test/proof']) {
    evidence.content_path = path;
    assert.throws(() => contract.parseMyW06Billing(input), /Alamat bukti/);
  }
  evidence.availability = 'purged'; evidence.content_path = null;
  assert.throws(() => contract.parseMyW06Billing(input), /penghapusan/);
  evidence.purged_at = '2026-10-01T00:00:00Z';
  assert.equal(contract.parseMyW06Billing(input).proofs[0].evidence[0].content_path, null);
  evidence.availability = 'unavailable'; evidence.purged_at = null;
  assert.equal(contract.parseMyW06Billing(input).proofs[0].evidence[0].availability, 'unavailable');
});
