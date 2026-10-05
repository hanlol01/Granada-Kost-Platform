require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseDataCorrectionService,
} = require('../../src/modules/lease/lease-data-correction.service.ts');
const {
  evaluateLeaseRevisionPolicies,
} = require('../../src/modules/lease/lease-revision-policy.helper.ts');
const user = {
  id: 'admin',
  roles: ['admin'],
  permissions: ['lease.manage'],
  propertyIds: ['property'],
};
const lease = {
  id: 'lease',
  property_id: 'property',
  resident_id: 'resident',
  room_id: 'room',
  occupancy_id: null,
  lease_status: 'awaiting_activation',
  commercial_mode: 'rent',
  start_date: '2090-01-01',
  end_date: '2091-01-01',
  term_months: 12,
  snapshot_pricing_tier: 'long_stay',
  snapshot_reference_monthly_price: '1800000',
  snapshot_monthly_price: '1800000',
  contract_rent_amount: '21600000',
  pricing_source: 'standard',
  pricing_agreement_reason: null,
  effective_checked_in_date: null,
};

for (const [name, overrides, expected] of [
  [
    'Owner realization',
    { ownerRealizationLinked: true },
    'LEASE_REVISION_OWNER_REALIZATION_BLOCKED',
  ],
  ['scheduled transfer', { scheduledTransfer: true }, 'LEASE_REVISION_SUCCESSOR_PENDING'],
  ['pending renewal', { pendingRenewal: true }, 'LEASE_REVISION_SUCCESSOR_PENDING'],
]) {
  test(`the real correction preview enforces ${name} policy before calculating changes`, async () => {
    let contextReads = 0;
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes('SELECT lease.id,lease.property_id')) return { rows: [lease] };
        if (sql.includes('FROM lease_checkout_commands') || sql.includes('SELECT id FROM leases'))
          return { rows: [] };
        throw new Error('Preview continued past an unresolved lifecycle dependency');
      },
    };
    const repository = { transaction: (operation) => operation(client) };
    const revisions = {
      async readInTransaction() {
        contextReads++;
        return {
          data: {
            policies: evaluateLeaseRevisionPolicies({
              leaseStatus: 'awaiting_activation',
              physicalCheckInRecorded: false,
              checkoutState: null,
              scheduledTransfer: false,
              pendingRenewal: false,
              relatedTransactionCount: 0,
              recognizedIncomeAmount: 0,
              ownerRealizationLinked: false,
              ...overrides,
            }),
          },
        };
      },
    };
    const service = new LeaseDataCorrectionService(repository, {}, {}, revisions);
    await assert.rejects(
      service.preview(user, 'lease', { reason: 'Recording correction' }),
      (error) => error.getResponse?.().code === expected,
    );
    assert.equal(contextReads, 1);
    assert.ok(queries.every((sql) => !/INSERT|UPDATE leases SET|DELETE FROM/.test(sql)));
  });
}
