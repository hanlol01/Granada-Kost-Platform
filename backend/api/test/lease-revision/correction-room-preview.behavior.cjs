require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseDataCorrectionService,
} = require('../../src/modules/lease/lease-data-correction.service.ts');
const user = {
  id: 'admin',
  roles: ['admin'],
  permissions: ['lease.manage'],
  propertyIds: ['property'],
};
function fixture(changed = false, sponsored = false, options = {}) {
  const calls = [];
  const lease = {
    id: 'lease',
    property_id: 'property',
    resident_id: 'resident',
    room_id: 'old',
    occupancy_id: null,
    lease_status: 'awaiting_activation',
    onboarding_commitment_id: 'commitment',
    service_period_state: 'pending_check_in',
    activated_at: null,
    payment_plan_type: 'annual_full',
    billing_cycle: 'yearly',
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
    snapshot_room_number: 'RK-06-03',
    snapshot_kost_type_name: 'Standard',
    ...(sponsored
      ? {
          commercial_mode: 'owner_sponsored',
          snapshot_monthly_price: '0',
          contract_rent_amount: '0',
          pricing_source: 'owner_sponsored',
        }
      : {}),
  };
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('revision_owner_impact')) return { rows: [{ owner_profile_id: values[3] ?? (values[1] === 'new' ? options.targetOwner ?? 'owner' : 'owner'),
        owner_name: 'Owner uji', monthly_fee: '300000' }] };
      if (sql.includes('revision_document_impact')) return { rows: [] };
      if (sql.includes('revision_mode_invoices'))
        return {
          rows: sponsored
            ? []
            : [
                {
                  id: 'invoice',
                  invoice_code: 'RENT-01',
                  invoice_purpose: 'rent',
                  invoice_status: 'issued',
                  credit_amount: '0',
                  allocated_amount: '0',
                  proof_count: 0,
                },
              ],
        };
      if (sql.includes('revision_mode_proof_history')) return { rows: [{ count: 0 }] };
      if (sql.includes('revision_mode_settlement'))
        return {
          rows: sponsored
            ? []
            : [{ data: { id: 'settlement', invoice_id: 'invoice', state: 'awaiting_activation' } }],
        };
      if (sql.includes('revision_mode_term'))
        return {
          rows: sponsored
            ? [{ data: { id: 'term', term_status: 'active', owner_profile_id: 'owner' } }]
            : [],
        };
      if (sql.includes('revision_mode_sequence')) return { rows: [{ maximum: 0 }] };
      if (sql.includes('revision_mode_target_building'))
        return { rows: [{ building_code: 'RK-06' }] };
      if (sql.includes('revision_sponsorship_term'))
        return {
          rows: [
            {
              id: 'term',
              property_id: 'property',
              lease_id: 'lease',
              resident_id: 'resident',
              room_id: 'old',
              owner_profile_id: 'owner',
              ownership_kind: 'building',
              ownership_assignment_id: 'assignment',
              management_fee_mode: 'charged',
              management_fee_payer: 'owner',
              management_fee_payer_name: null,
              sponsorship_reason: 'Family occupancy',
              snapshot_monthly_management_fee: '300000',
              current_projected_management_fee_amount: '3600000',
              term_status: 'active',
              start_date: lease.start_date,
              end_date: lease.end_date,
              term_months: 12,
            },
          ],
        };
      if (sql.includes('revision_sponsorship_room_owner')) return { rows: [] };
      if (sql.includes('revision_sponsorship_owner'))
        return {
          rows: [
            {
              id: 'assignment',
              property_id: 'property',
              room_id: changed ? 'new' : 'old',
              owner_profile_id: options.targetOwner ?? 'owner',
              ownership_kind: 'building',
            },
          ],
        };
      if (sql.includes('SELECT lease.id,lease.property_id')) return { rows: [lease] };
      if (sql.includes('FROM lease_checkout_commands') || sql.includes('SELECT id FROM leases'))
        return { rows: [] };
      if (sql.includes('short_stay_monthly_price::text'))
        return {
          rows: [
            {
              short_stay_monthly_price: '1900000',
              medium_stay_monthly_price: '1850000',
              long_stay_monthly_price: '1800000',
              management_fee_amount: '300000',
            },
          ],
        };
      if (sql.includes('sum(allocation.allocated_amount')) return { rows: [{ amount: '0' }] };
      throw new Error(`Unexpected query ${sql.slice(0, 70)}`);
    },
  };
  const roomCalls = [];
  const roomCorrection = {
    preview: async (client, facts) => {
      roomCalls.push(facts);
      if (!changed) return null;
      return {
        previous: { id: 'old', number: 'RK-06-03' },
        corrected: {
          id: 'new',
          number: 'RK-06-06',
          manager_room_label: null,
          plot_number: null,
          kost_type_name: 'Standard',
        },
        targetStatus: 'reserved',
        evidenceFileIds: [],
        sourceBindings: { commitmentCount: 1, holdCount: 1 },
        ownerAssignment: null,
      };
    },
  };
  const revisions = {
    readInTransaction: async () => ({
      data: {
        policies: {
          correction: { allowed: true },
          room_correction: { allowed: true },
          sponsorship_policy_change: options.sponsorshipPolicy ?? { allowed: true },
          commercial_mode_change: { allowed: true },
        },
        lease: { physical_check_in_recorded: false },
        room: {
          number: 'RK-06-03',
          manager_room_label: 'Previous manager label',
          plot_number: '6A',
        },
        financial: { related_transaction_count: 0 },
        owner_sponsorship: sponsored ? { owner_profile_id: 'owner', owner_name: 'Owner uji',
          management_fee_mode: 'charged', snapshot_monthly_management_fee: '300000', projected_management_fee_amount: '3600000' } : null,
      },
    }),
  };
  return {
    service: new LeaseDataCorrectionService(
      { transaction: (operation) => operation(client) },
      {},
      {},
      revisions,
      roomCorrection,
    ),
    calls,
    roomCalls,
  };
}
test('same pricing values are not a correction just because snapshot key order changed', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.preview(user, 'lease', {
      pricing_source: 'standard',
      reason: 'Review existing terms',
    }),
    (error) => error.getResponse?.().code === 'LEASE_DATA_CORRECTION_NO_CHANGES',
  );
  assert.ok(f.calls.every((call) => !/^\s*(UPDATE|INSERT|DELETE)/i.test(call.sql)));
});
test('real correction preview includes before/after waived policy while rent stays zero', async () => {
  const f = fixture(false, true);
  const response = await f.service.preview(user, 'lease', {
    management_fee_mode: 'waived',
    reason: 'Owner had waived the fee but it was recorded incorrectly',
  });
  assert.equal(response.data.previous.owner_sponsorship.management_fee_mode, 'charged');
  assert.equal(response.data.corrected.owner_sponsorship.management_fee_mode, 'waived');
  assert.equal(response.data.corrected.owner_sponsorship.management_fee_payer, null);
  assert.equal(response.data.sponsorship_change.effective_from, '2090-01-01');
  assert.equal(response.data.impact.contract_amount_delta, 0);
  assert.equal(response.data.corrected.contract_rent_amount, 0);
  assert.ok(f.calls.every((c) => !/^\s*(UPDATE|INSERT|DELETE)/i.test(c.sql)));
});
test('rent preview rejects sponsorship fields instead of silently ignoring them', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.preview(user, 'lease', { management_fee_mode: 'waived', reason: 'Review mode' }),
    (e) => e.getResponse?.().code === 'LEASE_SPONSORSHIP_MODE_REQUIRED',
  );
});
test('room correction preview connects the real commercial authority and keeps missing new identifiers empty', async () => {
  const f = fixture(true);
  const response = await f.service.preview(user, 'lease', {
    room_id: 'new',
    room_recording_error_confirmed: true,
    reason: 'Original room was recorded incorrectly',
  });
  assert.equal(f.roomCalls[0].targetRoomId, 'new');
  assert.equal(f.roomCalls[0].relatedTransactionCount, 0);
  assert.equal(response.data.corrected.room_number, 'RK-06-06');
  assert.equal(response.data.corrected.manager_room_label, null);
  assert.equal(response.data.corrected.plot_number, null);
  assert.equal(response.data.corrected.contract_rent_amount, 21600000);
  assert.equal(response.data.impact.contract_amount_delta, 0);
  assert.equal(response.data.room_change.previous_room_number, 'RK-06-03');
  assert.ok(
    f.calls.some(
      (call) => call.sql.includes('short_stay_monthly_price::text') && call.values[0] === 'new',
    ),
  );
});
test('main preview converts rent to explicitly waived Owner sponsorship without a second financial calculation authority', async () => {
  const f = fixture();
  const response = await f.service.preview(user, 'lease', {
    commercial_mode: 'owner_sponsored',
    sponsoring_owner_profile_id: 'owner',
    management_fee_mode: 'waived',
    owner_sponsorship_reason: 'Original Owner instruction',
    reason: 'Original occupancy mode was recorded incorrectly',
  });
  assert.equal(response.data.previous.commercial_mode, 'rent');
  assert.equal(response.data.corrected.commercial_mode, 'owner_sponsored');
  assert.equal(response.data.corrected.contract_rent_amount, 0);
  assert.equal(response.data.corrected.owner_sponsorship.management_fee_mode, 'waived');
  assert.equal(
    response.data.corrected.commercial_change.invoices_to_void[0].invoice_code,
    'RENT-01',
  );
  assert.ok(f.calls.every((call) => !/^\s*(UPDATE|INSERT|DELETE)/.test(call.sql)));
});
test('main preview converts a sponsored lease to a real rent agreement and reviews a replacement schedule', async () => {
  const f = fixture(false, true);
  const response = await f.service.preview(user, 'lease', {
    commercial_mode: 'rent',
    pricing_source: 'standard',
    payment_plan_type: 'monthly_installments',
    billing_cycle: 'monthly',
    reason: 'Original occupancy mode was paid rental',
  });
  assert.equal(response.data.corrected.commercial_mode, 'rent');
  assert.equal(response.data.corrected.agreed_monthly_price, 1800000);
  assert.equal(response.data.corrected.contract_rent_amount, 21600000);
  assert.equal(response.data.corrected.owner_sponsorship, null);
  assert.match(response.data.corrected.commercial_change.notice, /bukan pengembalian/);
});
test('main preview combines an incorrectly recorded room and sponsor through the target ownership authority', async () => {
  const f = fixture(true, true, { targetOwner: 'target-owner' });
  const response = await f.service.preview(user, 'lease', {
    room_id: 'new',
    sponsoring_owner_profile_id: 'target-owner',
    management_fee_mode: 'waived',
    room_recording_error_confirmed: true,
    reason: 'Incorrect room and sponsoring Owner recorded at onboarding',
  });
  assert.equal(
    f.roomCalls[0].commercialMode,
    'rent',
    'old Owner assignment must not preempt the separately validated target policy',
  );
  assert.equal(response.data.previous.owner_sponsorship.owner_profile_id, 'owner');
  assert.equal(response.data.corrected.owner_sponsorship.owner_profile_id, 'target-owner');
  assert.equal(response.data.corrected.room_id, 'new');
  assert.equal(response.data.corrected.contract_rent_amount, 0);
});
test('combined room and sponsor review rejects financial history before invoking room rebinding', async () => {
  const f = fixture(true, true, {
    sponsorshipPolicy: {
      allowed: false,
      code: 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
      message: 'Tinjau pembayaran terlebih dahulu.',
    },
  });
  await assert.rejects(
    f.service.preview(user, 'lease', {
      room_id: 'new',
      sponsoring_owner_profile_id: 'target-owner',
      room_recording_error_confirmed: true,
      reason: 'Incorrect recorded sponsor and room',
    }),
    (e) => e.getResponse?.().code === 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
  );
  assert.equal(f.roomCalls.length, 0);
});
test('a room correction with fee-only inputs still uses one target sponsorship application', async () => {
  const f = fixture(true, true);
  const response = await f.service.preview(user, 'lease', {
    room_id: 'new',
    management_fee_mode: 'waived',
    room_recording_error_confirmed: true,
    reason: 'Correct original room and originally waived fee instruction',
  });
  assert.equal(f.roomCalls[0].commercialMode, 'rent');
  assert.equal(response.data.corrected.owner_sponsorship.owner_profile_id, 'owner');
  assert.equal(response.data.corrected.owner_sponsorship.management_fee_mode, 'waived');
});
