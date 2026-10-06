const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { LeaseArchiveRestorationService } = require('../../src/modules/lease/lease-archive-restoration.service.ts');
const { LeaseRevisionContextService } = require('../../src/modules/lease/lease-revision-context.service.ts');
const { LeaseSponsorshipCorrectionService } = require('../../src/modules/lease/lease-sponsorship-correction.service.ts');
const { ContractScheduleIssuanceService } = require('../../src/modules/billing/services/contract-schedule-issuance.service.ts');
const { runSuccessorProof } = require('./archive-successor.disposable.cjs');
const { ROOM_ACTIVITY_SQL } = require('../../src/modules/admin-ux-master/room-activity.sql.ts');
const { LeaseArchiveService } = require('../../src/modules/lease/lease-archive.service.ts');
const { prepareSponsoredLeaseFixture } = require('./onboarding-fixture.disposable.cjs');

module.exports.runRestorationProof = async function(pool, transaction, fingerprints, archives) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name, /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const repository = { query: (sql, values) => pool.query(sql, values), transaction: operation => transaction(pool, operation) };
  const service = new LeaseArchiveRestorationService(repository, new LeaseRevisionContextService(repository),
    new ContractScheduleIssuanceService(), new LeaseSponsorshipCorrectionService());
  const money = archives.find(item => item.residentRead) ?? archives.find(item => item.review.financial_resolution_state === 'pending_review');
  const denied = await service.preview(money.user, money.archiveId, money.lease.property_id);
  assert.equal(denied.data.decision.allowed, false);
  assert.equal(denied.data.decision.code, 'LEASE_ARCHIVE_RESTORE_FINANCIAL_HISTORY');
  const dtoFor = (item, review) => ({ property_id: item.lease.property_id, reason: 'Disposable proof: cancellation itself was mistaken',
    restoration_confirmed: true, review_fingerprint: review.data.review_fingerprint });
  await assert.rejects(service.restore(money.user, money.archiveId, dtoFor(money, denied), randomUUID()),
    error => error.getResponse?.().code === 'LEASE_ARCHIVE_RESTORE_FINANCIAL_HISTORY');
  async function rolledBackConflict(item, setup, expected) {
    const before = await fingerprints(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const isolated = { query: (sql,values) => client.query(sql,values), transaction: operation => operation(client) };
      await setup(client, isolated);
      const verifier = new LeaseArchiveRestorationService(isolated, new LeaseRevisionContextService(isolated),
        new ContractScheduleIssuanceService(), new LeaseSponsorshipCorrectionService());
      // The public preview starts its own read-only transaction. Inside this
      // write-and-rollback probe, exercise its exact SQL review instead of
      // attempting to change transaction isolation after fixture writes.
      const review = await verifier.review(client,item.user,item.archiveId,item.lease.property_id,false);
      assert.equal(review.decision.allowed,false);
      assert.equal(review.decision.code,expected);
      const preview = { data: { review_fingerprint: review.fingerprint } };
      await assert.rejects(verifier.restore(item.user,item.archiveId,dtoFor(item,preview),randomUUID()),
        error => error.getResponse?.().code === expected);
    } finally { await client.query('ROLLBACK'); client.release(); }
    assert.deepEqual(await fingerprints(pool),before,'Conflict probe must not change the clone after rollback');
  }
  const paid = archives.find(item => item.review.financial_resolution_state === 'not_required' && item.lease.commercial_mode === 'rent');
  const sponsored = archives.find(item => item.review.financial_resolution_state === 'not_required' && item.lease.commercial_mode === 'owner_sponsored');
  assert.ok(paid && sponsored);
  await rolledBackConflict(sponsored,async(client,repository) => {
    const prepared = await prepareSponsoredLeaseFixture(client,sponsored.user.id,repository,
      { propertyId:sponsored.lease.property_id,roomId:sponsored.lease.room_id });
    await prepared.onboarding.commit(sponsored.user,prepared.dto,randomUUID(),{});
  },'LEASE_ARCHIVE_RESTORE_ROOM_CONFLICT');
  await rolledBackConflict(paid,async(client) => {
    const selected = (await client.query(`SELECT version.* FROM rooms room JOIN LATERAL (
      SELECT * FROM kost_type_commercial_versions WHERE kost_type_id=room.kost_type_id
      AND effective_date<=(SELECT start_date FROM leases WHERE id=$2) ORDER BY effective_date DESC,id DESC LIMIT 1
    ) version ON true WHERE room.id=$1`,[paid.lease.room_id,paid.lease.id])).rows[0];
    assert.ok(selected);
    // Clone-only change of the reference authority, rolled back with all probes.
    await client.query('UPDATE kost_type_commercial_versions SET long_stay_monthly_price=long_stay_monthly_price+1000 WHERE id=$1',[selected.id]);
  },'LEASE_ARCHIVE_RESTORE_COMMERCIAL_REVIEW_REQUIRED');
  await rolledBackConflict(sponsored,async(client) => {
    const term = (await client.query('SELECT ownership_assignment_id,owner_profile_id FROM owner_sponsored_lease_terms WHERE lease_id=$1',[sponsored.lease.id])).rows[0];
    const other = (await client.query("SELECT id FROM property_owner_profiles WHERE property_id=$1 AND id<>$2 AND profile_status='active' ORDER BY id LIMIT 1",[sponsored.lease.property_id,term.owner_profile_id])).rows[0];
    assert.ok(other);
    await client.query('UPDATE building_owner_assignments SET owner_profile_id=$2 WHERE id=$1',[term.ownership_assignment_id,other.id]);
  },'LEASE_ARCHIVE_RESTORE_COMMERCIAL_REVIEW_REQUIRED');
  process.stdout.write('Real PostgreSQL restore conflict gates: canonical room reuse, changed tariff and changed sponsored Owner reject without writes; all probes rolled back\n');
  for (const item of archives.filter(item => item.review.financial_resolution_state === 'not_required')) {
    const review = await service.preview(item.user, item.archiveId, item.lease.property_id);
    assert.equal(review.data.decision.allowed, true, `Eligible original no-money authority: ${review.data.decision.code}`);
    const dto = dtoFor(item, review);
    const before = await fingerprints(pool);
    await assert.rejects(service.restore(item.user, item.archiveId, { ...dto, review_fingerprint: '0'.repeat(64) }, randomUUID()),
      error => error.getResponse?.().code === 'LEASE_ARCHIVE_RESTORE_REVIEW_STALE');
    assert.deepEqual(await fingerprints(pool), before);
    await assert.rejects(service.preview({ ...item.user, propertyIds: [] }, item.archiveId, item.lease.property_id), error => error.getStatus?.() === 403);
    // Fail after canonical schedule and room writes: all mutations must roll back.
    await pool.query(`CREATE FUNCTION h08_restore_projection_reject() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.archive_status='restored' THEN RAISE EXCEPTION 'H08_RESTORE_COMMAND_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER h08_restore_projection_reject BEFORE UPDATE ON lease_archives FOR EACH ROW EXECUTE FUNCTION h08_restore_projection_reject()`);
    await assert.rejects(service.restore(item.user, item.archiveId, dto, randomUUID()), /H08_RESTORE_COMMAND_FAILURE/);
    assert.deepEqual(await fingerprints(pool), before);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM lease_archive_restore_commands WHERE archive_id=$1', [item.archiveId])).rows[0].n, 0);
    await pool.query('DROP TRIGGER h08_restore_projection_reject ON lease_archives; DROP FUNCTION h08_restore_projection_reject()');
    const financeBefore = await fingerprints(pool, ['payments','payment_receipts','property_owner_realizations']);
    const invoicesBefore = (await pool.query('SELECT to_jsonb(invoice) AS row FROM invoices invoice WHERE lease_id=$1 ORDER BY id', [item.lease.id])).rows;
    const key = randomUUID();
    const results = await Promise.all([service.restore(item.user, item.archiveId, dto, key), service.restore(item.user, item.archiveId, dto, key)]);
    assert.deepEqual(results.map(result => result.idempotent).sort(), [false,true]);
    assert.deepEqual(results[0].data, results[1].data);
    await assert.rejects(service.restore(item.user, item.archiveId, { ...dto, reason: 'Changed restore intent' }, key), error => error.getResponse?.().code === 'IDEMPOTENCY_KEY_REUSED');
    assert.deepEqual(await fingerprints(pool, ['payments','payment_receipts','property_owner_realizations']), financeBefore);
    const oldInvoices = (await pool.query('SELECT to_jsonb(invoice) AS row FROM invoices invoice WHERE id=ANY($1::uuid[]) ORDER BY id', [invoicesBefore.map(row => row.row.id)])).rows;
    assert.deepEqual(oldInvoices, invoicesBefore, 'Old void invoices remain immutable history');
    const state = (await pool.query(`SELECT lease.lease_status,lease.occupancy_id,lease.service_period_state,room.room_status,lifecycle.checked_in_at,
      archive.archive_status,resident.resident_status,commitment.status AS commitment_status FROM leases lease
      JOIN rooms room ON room.id=lease.room_id JOIN residents resident ON resident.id=lease.resident_id
      JOIN onboarding_commitments commitment ON commitment.id=lease.onboarding_commitment_id
      LEFT JOIN lease_activation_lifecycles lifecycle ON lifecycle.lease_id=lease.id JOIN lease_archives archive ON archive.id=$2 WHERE lease.id=$1`, [item.lease.id,item.archiveId])).rows[0];
    assert.equal(state.lease_status, item.activationOnly ? 'active' : 'awaiting_activation');
    assert.equal(state.occupancy_id, null);
    assert.equal(state.checked_in_at, null);
    assert.equal(state.service_period_state, 'pending_check_in');
    assert.equal(state.room_status, item.activationOnly ? 'awaiting_check_in' : 'reserved');
    assert.equal(state.archive_status, 'restored');
    const archiveDetail = await new LeaseArchiveService(repository, new LeaseRevisionContextService(repository)).detail(item.user, item.archiveId, item.lease.property_id);
    assert.equal(archiveDetail.data.archive_status, 'restored');
    assert.equal(archiveDetail.data.restoration_reason, dto.reason);
    assert.equal(archiveDetail.data.successor_lease_id, null);
    const restoredActivity = (await pool.query(ROOM_ACTIVITY_SQL, [item.lease.property_id, item.lease.room_id])).rows.filter(row => row.event_type === 'lease_archive_restored');
    assert.equal(restoredActivity.length, 1);
    assert.equal(restoredActivity[0].notes, dto.reason);
    assert.notEqual(state.resident_status, 'archived');
    if (item.lease.commercial_mode === 'rent') {
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoices WHERE lease_id=$1 AND invoice_status<>'void'", [item.lease.id])).rows[0].n > 0, true);
    } else assert.equal((await pool.query("SELECT term_status FROM owner_sponsored_lease_terms WHERE lease_id=$1", [item.lease.id])).rows[0].term_status, 'active');
    await assert.rejects(pool.query('DELETE FROM lease_archive_restore_commands WHERE archive_id=$1', [item.archiveId]), error => error.code === '23514');
  }
  process.stdout.write('Real PostgreSQL restoration: no-money paid/sponsored/activation-only, unchanged documents and money, no physical check-in, stale/scope gates, rollback and concurrent replay pass\n');
  await runSuccessorProof(pool, transaction, fingerprints, money);
};
