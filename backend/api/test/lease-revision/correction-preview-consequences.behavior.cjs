require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { LeaseDataCorrectionService } = require('../../src/modules/lease/lease-data-correction.service.ts');
const service = new LeaseDataCorrectionService({}, {}, {});
const previous = { commercialMode: 'rent', roomId: 'room-a', pricingSource: 'standard',
  startDate: '2026-10-01', endDate: '2027-10-01', termMonths: 12, contractRentAmount: 21600000 };
function client(documents = []) {
  const calls = [];
  return { calls, query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: sql.includes('revision_document_impact') ? documents : [{ owner_profile_id: 'owner', owner_name: 'Owner uji', monthly_fee: '300000' }] };
  } };
}
test('preview uses the full contract fee and prospective entitlement, never changes transfer facts', async () => {
  const db = client();
  const result = await service.previewConsequences(db, 'lease', 'property', previous,
    { ...previous, termMonths: 6, contractRentAmount: 10800000, endDate: '2027-04-01' });
  assert.equal(result.owner_impact.previous.management_fee_amount, 3600000);
  assert.equal(result.owner_impact.previous.projected_owner_entitlement, 18000000);
  assert.equal(result.owner_impact.corrected.management_fee_amount, 1800000);
  assert.equal(result.owner_impact.corrected.projected_owner_entitlement, 9000000);
  assert.equal(result.owner_impact.transfer_amount_unchanged, true);
  assert.equal(result.owner_impact.projection_only, true);
  assert.ok(db.calls.every(call => !/INSERT|UPDATE|DELETE/.test(call.sql)));
  assert.ok(db.calls.every(call => call.values.includes('property')));
});
test('Owner-sponsored preview shows its fee decision but no rental entitlement', async () => {
  const source = { owner_profile_id: 'sponsor', owner_name: 'Penanggung',
    management_fee_mode: 'charged', snapshot_monthly_management_fee: '300000', projected_management_fee_amount: '3600000' };
  const sponsored = { ...previous, commercialMode: 'owner_sponsored', pricingSource: 'owner_sponsored', contractRentAmount: 0 };
  const result = await service.previewConsequences(client(), 'lease', 'property', sponsored,
    { ...sponsored, termMonths: 6, endDate: '2027-04-01' }, source);
  assert.equal(result.owner_impact.previous.management_fee_amount, 3600000);
  assert.equal(result.owner_impact.corrected.management_fee_amount, 1800000);
  assert.equal(result.owner_impact.corrected.projected_owner_entitlement, 0);
});
test('document inventory distinguishes preserved payment facts, voided invoices and invalidated confirmation', async () => {
  const docs = [
    { document_type: 'invoice', document_code: 'INV-1', current_status: 'issued' },
    { document_type: 'payment_receipt', document_code: 'RCT-1', current_status: 'issued' },
    { document_type: 'contract_paid_confirmation', document_code: 'PAID-1', current_status: 'issued' },
    { document_type: 'contract_paid_confirmation', document_code: 'PAID-OLD', current_status: 'invalidated' },
  ];
  const result = await service.previewConsequences(client(docs), 'lease', 'property', previous,
    { ...previous, commercialMode: 'owner_sponsored', pricingSource: 'owner_sponsored', contractRentAmount: 0,
      ownerSponsorship: { ownerProfileId: 'owner', managementFeeMode: 'waived', monthlyManagementFee: 300000, projectedManagementFeeAmount: 0 } });
  assert.deepEqual(result.document_impact.map(row => row.effect), ['voided', 'retained', 'invalidated', 'already_invalidated']);
  const dateOnly = await service.previewConsequences(client(docs), 'lease', 'property', { ...previous, checkedInDate: '2026-10-01' },
    { ...previous, checkedInDate: '2026-10-02', startDate: '2026-10-02', endDate: '2027-10-02' });
  assert.equal(dateOnly.document_impact[0].effect, 'retained');
  assert.equal(dateOnly.document_impact[2].effect, 'retained', 'Check-in amendment retains confirmation and uses its effective period version');
});
test('unsafe commercial amounts refuse an uncertain preview with an operational recommendation', async () => {
  const db = { query: async () => ({ rows: [{ monthly_fee: String(Number.MAX_SAFE_INTEGER) }] }) };
  await assert.rejects(service.previewConsequences(db, 'lease', 'property', previous, previous),
    error => error.getResponse?.().code === 'LEASE_CORRECTION_OWNER_IMPACT_INVALID');
});
