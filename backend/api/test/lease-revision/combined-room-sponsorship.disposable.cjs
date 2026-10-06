// Called only by the guarded, fresh local clone proof. No source mutations or file bytes.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const {
  LeaseDataCorrectionService,
} = require('../../src/modules/lease/lease-data-correction.service.ts');
const {
  LeaseRevisionContextService,
} = require('../../src/modules/lease/lease-revision-context.service.ts');
const { OnboardingService } = require('../../src/modules/resident/onboarding.service.ts');
const { ResidentAccountService } = require('../../src/modules/resident/resident-account.service.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');
const { ContractScheduleIssuanceService } = require('../../src/modules/billing/services/contract-schedule-issuance.service.ts');
const { ensureCompatibleOwnedVacancies } = require('./room-fixture.disposable.cjs');

module.exports.runCombinedRoomSponsorshipProof = async function (
  pool,
  actorId,
  transaction,
  fingerprints,
) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const repository = {
    client: pool,
    query: (sql, values) => pool.query(sql, values),
    transaction: (operation) => transaction(pool, operation),
  };
  const contexts = new LeaseRevisionContextService(repository);
  const service = new LeaseDataCorrectionService(repository, {}, {}, contexts);
  await ensureCompatibleOwnedVacancies(pool, actorId, repository);
  // Existing pre-check-in sponsored records all have protected financial history.
  // Create a fresh fixture through the real onboarding/account authorities IN THE CLONE,
  // rather than deleting money or falsifying check-in on an existing resident.
  const source = (await pool.query(`WITH owned AS (
    SELECT room.id,room.property_id,building.gender_policy,assignment.owner_profile_id
      FROM rooms room JOIN room_buildings building ON building.id=room.building_id
      JOIN building_owner_assignments assignment ON assignment.building_id=room.building_id AND assignment.property_id=room.property_id
      WHERE room.room_status='vacant' AND room.category='rukost' AND assignment.assignment_status='active'
        AND NOT EXISTS(SELECT 1 FROM leases lease WHERE lease.room_id=room.id AND lease.lease_status IN ('draft','awaiting_activation','active'))
         AND NOT EXISTS(SELECT 1 FROM booking_lead_holds hold WHERE hold.room_id=room.id AND hold.hold_status IN ('active','committed'))
    UNION ALL
    SELECT room.id,room.property_id,building.gender_policy,assignment.owner_profile_id
      FROM rooms room JOIN room_buildings building ON building.id=room.building_id
      JOIN room_owner_assignments assignment ON assignment.room_id=room.id AND assignment.property_id=room.property_id
      WHERE room.room_status='vacant' AND room.category='apartkost' AND assignment.assignment_status='active'
        AND NOT EXISTS(SELECT 1 FROM leases lease WHERE lease.room_id=room.id AND lease.lease_status IN ('draft','awaiting_activation','active'))
        AND NOT EXISTS(SELECT 1 FROM booking_lead_holds hold WHERE hold.room_id=room.id AND hold.hold_status IN ('active','committed'))
  ) SELECT source.* FROM owned source WHERE EXISTS(SELECT 1 FROM owned target
    WHERE target.property_id=source.property_id AND target.gender_policy=source.gender_policy
      AND target.owner_profile_id<>source.owner_profile_id) ORDER BY source.id LIMIT 1`)).rows[0];
  assert.ok(source, 'Two available owned rooms with compatible gender and different Owners required for clone fixture');
  const fixtureUser = { id: actorId, roles: ['admin'], permissions: ['lease.manage'], propertyIds: [source.property_id] };
  const properties = { assertCanReadProperty: async (user, propertyId) => assert.ok(user.propertyIds.includes(propertyId)) };
  const audit = new AuditRepository(repository);
  const onboarding = new OnboardingService(repository, properties,
    new ResidentAccountService(repository, {}, properties, audit), audit, {}, new ContractScheduleIssuanceService());
  const date = (await pool.query("SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS date")).rows[0].date;
  const token = randomUUID().replaceAll('-', '');
  await onboarding.commit(fixtureUser, {
    property_id: source.property_id, room_id: source.id,
    visitor_name: 'H08 disposable onboarding proof', visitor_phone: `0899${parseInt(token.slice(0,8),16).toString().padStart(10,'0')}`,
    visitor_email: `h08-${token}@example.invalid`, gender: source.gender_policy,
    start_date: date, term_months: 12, commercial_mode: 'owner_sponsored',
    sponsoring_owner_profile_id: source.owner_profile_id, management_fee_mode: 'waived',
    owner_sponsorship_reason: 'Disposable proof: original Owner instruction', billing_cycle: 'yearly',
    payment_plan_type: 'annual_full', accepted_terms_version: 'h08-disposable-proof',
    dp_verified_amount: 0, security_deposit_funded_amount: 0, payment_method: 'cash',
  }, randomUUID(), {});
  const candidates = (
    await pool.query(`SELECT lease.id,lease.property_id,lease.resident_id,
    lease.room_id,lease.occupancy_id,lease.lease_status,lease.onboarding_commitment_id,
    lease.activated_at,lease.service_period_state,term.owner_profile_id
    FROM leases lease JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=lease.property_id
    WHERE lease.commercial_mode='owner_sponsored' AND lease.lease_status IN ('awaiting_activation','active')
      AND lease.end_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND term.term_status='active'
    ORDER BY lease.created_at DESC LIMIT 80`)
  ).rows;
  for (const phase of ['before-check-in', 'after-check-in']) {
    let chosen;
    const diagnostic = { candidates: 0, eligible: 0, targetRooms: 0, rejected: {} };
    for (const lease of candidates) {
      const user = {
        id: actorId,
        roles: ['admin'],
        permissions: ['lease.manage'],
        propertyIds: [lease.property_id],
      };
      const context = (await contexts.get(user, lease.id)).data;
      if (context.lease.physical_check_in_recorded === (phase === 'after-check-in'))
        diagnostic.candidates++;
      if (
        !context.policies.room_correction.allowed ||
        !context.policies.sponsorship_policy_change.allowed ||
        context.lease.physical_check_in_recorded !== (phase === 'after-check-in')
      )
        continue;
      diagnostic.eligible++;
      const targets = (
        await pool.query(
          `SELECT room.id,room.number,assignment.owner_profile_id
        FROM rooms room JOIN building_owner_assignments assignment ON assignment.building_id=room.building_id AND assignment.property_id=room.property_id
        WHERE room.property_id=$1 AND room.room_status='vacant' AND room.category='rukost'
          AND assignment.assignment_status='active' AND assignment.owner_profile_id<>$2
        UNION ALL
        SELECT room.id,room.number,assignment.owner_profile_id
        FROM rooms room JOIN room_owner_assignments assignment ON assignment.room_id=room.id AND assignment.property_id=room.property_id
        WHERE room.property_id=$1 AND room.room_status='vacant' AND room.category='apartkost'
          AND assignment.assignment_status='active' AND assignment.owner_profile_id<>$2
        ORDER BY number`,
          [lease.property_id, lease.owner_profile_id],
        )
      ).rows;
      diagnostic.targetRooms += targets.length;
      const evidenceId = randomUUID();
      // Metadata-only proof; storage_path deliberately has no physical bytes.
      await pool.query(
        `INSERT INTO files(id,property_id,uploader_user_id,original_filename,sanitized_filename,
        mime_type,file_extension,file_size_bytes,file_purpose,storage_driver,storage_path,checksum_sha256)
        VALUES($1,$2,$3,'proof.pdf','proof.pdf','application/pdf','pdf',100,'lease_revision_evidence','local',$4,$5)`,
        [
          evidenceId,
          lease.property_id,
          actorId,
          `disposable-only/${evidenceId}.pdf`,
          createHash('sha256').update('No bytes').digest('hex'),
        ],
      );
      for (const target of targets) {
        const dto = {
          room_id: target.id,
          sponsoring_owner_profile_id: target.owner_profile_id,
          management_fee_mode: 'waived',
          room_recording_error_confirmed: true,
          room_correction_evidence_file_ids: [evidenceId],
          reason: 'Disposable proof: original room and sponsoring Owner were incorrectly recorded',
        };
        try {
          const preview = await service.preview(user, lease.id, dto);
          chosen = { lease, user, target, evidenceId, dto, preview };
          break;
        } catch (error) {
          const code = error.getResponse?.().code;
          diagnostic.rejected[code ?? 'unexpected'] =
            (diagnostic.rejected[code ?? 'unexpected'] ?? 0) + 1;
          if (
            ![
              'LEASE_ROOM_CORRECTION_ROOM_CONFLICT',
              'LEASE_ROOM_CORRECTION_AUTHORITY_INVALID',
              'LEASE_ROOM_CORRECTION_ACCESS_REVIEW_REQUIRED',
              'LEASE_ROOM_CORRECTION_ROOM_UNAVAILABLE',
              'LEASE_DATA_CORRECTION_ROOM_CONFLICT',
            ].includes(error.getResponse?.().code)
          )
            throw error;
        }
      }
      if (chosen) break;
    }
    if (!chosen)
      process.stdout.write(
        `Combined proof fixture facts ${phase}: ${JSON.stringify(diagnostic)}\n`,
      );
    assert.ok(
      chosen,
      `Actual ${phase} sponsored lease and eligible vacant room with another Owner required`,
    );
    const { lease, user, target, evidenceId, dto, preview } = chosen;
    assert.equal(preview.data.previous.owner_sponsorship.owner_profile_id, lease.owner_profile_id);
    assert.equal(
      preview.data.corrected.owner_sponsorship.owner_profile_id,
      target.owner_profile_id,
    );
    assert.equal(preview.data.corrected.contract_rent_amount, 0);
    const protectedFacts = async () =>
      (
        await pool.query(
          `SELECT
      (SELECT to_jsonb(lifecycle) FROM lease_activation_lifecycles lifecycle WHERE lease_id=$1) AS lifecycle,
      (SELECT to_jsonb(commitment)-'room_id'-'category'-'updated_at' FROM onboarding_commitments commitment WHERE lease_id=$1) AS original_onboarding,
      (SELECT count(*)::int FROM occupancy_history WHERE occupancy_id=$2 AND event_type<>'status_sync') AS physical_events,
      (SELECT count(*)::int FROM room_transfer_records WHERE from_lease_id=$1 OR to_lease_id=$1) AS transfers`,
          [lease.id, lease.occupancy_id],
        )
      ).rows[0];
    const original = await protectedFacts();
    const beforeFailure = await fingerprints(pool);
    const counts = async () =>
      (
        await pool.query(`SELECT
      (SELECT count(*)::int FROM lease_data_corrections) AS corrections,
      (SELECT count(*)::int FROM owner_sponsored_policy_revisions) AS versions,
      (SELECT count(*)::int FROM lease_data_correction_evidence) AS evidence,
      (SELECT count(*)::int FROM occupancy_history) AS history,
      (SELECT count(*)::int FROM audit_logs) AS audit`)
      ).rows[0];
    const beforeCounts = await counts();
    assert.match(lease.id, /^[a-f0-9-]{36}$/i);
    await pool.query(`CREATE FUNCTION h08_combined_proof_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.lease_id='${lease.id}'::uuid AND NEW.room_id IS DISTINCT FROM OLD.room_id THEN
        RAISE EXCEPTION 'H08_COMBINED_PROOF_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER h08_combined_proof_failure BEFORE UPDATE ON owner_sponsored_lease_terms
      FOR EACH ROW EXECUTE FUNCTION h08_combined_proof_failure()`);
    try {
      await assert.rejects(
        service.commit(user, lease.id, dto, randomUUID()),
        /H08_COMBINED_PROOF_FAILURE/,
      );
      assert.deepEqual(await fingerprints(pool), beforeFailure);
      assert.deepEqual(await counts(), beforeCounts);
      assert.deepEqual(await protectedFacts(), original);
    } finally {
      await pool.query(
        'DROP TRIGGER h08_combined_proof_failure ON owner_sponsored_lease_terms; DROP FUNCTION h08_combined_proof_failure()',
      );
    }
    const financialTables = [
      'payments',
      'invoices',
      'payment_receipts',
      'property_owner_realizations',
    ];
    const beforeMoney = await fingerprints(pool, financialTables);
    const key = randomUUID();
    const results = await Promise.all([
      service.commit(user, lease.id, dto, key),
      service.commit(user, lease.id, dto, key),
    ]);
    assert.equal(results[0].data.correction.id, results[1].data.correction.id);
    assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
    const correctionId = results[0].data.correction.id;
    const updated = (
      await pool.query(
        `SELECT lease.room_id,lease.occupancy_id,lease.activated_at,lease.service_period_state,
      term.room_id AS term_room_id,term.owner_profile_id,term.management_fee_mode
      FROM leases lease JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=lease.property_id
      WHERE lease.id=$1`,
        [lease.id],
      )
    ).rows[0];
    assert.equal(updated.room_id, target.id);
    assert.equal(updated.term_room_id, target.id);
    assert.equal(updated.owner_profile_id, target.owner_profile_id);
    assert.equal(updated.management_fee_mode, 'waived');
    assert.equal(updated.occupancy_id, lease.occupancy_id);
    assert.equal(updated.service_period_state, lease.service_period_state);
    assert.deepEqual(updated.activated_at, lease.activated_at);
    const version = (
      await pool.query(
        'SELECT previous_policy,corrected_policy FROM owner_sponsored_policy_revisions WHERE correction_id=$1',
        [correctionId],
      )
    ).rows;
    assert.equal(version.length, 1);
    assert.equal(version[0].previous_policy.roomId, lease.room_id);
    assert.equal(version[0].previous_policy.ownerProfileId, lease.owner_profile_id);
    assert.equal(version[0].corrected_policy.roomId, target.id);
    assert.equal(version[0].corrected_policy.ownerProfileId, target.owner_profile_id);
    const states = (
      await pool.query('SELECT id,room_status FROM rooms WHERE id=ANY($1::uuid[])', [
        [lease.room_id, target.id],
      ])
    ).rows;
    assert.equal(states.find((room) => room.id === lease.room_id).room_status, 'vacant');
    assert.equal(
      states.find((room) => room.id === target.id).room_status,
      phase === 'after-check-in' ? 'occupied' : 'reserved',
    );
    assert.deepEqual(await protectedFacts(), original);
    assert.deepEqual(await fingerprints(pool, financialTables), beforeMoney);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM lease_data_correction_evidence WHERE correction_id=$1 AND file_id=$2',
          [correctionId, evidenceId],
        )
      ).rows[0].count,
      1,
    );
    if (phase === 'after-check-in') {
      assert.equal(
        (await pool.query('SELECT room_id FROM occupancies WHERE id=$1', [lease.occupancy_id]))
          .rows[0].room_id,
        target.id,
      );
      assert.equal(
        (
          await pool.query(
            `SELECT count(*)::int AS count FROM occupancy_history WHERE occupancy_id=$1 AND event_type='status_sync' AND metadata->>'correction_id'=$2`,
            [lease.occupancy_id, correctionId],
          )
        ).rows[0].count,
        2,
      );
    }
    process.stdout.write(
      `Actual combined room/sponsor ${phase}: source/target bindings, preserved lifecycle/money, version/evidence, concurrent replay and mid-command rollback pass\n`,
    );
  }
};
