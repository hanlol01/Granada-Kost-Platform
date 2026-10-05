// Exercise the actual TypeScript authorities without producing build artifacts.
require('reflect-metadata');
const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(
    ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }).outputText,
    filename,
  );
};

const propertyId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';
const user = {
  id: '33333333-3333-4333-8333-333333333333',
  roles: ['admin'],
  permissions: ['lease.manage'],
  propertyIds: [propertyId],
};
const baseline = {
  leaseStatus: 'awaiting_activation',
  physicalCheckInRecorded: false,
  checkoutState: null,
  scheduledTransfer: false,
  pendingRenewal: false,
  relatedTransactionCount: 0,
  recognizedIncomeAmount: 0,
  ownerRealizationLinked: false,
};
function policy(overrides = {}) {
  const {
    evaluateLeaseRevisionPolicies,
  } = require('../../src/modules/lease/lease-revision-policy.helper.ts');
  return evaluateLeaseRevisionPolicies({ ...baseline, ...overrides });
}
function createService(row, facts) {
  const {
    LeaseRevisionContextService,
  } = require('../../src/modules/lease/lease-revision-context.service.ts');
  const queries = [];
  const repository = {
    async transaction(operation) {
      return operation(this);
    },
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith('SET TRANSACTION')) return { rows: [] };
      return { rows: sql.includes('revision_financial_facts') ? [facts] : row ? [row] : [] };
    },
  };
  return { service: new LeaseRevisionContextService(repository), queries };
}
const row = {
  id: leaseId,
  property_id: propertyId,
  lease_code: 'LEASE-TEST',
  resident_id: '44444444-4444-4444-8444-444444444444',
  resident_name: 'Test Resident',
  room_id: '55555555-5555-4555-8555-555555555555',
  room_number: 'RK-06-03',
  manager_room_label: 'Rumah Kost · Unit 6, Kamar 3',
  plot_number: '6A',
  lease_status: 'awaiting_activation',
  commercial_mode: 'rent',
  start_date: '2027-01-01',
  end_date: '2028-01-01',
  term_months: 12,
  planned_start_date: '2027-01-01',
  service_period_state: 'pending_check_in',
  checked_in_date: null,
  physical_check_in_recorded: false,
  checkout_state: null,
  scheduled_transfer: false,
  pending_renewal: false,
  snapshot_monthly_price: '1800000',
  snapshot_reference_monthly_price: '1800000',
  contract_rent_amount: '21600000',
  pricing_source: 'standard',
  pricing_agreement_reason: null,
  owner_sponsorship: null,
};
const financialFacts = {
  payment_count: '0',
  payment_proof_count: '0',
  pending_proof_claimed_amount: '0',
  verified_payment_amount: '0',
  pending_payment_amount: '0',
  reversal_count: '0',
  deposit_transaction_count: '0',
  refund_count: '0',
  owner_realization_linked: false,
  recognized_income_amount: '0',
  current_rent_invoice_amount: '21600000',
};

test('an unoccupied unpaid lease can be corrected or archived without claiming checkout', () => {
  const result = policy();
  assert.equal(result.correction.allowed, true);
  assert.equal(result.room_correction.allowed, true);
  assert.equal(result.room_correction.requires_evidence, false);
  assert.equal(result.commercial_mode_change.allowed, true);
  assert.equal(result.cancellation.allowed, true);
  assert.equal(result.cancellation.financial_resolution_required, false);
});
test('activation alone permits the mistaken-activation path with a second confirmation', () => {
  const result = policy({ leaseStatus: 'active' });
  assert.equal(result.cancellation.allowed, true);
  assert.equal(result.cancellation.requires_mistaken_activation_confirmation, true);
  assert.equal(result.correction.allowed, true);
});
test('real occupancy allows amendments, requires evidence for a recording error, and forbids cancellation', () => {
  const result = policy({ leaseStatus: 'active', physicalCheckInRecorded: true });
  assert.equal(result.correction.allowed, true);
  assert.equal(result.room_correction.allowed, true);
  assert.equal(result.room_correction.requires_evidence, true);
  assert.equal(result.cancellation.allowed, false);
  assert.equal(result.cancellation.code, 'LEASE_CANCELLATION_REAL_OCCUPANCY');
  assert.match(result.cancellation.message, /[Cc]heck-out/);
});
test('pre-check-in payments permit archive but explicitly retain unresolved finance', () => {
  const result = policy({ relatedTransactionCount: 1 });
  assert.equal(result.cancellation.allowed, true);
  assert.equal(result.cancellation.financial_resolution_required, true);
  assert.equal(result.commercial_mode_change.allowed, false);
  assert.match(result.commercial_mode_change.message, /pembayaran|keuangan/);
});
test('a reversed transaction is still history and cannot enable a commercial-mode flip', () => {
  assert.equal(policy({ relatedTransactionCount: 2 }).commercial_mode_change.allowed, false);
});
test('recognized income prevents reattributing a room or commercial mode without settlement', () => {
  const result = policy({ recognizedIncomeAmount: 1500000 });
  assert.equal(result.room_correction.allowed, false);
  assert.equal(result.commercial_mode_change.allowed, false);
  assert.equal(result.cancellation.allowed, false);
  assert.match(result.room_correction.message, /pendapatan|realisasi/);
});
test('an Owner realization locks corrections and cancellation without erasing published history', () => {
  const result = policy({ ownerRealizationLinked: true });
  for (const key of ['correction', 'room_correction', 'commercial_mode_change', 'cancellation']) {
    assert.equal(result[key].allowed, false);
    assert.match(result[key].message, /realisasi Owner/);
  }
});
test('checkout in progress and completed both provide an actionable rejection', () => {
  for (const state of ['notice_recorded', 'inspection_completed', 'completed']) {
    const result = policy({ checkoutState: state });
    assert.equal(result.correction.allowed, false);
    assert.equal(result.cancellation.allowed, false);
    assert.match(result.correction.message, /check-out/);
  }
  assert.equal(policy({ checkoutState: 'cancelled' }).correction.allowed, true);
});
test('scheduled transfer or renewal must be resolved before rewriting the source lease', () => {
  for (const override of [{ scheduledTransfer: true }, { pendingRenewal: true }]) {
    const result = policy(override);
    assert.equal(result.correction.allowed, false);
    assert.equal(result.cancellation.allowed, false);
    assert.match(result.correction.message, /pindah|perpanjangan/);
  }
});
test('terminal and unknown lease states fail closed', () => {
  for (const leaseStatus of ['cancelled', 'ended', 'transferred', 'draft', 'unexpected']) {
    const result = policy({ leaseStatus });
    assert.equal(result.correction.allowed, false);
    assert.equal(result.cancellation.allowed, false);
  }
});
test('missing or unsafe financial facts never become an assumed zero', () => {
  for (const amount of [NaN, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const result = policy({ recognizedIncomeAmount: amount });
    assert.equal(result.correction.allowed, false);
    assert.equal(result.correction.code, 'LEASE_REVISION_FACTS_INVALID');
  }
});
test('the context retains duration/planned arrival without inventing an effective pre-check-in period', async () => {
  const { service } = createService(row, financialFacts);
  const result = await service.get(user, leaseId);
  assert.equal(result.data.lease.term_months, 12);
  assert.equal(result.data.lease.planned_start_date, '2027-01-01');
  assert.equal(result.data.lease.effective_start_date, null);
  assert.equal(result.data.lease.effective_end_date, null);
  assert.equal(result.data.room.plot_number, '6A');
  assert.equal(result.data.financial.related_transaction_count, 0);
});
test('a sponsored charged/waived policy is preserved as data, not inferred from zero rent', async () => {
  for (const management_fee_mode of ['charged', 'waived']) {
    const sponsorship = {
      owner_profile_id: 'owner',
      management_fee_mode,
      management_fee_payer: management_fee_mode === 'charged' ? 'owner' : null,
      snapshot_monthly_management_fee: management_fee_mode === 'charged' ? 300000 : 0,
    };
    const { service } = createService(
      {
        ...row,
        commercial_mode: 'owner_sponsored',
        contract_rent_amount: '0',
        snapshot_monthly_price: '0',
        owner_sponsorship: sponsorship,
      },
      financialFacts,
    );
    const result = await service.get(user, leaseId);
    assert.deepEqual(result.data.owner_sponsorship, sponsorship);
    assert.equal(result.data.lease.commercial_mode, 'owner_sponsored');
  }
});
test('all payment/deposit/refund history participates in commercial-mode eligibility', async () => {
  const { service } = createService(row, {
    ...financialFacts,
    payment_count: '1',
    reversal_count: '1',
    deposit_transaction_count: '2',
    refund_count: '1',
  });
  const result = await service.get(user, leaseId);
  assert.equal(result.data.financial.related_transaction_count, 5);
  assert.equal(result.data.policies.commercial_mode_change.allowed, false);
  assert.equal(result.data.policies.cancellation.financial_resolution_required, true);
});
test('a pending transfer claim without a payment retains financial review and is not verified money', async () => {
  const { service } = createService(row, {
    ...financialFacts,
    payment_proof_count: '1',
    pending_proof_claimed_amount: '1500000',
  });
  const { data } = await service.get(user, leaseId);
  assert.equal(data.financial.payment_proof_count, 1);
  assert.equal(data.financial.pending_proof_claimed_amount, 1500000);
  assert.equal(data.financial.verified_payment_amount, 0);
  assert.equal(data.financial.pending_payment_amount, 0);
  assert.equal(data.financial.related_transaction_count, 1);
  assert.equal(data.policies.cancellation.allowed, true);
  assert.equal(data.policies.cancellation.financial_resolution_required, true);
  assert.equal(data.policies.commercial_mode_change.allowed, false);
});
test('missing or unsafe transfer-claim facts cannot silently void invoices', async () => {
  for (const value of [undefined, '-1', '9007199254740992']) {
    const { service } = createService(row, { ...financialFacts, pending_proof_claimed_amount: value });
    await assert.rejects(service.get(user, leaseId), error => error.getResponse?.().code === 'LEASE_REVISION_FACTS_INVALID');
  }
});
test('non-Admin or another property receives no financial or identity context', async () => {
  for (const unauthorized of [
    { ...user, roles: ['property_owner'] },
    { ...user, roles: ['manager'] },
    { ...user, propertyIds: [] },
    { ...user, permissions: ['lease.read'] },
  ]) {
    const { service, queries } = createService(row, financialFacts);
    await assert.rejects(service.get(unauthorized, leaseId), (error) => error.getStatus() === 403);
    assert.equal(queries.filter(({ sql }) => sql.includes('revision_financial_facts')).length, 0);
  }
});
test('an unknown lease receives a specific 404, not an empty eligible context', async () => {
  const { service } = createService(null, financialFacts);
  await assert.rejects(service.get(user, leaseId), (error) => error.getStatus() === 404);
});
