require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseCommercialModeCorrectionService,
} = require('../../src/modules/lease/lease-commercial-mode-correction.service.ts');

function fixture(overrides = {}) {
  const calls = [],
    effects = [];
  const facts = {
    leaseId: 'lease',
    propertyId: 'property',
    residentId: 'resident',
    roomId: 'room',
    sourceMode: 'rent',
    targetMode: 'owner_sponsored',
    leaseStatus: 'awaiting_activation',
    servicePeriodState: 'pending_check_in',
    activatedAt: null,
    onboardingCommitmentId: 'commitment',
    startDate: '2090-01-01',
    endDate: '2091-01-01',
    termMonths: 12,
    billingCycle: 'yearly',
    paymentPlanType: 'annual_full',
    policy: { allowed: true },
    lock: false,
    ...overrides.facts,
  };
  const term = overrides.term ?? { id: 'term', term_status: 'active', owner_profile_id: 'owner' };
  const settlement =
    overrides.settlement === null
      ? null
      : {
          id: 'settlement',
          invoice_id: 'invoice',
          state: facts.sourceMode === 'rent' ? 'awaiting_activation' : 'cancelled',
          ...overrides.settlement,
        };
  const invoices =
    overrides.invoices ??
    (facts.sourceMode === 'rent'
      ? [
          {
            id: 'invoice',
            invoice_code: 'RENT-01',
            invoice_purpose: 'rent',
            invoice_status: 'issued',
            credit_amount: '0',
            allocated_amount: '0',
            proof_count: 0,
          },
        ]
      : []);
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('revision_mode_invoices')) return { rows: invoices };
      if (sql.includes('revision_mode_proof_history'))
        return { rows: [{ count: overrides.proofHistoryCount ?? 0 }] };
      if (sql.includes('revision_mode_target_building'))
        return { rows: [{ building_code: 'RK-01' }] };
      if (sql.includes('revision_mode_settlement'))
        return { rows: settlement ? [{ data: settlement }] : [] };
      if (sql.includes('revision_mode_term'))
        return { rows: facts.sourceMode === 'owner_sponsored' ? [{ data: term }] : [] };
      if (sql.includes('revision_mode_sequence')) return { rows: [{ maximum: 9 }] };
      return { rows: [], rowCount: overrides.updatedCount ?? 1 };
    },
  };
  const sponsorship = {
    prepareNewPolicy: async (_, __, input) => {
      effects.push({ prepare: input });
      return {
        ownerProfileId: 'owner',
        managementFeeMode: 'waived',
        projectedManagementFeeAmount: 0,
      };
    },
  };
  const billing = {
    voidInvoiceInTransaction: async (_, __, id) => {
      effects.push({ void: id });
    },
  };
  const issuance = {
    issueScheduleInTransaction: async (_, input) => {
      effects.push({ issue: input });
      return { firstInvoiceId: 'new-invoice' };
    },
  };
  return {
    facts,
    client,
    calls,
    effects,
    service: new LeaseCommercialModeCorrectionService(billing, issuance, sponsorship),
  };
}
const input = {
  sponsoring_owner_profile_id: 'owner',
  management_fee_mode: 'waived',
  owner_sponsorship_reason: 'Originally owner sponsored',
};
test('unchanged commercial mode is a no-op with no additional queries', async () => {
  const f = fixture({ facts: { targetMode: 'rent' } });
  assert.equal(await f.service.preview(f.client, f.facts, {}), null);
  assert.equal(f.calls.length, 0);
});
test('a financial-policy rejection occurs before invoice or Owner reads', async () => {
  const f = fixture({
    facts: {
      policy: {
        allowed: false,
        code: 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
        message: 'Tinjau pembayaran terlebih dahulu.',
      },
    },
  });
  await assert.rejects(
    f.service.preview(f.client, f.facts, input),
    (error) => error.getResponse().code === 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
  );
  assert.equal(f.calls.length, 0);
});
test('rent-to-sponsored review retains old billing authority and resolves an explicit new policy without writes', async () => {
  const f = fixture();
  const plan = await f.service.preview(f.client, f.facts, input);
  assert.equal(plan.previousBilling.invoices[0].invoice_code, 'RENT-01');
  assert.equal(plan.newSponsorship.managementFeeMode, 'waived');
  assert.equal(plan.sequenceOffset, 9);
  assert.ok(f.calls.every((call) => !/^\s*(UPDATE|INSERT|DELETE)/.test(call.sql)));
});
test('pending proof, allocated/credited invoice, other-charge, and incomplete settlement require an actionable review', async () => {
  for (const overrides of [
    {
      invoices: [
        {
          invoice_purpose: 'rent',
          invoice_status: 'issued',
          credit_amount: '0',
          allocated_amount: '0',
          proof_count: 1,
        },
      ],
    },
    {
      invoices: [
        {
          invoice_purpose: 'rent',
          invoice_status: 'issued',
          credit_amount: '1',
          allocated_amount: '0',
          proof_count: 0,
        },
      ],
    },
    {
      invoices: [
        {
          invoice_purpose: 'other_charge',
          invoice_status: 'issued',
          credit_amount: '0',
          allocated_amount: '0',
          proof_count: 0,
        },
      ],
    },
    { settlement: null },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(f.service.preview(f.client, f.facts, input), (error) =>
      /Tinjau|tinjau|Perbarui/.test(error.getResponse().message),
    );
  }
});
test('sponsored-to-rent review keeps the original term and has no new sponsorship', async () => {
  const f = fixture({ facts: { sourceMode: 'owner_sponsored', targetMode: 'rent' } });
  const plan = await f.service.preview(f.client, f.facts, {});
  assert.equal(plan.previousBilling.term.owner_profile_id, 'owner');
  assert.equal(plan.newSponsorship, null);
});
test('mode correction cannot proceed with missing commitment or an active effective period without an activation timestamp', async () => {
  for (const facts of [
    { onboardingCommitmentId: null },
    { leaseStatus: 'active', servicePeriodState: 'started', activatedAt: null },
  ]) {
    const f = fixture({ facts });
    await assert.rejects(f.service.preview(f.client, f.facts, input));
  }
});
test('commit retires unpaid invoices through W06 and retains the original settlement as cancelled', async () => {
  const f = fixture({ facts: { lock: true } });
  const plan = await f.service.preview(f.client, f.facts, input);
  await f.service.retireSource(f.client, f.facts, plan, { id: 'actor' }, 'Recording mistake');
  assert.ok(f.effects.some((effect) => effect.void === 'invoice'));
  assert.ok(f.calls.some((call) => call.sql.includes("state='cancelled'")));
  assert.ok(!f.calls.some((call) => /^\s*DELETE/.test(call.sql)));
});
test('rent reissuance uses the canonical schedule without credit or fictitious activation', async () => {
  const f = fixture({ facts: { sourceMode: 'owner_sponsored', targetMode: 'rent', lock: true } });
  const plan = await f.service.preview(f.client, f.facts, {});
  await f.service.applyTarget(f.client, f.facts, plan, 'correction', 'actor', {
    agreedMonthlyPrice: 1800000,
    contractRentAmount: 21600000,
    roomNumber: 'RK-01-01',
    kostTypeName: 'Rumah Kost',
  });
  const issued = f.effects.find((effect) => effect.issue).issue;
  assert.equal(issued.initialRentCredit, 0);
  assert.equal(issued.correction.activateFrom, null);
  assert.equal(issued.correction.previousSettlementId, 'settlement');
  assert.equal(issued.snapshotBuildingCode, 'RK-01');
});
test('a proof attached to an already voided invoice still blocks a mode correction', async () => {
  const f = fixture({ proofHistoryCount: 1 });
  await assert.rejects(
    f.service.preview(f.client, f.facts, input),
    (error) => error.getResponse().code === 'LEASE_MODE_CORRECTION_BILLING_REVIEW_REQUIRED',
  );
});
test('a target rent lease cannot silently discard proposed sponsorship inputs', async () => {
  const f = fixture({ facts: { sourceMode: 'owner_sponsored', targetMode: 'rent' } });
  await assert.rejects(
    f.service.preview(f.client, f.facts, input),
    (error) => error.getResponse().code === 'LEASE_MODE_CORRECTION_SPONSORSHIP_NOT_APPLICABLE',
  );
  assert.equal(f.calls.length, 0);
});
test('activation-only correction preserves the administrative activation without inventing check-in', async () => {
  const f = fixture({
    facts: {
      sourceMode: 'owner_sponsored',
      targetMode: 'rent',
      leaseStatus: 'active',
      servicePeriodState: 'pending_check_in',
      activatedAt: '2090-01-01T00:00:00+07:00',
      lock: true,
    },
  });
  const plan = await f.service.preview(f.client, f.facts, {});
  await f.service.applyTarget(f.client, f.facts, plan, 'correction', 'actor', {
    agreedMonthlyPrice: 1800000,
    contractRentAmount: 21600000,
    roomNumber: 'RK-01-01',
    kostTypeName: 'Rumah Kost',
  });
  assert.equal(
    f.effects.find((effect) => effect.issue).issue.correction.activateFrom,
    f.facts.activatedAt,
  );
  assert.equal(f.facts.servicePeriodState, 'pending_check_in');
});
