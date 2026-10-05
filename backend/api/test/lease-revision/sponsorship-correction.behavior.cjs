require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseSponsorshipCorrectionService,
} = require('../../src/modules/lease/lease-sponsorship-correction.service.ts');

function fixture(overrides = {}) {
  const calls = [];
  const term = {
    id: 'term',
    property_id: 'property',
    lease_id: 'lease',
    resident_id: 'resident',
    room_id: 'room',
    owner_profile_id: 'owner',
    ownership_kind: 'building',
    ownership_assignment_id: 'assignment',
    term_status: 'active',
    management_fee_mode: 'charged',
    management_fee_payer: 'owner',
    management_fee_payer_name: null,
    sponsorship_reason: 'Family occupancy',
    snapshot_monthly_management_fee: '300000',
    current_projected_management_fee_amount: '900000',
    start_date: '2090-01-01',
    end_date: '2090-04-01',
    term_months: 3,
    ...overrides.term,
  };
  const facts = {
    leaseId: 'lease',
    propertyId: 'property',
    residentId: 'resident',
    roomId: 'room',
    commercialMode: 'owner_sponsored',
    startDate: '2090-01-01',
    endDate: '2090-04-01',
    termMonths: 3,
    lock: false,
    policy: { allowed: true },
    ...overrides.facts,
  };
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('revision_sponsorship_term'))
        return { rows: overrides.missingTerm ? [] : [term] };
      if (sql.includes('revision_sponsorship_room_owner'))
        return { rows: sql.includes("room.category='apartkost'") ? (overrides.roomOwnerRows ?? []) : [] };
      if (sql.includes('revision_sponsorship_owner'))
        return {
          rows: overrides.ownerRows ?? [
            {
              id: 'assignment',
              property_id: 'property',
              owner_profile_id: 'owner',
              room_id: facts.roomId,
              ownership_kind: 'building',
              owner_name: 'Owner',
            },
          ],
        };
      if (sql.includes('revision_sponsorship_fee'))
        return {
          rows: overrides.fees ?? [
            { month_index: 0, monthly_fee: '300000' },
            { month_index: 1, monthly_fee: '400000' },
            { month_index: 2, monthly_fee: '400000' },
          ],
        };
      if (sql.includes('INSERT INTO owner_sponsored_policy_revisions'))
        return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE owner_sponsored_lease_terms'))
        return { rows: [], rowCount: overrides.updatedCount ?? 1 };
      throw new Error(`Unexpected query ${sql.slice(0, 80)}`);
    },
  };
  return { client, facts, term, calls, service: new LeaseSponsorshipCorrectionService() };
}
async function rejected(f, dto, code) {
  await assert.rejects(
    f.service.preview(f.client, f.facts, dto),
    (e) => e.getResponse?.().code === code,
  );
  assert.ok(f.calls.every((c) => !/^\s*(UPDATE|INSERT|DELETE)/i.test(c.sql)));
}
test('absent sponsorship inputs preserve existing behavior without queries', async () => {
  const f = fixture();
  assert.equal(await f.service.preview(f.client, f.facts, {}), null);
  assert.equal(f.calls.length, 0);
});
test('a new sponsored policy requires explicit Owner instructions and reuses actual ownership and monthly fees', async () => {
  const f = fixture();
  const policy = await f.service.prepareNewPolicy(f.client, f.facts, {
    sponsoring_owner_profile_id: 'owner',
    management_fee_mode: 'charged',
    management_fee_payer: 'owner',
    owner_sponsorship_reason: 'Originally recorded as rent by mistake',
  });
  assert.equal(policy.ownerProfileId, 'owner');
  assert.equal(policy.ownershipAssignmentId, 'assignment');
  assert.equal(policy.projectedManagementFeeAmount, 1100000);
  assert.ok(!f.calls.some((call) => call.sql.includes('revision_sponsorship_term')));
  for (const input of [
    { management_fee_mode: 'waived', owner_sponsorship_reason: 'Mistake' },
    { sponsoring_owner_profile_id: 'owner', owner_sponsorship_reason: 'Mistake' },
    { sponsoring_owner_profile_id: 'owner', management_fee_mode: 'waived' },
  ])
    await assert.rejects(f.service.prepareNewPolicy(f.client, f.facts, input));
});
test('same normalized sponsorship input is not an amendment even with financial history', async () => {
  const f = fixture({
    facts: { policy: { allowed: false, code: 'FINANCE', message: 'Review finance' } },
  });
  assert.equal(
    await f.service.preview(f.client, f.facts, { owner_sponsorship_reason: ' Family occupancy ' }),
    null,
  );
});
test('a combined room correction reviews the target assignment even when Owner instructions are unchanged', async () => {
  const f = fixture({ facts: { sourceRoomId: 'room', roomId: 'target' } });
  const plan = await f.service.preview(f.client, f.facts, { sponsoring_owner_profile_id: 'owner' });
  assert.ok(plan, 'a different room must not be discarded as unchanged policy');
  assert.equal(plan.previous.roomId, 'room');
  assert.equal(plan.corrected.roomId, 'target');
  assert.ok(
    f.calls.some(
      (call) => call.sql.includes('revision_sponsorship_owner') && call.values[0] === 'target',
    ),
  );
});
test('a combined room and sponsor correction preserves the source and resolves the target Owner', async () => {
  const f = fixture({
    facts: { sourceRoomId: 'room', roomId: 'target' },
    ownerRows: [
      {
        id: 'target-assignment',
        property_id: 'property',
        owner_profile_id: 'target-owner',
        room_id: 'target',
        ownership_kind: 'building',
      },
    ],
  });
  const plan = await f.service.preview(f.client, f.facts, {
    sponsoring_owner_profile_id: 'target-owner',
  });
  assert.equal(plan.previous.ownerProfileId, 'owner');
  assert.equal(plan.previous.roomId, 'room');
  assert.equal(plan.corrected.ownerProfileId, 'target-owner');
  assert.equal(plan.corrected.ownershipAssignmentId, 'target-assignment');
  assert.equal(plan.corrected.roomId, 'target');
});
test('Apart Kost sponsorship resolves its canonical per-room assignment rather than a category alias', async () => {
  const f = fixture({
    facts: { sourceRoomId: 'room', roomId: 'target' },
    ownerRows: [],
    roomOwnerRows: [{
      id: 'target-room-assignment', property_id: 'property',
      owner_profile_id: 'target-owner', room_id: 'target', ownership_kind: 'room',
    }],
  });
  const input = {
    sponsoring_owner_profile_id: 'target-owner', management_fee_mode: 'waived',
    owner_sponsorship_reason: 'The original sponsoring Owner was recorded incorrectly',
  };
  const plan = await f.service.preview(f.client, f.facts, input);
  assert.equal(plan.previous.ownerProfileId, 'owner');
  assert.equal(plan.corrected.ownershipKind, 'room');
  assert.equal(plan.corrected.ownershipAssignmentId, 'target-room-assignment');
  const newPolicy = await f.service.prepareNewPolicy(f.client, f.facts, input);
  assert.equal(newPolicy.ownershipAssignmentId, 'target-room-assignment');
});
test('a sponsored term cannot be applied to a correction of another source room', async () => {
  await rejected(
    fixture({ facts: { sourceRoomId: 'wrong-source', roomId: 'target' } }),
    { management_fee_mode: 'waived' },
    'LEASE_SPONSORSHIP_FACTS_INVALID',
  );
});
test('combined room policy commit compare-and-sets the old room and ownership before rebinding the term', async () => {
  const f = fixture({ facts: { sourceRoomId: 'room', roomId: 'target', lock: true } });
  const plan = await f.service.preview(f.client, f.facts, { management_fee_mode: 'waived' });
  await f.service.record(f.client, f.facts, plan, 'correction', 'admin');
  await f.service.apply(f.client, f.facts, plan, 'correction');
  const update = f.calls.find((call) => call.sql.includes('UPDATE owner_sponsored_lease_terms'));
  assert.match(update.sql, /SET[\s\S]*room_id=\$19/);
  assert.match(update.sql, /AND room_id=\$20/);
  assert.match(update.sql, /AND ownership_kind=\$21 AND ownership_assignment_id=\$22/);
  assert.equal(update.values[18], 'target');
  assert.equal(update.values[19], 'room');
  assert.equal(update.values[21], 'assignment');
});
test('waiving an unpaid fee clears current payer but preserves the before-policy', async () => {
  const f = fixture();
  const plan = await f.service.preview(f.client, f.facts, { management_fee_mode: 'waived' });
  assert.equal(plan.previous.managementFeePayer, 'owner');
  assert.equal(plan.previous.managementFeeMode, 'charged');
  assert.equal(plan.corrected.managementFeeMode, 'waived');
  assert.equal(plan.corrected.managementFeePayer, null);
  assert.equal(plan.corrected.monthlyManagementFee, 0);
  assert.equal(plan.corrected.projectedManagementFeeAmount, 0);
  assert.equal(plan.effectiveFrom, '2090-01-01');
  assert.ok(!f.calls.some((c) => c.sql.includes('revision_sponsorship_fee')));
});
test('charging a waived fee uses each effective month rather than multiplying the first fee', async () => {
  const f = fixture({
    term: {
      management_fee_mode: 'waived',
      management_fee_payer: null,
      snapshot_monthly_management_fee: '0',
      current_projected_management_fee_amount: '0',
    },
  });
  const plan = await f.service.preview(f.client, f.facts, {
    management_fee_mode: 'charged',
    management_fee_payer: 'resident',
  });
  assert.equal(plan.corrected.monthlyManagementFee, 300000);
  assert.equal(plan.corrected.projectedManagementFeeAmount, 1100000);
});
test('other payer requires an operational name', async () => {
  await rejected(
    fixture(),
    { management_fee_payer: 'other' },
    'LEASE_SPONSORSHIP_PAYER_NAME_REQUIRED',
  );
  const f = fixture();
  const plan = await f.service.preview(f.client, f.facts, {
    management_fee_payer: 'other',
    management_fee_payer_name: ' Family payer ',
  });
  assert.equal(plan.corrected.managementFeePayerName, 'Family payer');
});
test('charged fee requires a payer when the previous policy was waived', async () => {
  await rejected(
    fixture({
      term: {
        management_fee_mode: 'waived',
        management_fee_payer: null,
        snapshot_monthly_management_fee: '0',
        current_projected_management_fee_amount: '0',
      },
    }),
    { management_fee_mode: 'charged' },
    'LEASE_SPONSORSHIP_PAYER_REQUIRED',
  );
});
test('related payments including reversed or pending history block a changed policy', async () => {
  await rejected(
    fixture({
      facts: {
        policy: {
          allowed: false,
          code: 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
          message: 'Tinjau penyelesaian pembayaran terlebih dahulu.',
        },
      },
    }),
    { management_fee_mode: 'waived' },
    'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
  );
});
test('rent leases cannot receive sponsored policy inputs', async () => {
  await rejected(
    fixture({ facts: { commercialMode: 'rent' } }),
    { management_fee_mode: 'waived' },
    'LEASE_SPONSORSHIP_MODE_REQUIRED',
  );
});
test('a sponsor outside the active room assignment is rejected', async () => {
  await rejected(
    fixture(),
    { sponsoring_owner_profile_id: 'different' },
    'LEASE_SPONSORSHIP_OWNER_SCOPE_INVALID',
  );
});
test('missing or ambiguous active ownership is rejected', async () => {
  await rejected(
    fixture({ ownerRows: [] }),
    { management_fee_mode: 'waived' },
    'LEASE_SPONSORSHIP_OWNER_SCOPE_INVALID',
  );
  await rejected(
    fixture({ ownerRows: [{ id: 'a' }, { id: 'b' }] }),
    { management_fee_mode: 'waived' },
    'LEASE_SPONSORSHIP_OWNER_SCOPE_INVALID',
  );
});
test('missing term or invalid recorded amounts cannot become an apparent zero', async () => {
  await rejected(
    fixture({ missingTerm: true }),
    { management_fee_mode: 'waived' },
    'LEASE_SPONSORSHIP_FACTS_INVALID',
  );
  await rejected(
    fixture({ term: { current_projected_management_fee_amount: 'bad' } }),
    { management_fee_mode: 'waived' },
    'LEASE_SPONSORSHIP_FACTS_INVALID',
  );
});
test('incomplete or unsafe monthly fee projection is rejected', async () => {
  await rejected(
    fixture({ fees: [{ month_index: 0, monthly_fee: '300000' }] }),
    { management_fee_payer: 'resident' },
    'LEASE_SPONSORSHIP_FEE_POLICY_MISSING',
  );
  await rejected(
    fixture({
      fees: [
        { month_index: 0, monthly_fee: '9007199254740993' },
        { month_index: 1, monthly_fee: '300000' },
        { month_index: 2, monthly_fee: '300000' },
      ],
    }),
    { management_fee_payer: 'resident' },
    'LEASE_SPONSORSHIP_FEE_POLICY_MISSING',
  );
});
test('locked commit appends policy revision before updating its current projection', async () => {
  const f = fixture({ facts: { lock: true } });
  const plan = await f.service.preview(f.client, f.facts, { management_fee_mode: 'waived' });
  await f.service.record(f.client, f.facts, plan, 'correction', 'admin');
  await f.service.apply(f.client, f.facts, plan, 'correction');
  const insert = f.calls.findIndex((c) =>
    c.sql.includes('INSERT INTO owner_sponsored_policy_revisions'),
  );
  const update = f.calls.findIndex((c) => c.sql.includes('UPDATE owner_sponsored_lease_terms'));
  assert.ok(insert >= 0 && update > insert);
  assert.ok(f.calls.some((c) => c.sql.includes('FOR UPDATE OF term')));
  assert.ok(f.calls.some((c) => c.sql.includes('FOR SHARE OF assignment,profile')));
  assert.ok(
    !f.calls.some((c) =>
      /UPDATE (payments|onboarding_commitments)|DELETE|INSERT INTO (invoices|payments)/i.test(
        c.sql,
      ),
    ),
  );
});
test('an unlocked or stale plan cannot apply a policy amendment', async () => {
  const unlocked = fixture();
  const plan = await unlocked.service.preview(unlocked.client, unlocked.facts, {
    management_fee_mode: 'waived',
  });
  await assert.rejects(
    unlocked.service.apply(unlocked.client, unlocked.facts, plan, 'correction', 'admin'),
    (e) => e.getResponse?.().code === 'LEASE_SPONSORSHIP_COMMIT_REVIEW_REQUIRED',
  );
  const f = fixture({ facts: { lock: true }, updatedCount: 0 });
  const stale = await f.service.preview(f.client, f.facts, { management_fee_mode: 'waived' });
  await assert.rejects(
    f.service.apply(f.client, f.facts, stale, 'correction', 'admin'),
    (e) => e.getResponse?.().code === 'LEASE_SPONSORSHIP_STALE',
  );
});
test('sponsorship correction DTO rejects malformed values and client-calculated fees', async () => {
  require('reflect-metadata');
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const { PreviewLeaseDataCorrectionDto } = require('../../src/modules/lease/lease.dto.ts');
  const options = { whitelist: true, forbidNonWhitelisted: true };
  const valid = plainToInstance(PreviewLeaseDataCorrectionDto, {
    management_fee_mode: 'charged',
    management_fee_payer: 'other',
    management_fee_payer_name: 'Family payer',
    owner_sponsorship_reason: 'Owner agreement',
    reason: 'Incorrectly recorded fee policy',
  });
  assert.deepEqual(await validate(valid, options), []);
  for (const changed of [
    { management_fee_mode: 'zero' },
    { management_fee_payer: 'finance' },
    { sponsoring_owner_profile_id: 'not-a-uuid' },
    { management_fee_payer_name: 'a' },
    { owner_sponsorship_reason: 'a' },
    { projected_management_fee_amount: 1 },
    { monthly_management_fee: 1 },
  ]) {
    const dto = plainToInstance(PreviewLeaseDataCorrectionDto, {
      reason: 'Correct recorded facts',
      ...changed,
    });
    const errors = await validate(dto, options);
    assert.ok(errors.some((error) => Object.keys(changed).includes(error.property)));
  }
});
