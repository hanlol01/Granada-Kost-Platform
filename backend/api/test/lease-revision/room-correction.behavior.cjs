require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseRoomRecordingCorrectionService,
} = require('../../src/modules/lease/lease-room-recording-correction.service.ts');

const room = (id, number, status = 'vacant') => ({
  id,
  property_id: 'property',
  number,
  room_status: status,
  manager_room_label: `Rumah Kost · ${number}`,
  plot_number: '6A',
  category: 'rukost',
  gender_policy: 'male',
  building_gender_policy: 'male',
  building_property_id: 'property',
  building_category: 'rukost',
  kost_type_id: 'type',
  kost_type_name: 'Standard',
  kost_type_property_id: 'property',
  kost_type_category: 'rukost',
  kost_type_status: 'active',
  kost_type_deleted_at: null,
});
function fixture(overrides = {}) {
  const calls = [];
  const source = room(
    'source',
    'RK-06-03',
    overrides.physicalCheckInRecorded ? 'occupied' : 'reserved',
  );
  const target = room('target', 'RK-06-06');
  const facts = {
    leaseId: 'lease',
    propertyId: 'property',
    residentId: 'resident',
    sourceRoomId: 'source',
    targetRoomId: 'target',
    occupancyId: null,
    leaseStatus: 'awaiting_activation',
    commercialMode: 'rent',
    startDate: '2090-01-01',
    endDate: '2091-01-01',
    recordingErrorConfirmed: true,
    physicalCheckInRecorded: false,
    evidenceFileIds: [],
    relatedTransactionCount: 0,
    ownerSponsorship: null,
    policy: { allowed: true },
    lock: false,
    ...overrides,
  };
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('revision_rooms'))
        return { rows: [source, { ...target, ...overrides.target }] };
      if (sql.includes('SELECT gender FROM residents')) return { rows: [{ gender: 'male' }] };
      if (sql.includes('revision_room_source'))
        return {
          rows: [
            {
              binding_valid: overrides.bindingValid ?? true,
              source_conflict: overrides.sourceConflict ?? false,
              commitment_count: overrides.commitmentCount ?? 1,
              hold_count: overrides.holdCount ?? (facts.leaseStatus === 'active' ? 0 : 1),
            },
          ],
        };
      if (sql.includes('revision_room_conflicts'))
        return {
          rows: [
            {
              conflict: overrides.conflict ?? false,
              access_granted: overrides.accessGranted ?? false,
            },
          ],
        };
      if (sql.includes('revision_room_owner'))
        return { rows: overrides.owner ? [overrides.owner] : [] };
      if (sql.includes('revision_room_evidence')) return { rows: overrides.files ?? [] };
      if (/^\s*(UPDATE|INSERT)/i.test(sql))
        return {
          rows: [],
          rowCount: sql.includes('UPDATE rooms')
            ? 2
            : sql.includes('UPDATE onboarding_commitments')
              ? (overrides.writtenCommitmentCount ?? overrides.commitmentCount ?? 1)
              : sql.includes('UPDATE booking_lead_holds')
                ? (overrides.writtenHoldCount ??
                  overrides.holdCount ??
                  (facts.leaseStatus === 'active' ? 0 : 1))
                : 1,
        };
      throw new Error(`Unexpected authority query: ${sql.slice(0, 70)}`);
    },
  };
  return { facts, client, calls, service: new LeaseRoomRecordingCorrectionService() };
}
const reject = async (f, code) => {
  await assert.rejects(
    f.service.preview(f.client, f.facts),
    (e) => e.getResponse?.().code === code,
  );
  assert.ok(f.calls.every((q) => !/^\s*(UPDATE|INSERT|DELETE)/i.test(q.sql)));
};
test('an unchanged or omitted room is a no-op, never a release', async () => {
  for (const targetRoomId of [undefined, 'source']) {
    const f = fixture({ targetRoomId });
    assert.equal(await f.service.preview(f.client, f.facts), null);
    assert.equal(f.calls.length, 0);
  }
});
test('pre-check-in room recording correction returns actual labels without transfer', async () => {
  const f = fixture();
  const result = await f.service.preview(f.client, f.facts);
  assert.equal(result.previous.number, 'RK-06-03');
  assert.equal(result.corrected.number, 'RK-06-06');
  assert.equal(result.corrected.plot_number, '6A');
  assert.equal(result.targetStatus, 'reserved');
  assert.deepEqual(result.evidenceFileIds, []);
  assert.ok(f.calls.every((q) => !/room_transfer_records|INSERT/i.test(q.sql)));
});
test('canonical Apart Kost inventory uses per-room ownership for correction', async () => {
  const f = fixture({
    commercialMode: 'owner_sponsored',
    ownerSponsorship: { owner_profile_id: 'owner', ownership_assignment_id: 'assignment' },
    owner: { owner_profile_id: 'owner', id: 'assignment', ownership_kind: 'room' },
    target: {
      number: 'AK-6B-09',
      category: 'apartkost',
      building_category: 'apartkost',
      kost_type_category: 'apartkost',
    },
  });
  const result = await f.service.preview(f.client, f.facts);
  assert.equal(result.corrected.category, 'apartkost');
  const ownership = f.calls.find((query) => query.sql.includes('revision_room_owner'));
  assert.match(ownership.sql, /FROM room_owner_assignments/);
  assert.doesNotMatch(ownership.sql, /FROM building_owner_assignments/);
});
test('an invented category alias cannot bypass canonical inventory checks', async () => {
  await reject(fixture({
    target: { category: 'apkost', building_category: 'apkost', kost_type_category: 'apkost' },
  }), 'LEASE_ROOM_CORRECTION_AUTHORITY_INVALID');
});
test('a physical move must use Pindah Kamar instead of a room correction', async () => {
  await reject(
    fixture({ recordingErrorConfirmed: false }),
    'LEASE_ROOM_CORRECTION_RECORDING_CONFIRMATION_REQUIRED',
  );
});
test('post-check-in original recording errors require proof', async () => {
  await reject(
    fixture({ physicalCheckInRecorded: true, occupancyId: 'occupancy' }),
    'LEASE_ROOM_CORRECTION_EVIDENCE_REQUIRED',
  );
});
test('foreign-property, deleted tariff, category and gender mismatches fail closed', async () => {
  for (const target of [
    { property_id: 'other' },
    { building_property_id: 'other' },
    { kost_type_property_id: 'other' },
    { kost_type_deleted_at: new Date() },
    { kost_type_status: 'inactive' },
    { kost_type_category: 'apkost' },
    { gender_policy: 'female' },
    { building_gender_policy: 'female' },
  ])
    await reject(fixture({ target }), 'LEASE_ROOM_CORRECTION_AUTHORITY_INVALID');
});
test('occupied, reserved, inspection and maintenance destinations remain unavailable', async () => {
  for (const room_status of [
    'occupied',
    'reserved',
    'inspection_required',
    'maintenance',
    'unknown',
  ])
    await reject(fixture({ target: { room_status } }), 'LEASE_ROOM_CORRECTION_ROOM_UNAVAILABLE');
});
test('conflicting lease, occupancy, hold or commitment is never overwritten', async () => {
  await reject(fixture({ conflict: true }), 'LEASE_ROOM_CORRECTION_ROOM_CONFLICT');
});
test('a source room still used by another lease, occupancy, hold or transfer is never released', async () => {
  await reject(fixture({ sourceConflict: true }), 'LEASE_ROOM_CORRECTION_SOURCE_CONFLICT');
});
test('mismatched source commitment, hold or occupancy requires review before writing', async () => {
  await reject(fixture({ bindingValid: false }), 'LEASE_ROOM_CORRECTION_SOURCE_BINDING_INVALID');
});
test('missing source bindings and unknown counts fail closed', async () => {
  for (const commitmentCount of ['not-a-number', -1, 2])
    await reject(fixture({ commitmentCount }), 'LEASE_ROOM_CORRECTION_SOURCE_BINDING_INVALID');
});
test('an unknown but consistently named category cannot become an Apart Kost assignment', async () => {
  await reject(
    fixture({
      target: { category: 'unknown', building_category: 'unknown', kost_type_category: 'unknown' },
    }),
    'LEASE_ROOM_CORRECTION_AUTHORITY_INVALID',
  );
});
test('a source binding that changes between validation and write fails with an actionable conflict', async () => {
  const f = fixture({ lock: true, writtenCommitmentCount: 0 });
  const preview = await f.service.preview(f.client, f.facts);
  await assert.rejects(
    f.service.apply(f.client, f.facts, preview, 'correction', 'admin'),
    (e) => e.getResponse?.().code === 'LEASE_ROOM_CORRECTION_SOURCE_BINDING_STALE',
  );
  assert.ok(!f.calls.some((q) => /UPDATE rooms/.test(q.sql)));
});
test('unrevoked old-room access prevents reassignment with an actionable next step', async () => {
  await reject(fixture({ accessGranted: true }), 'LEASE_ROOM_CORRECTION_ACCESS_REVIEW_REQUIRED');
});
test('a policy rejection is enforced before room discovery or evidence reads', async () => {
  const f = fixture({
    policy: { allowed: false, code: 'LOCKED', message: 'Review Owner realization first.' },
  });
  await reject(f, 'LOCKED');
  assert.equal(f.calls.length, 0);
});
test('sponsored room correction requires the actual same sponsoring Owner', async () => {
  const facts = {
    commercialMode: 'owner_sponsored',
    ownerSponsorship: { owner_profile_id: 'owner', ownership_assignment_id: 'assignment' },
  };
  await reject(fixture(facts), 'LEASE_ROOM_CORRECTION_SPONSOR_MISMATCH');
  await reject(
    fixture({
      ...facts,
      owner: { owner_profile_id: 'other', id: 'assignment', ownership_kind: 'building' },
    }),
    'LEASE_ROOM_CORRECTION_SPONSOR_MISMATCH',
  );
  const f = fixture({
    ...facts,
    owner: { owner_profile_id: 'owner', id: 'assignment', ownership_kind: 'building' },
  });
  const result = await f.service.preview(f.client, f.facts);
  assert.equal(result.ownerAssignment.id, 'assignment');
});
test('a paid sponsored policy cannot silently change its original ownership assignment', async () => {
  await reject(
    fixture({
      commercialMode: 'owner_sponsored',
      relatedTransactionCount: 1,
      ownerSponsorship: { owner_profile_id: 'owner', ownership_assignment_id: 'original' },
      owner: { owner_profile_id: 'owner', id: 'replacement', ownership_kind: 'building' },
    }),
    'LEASE_ROOM_CORRECTION_SPONSOR_POLICY_REVIEW_REQUIRED',
  );
});
test('proof must be a live private correction file belonging to the same property', async () => {
  for (const files of [[], [{ id: 'proof', file_purpose: 'payment_proof' }]])
    await reject(
      fixture({
        physicalCheckInRecorded: true,
        occupancyId: 'occupancy',
        evidenceFileIds: ['proof'],
        files,
      }),
      'LEASE_ROOM_CORRECTION_EVIDENCE_UNAVAILABLE',
    );
  const f = fixture({
    physicalCheckInRecorded: true,
    occupancyId: 'occupancy',
    lock: true,
    evidenceFileIds: ['proof'],
    files: [{ id: 'proof', file_purpose: 'lease_revision_evidence' }],
  });
  const result = await f.service.preview(f.client, f.facts);
  assert.equal(result.targetStatus, 'occupied');
  assert.deepEqual(result.evidenceFileIds, ['proof']);
});
test('commit rebinds the same lease/occupancy/hold and preserves original histories and money', async () => {
  const f = fixture({
    physicalCheckInRecorded: true,
    occupancyId: 'occupancy',
    lock: true,
    evidenceFileIds: ['proof'],
    files: [{ id: 'proof', file_purpose: 'lease_revision_evidence' }],
  });
  const preview = await f.service.preview(f.client, f.facts);
  await f.service.apply(f.client, f.facts, preview, 'correction', 'admin');
  const writes = f.calls.filter((q) => /^\s*(UPDATE|INSERT)/i.test(q.sql));
  assert.ok(writes.some((q) => /UPDATE leases/.test(q.sql)));
  assert.ok(writes.some((q) => /UPDATE occupancies/.test(q.sql)));
  assert.ok(writes.some((q) => /UPDATE onboarding_commitments/.test(q.sql)));
  assert.ok(writes.some((q) => /UPDATE booking_lead_holds/.test(q.sql)));
  assert.ok(writes.some((q) => /INSERT INTO lease_data_correction_evidence/.test(q.sql)));
  assert.ok(writes.filter((q) => /INSERT INTO occupancy_history/.test(q.sql)).length === 2);
  assert.ok(
    writes.every(
      (q) =>
        !/DELETE|UPDATE invoices|UPDATE payments|transfer_out|transfer_in|inspection_required|INSERT INTO occupancies/.test(
          q.sql,
        ),
    ),
  );
});
