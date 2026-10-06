const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prepareSponsoredLeaseFixture } = require('./onboarding-fixture.disposable.cjs');
const { LeaseArchiveService } = require('../../src/modules/lease/lease-archive.service.ts');
const { LeaseRevisionContextService } = require('../../src/modules/lease/lease-revision-context.service.ts');
const { ROOM_ACTIVITY_SQL } = require('../../src/modules/admin-ux-master/room-activity.sql.ts');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');
// The guarded harness loads the actual parser through cancellation.disposable first.
const { parseMyW06Billing, parseMyBillingHistory } = require('../../../../apps/penghuni/src/lib/penghuni-w06-billing.ts');

module.exports.runSuccessorProof = async function(pool, transaction, fingerprints, archive) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name, /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const repository = { query: (sql, values) => pool.query(sql, values), transaction: operation => transaction(pool, operation) };
  const resident = (await pool.query('SELECT full_name,phone,email,gender FROM residents WHERE id=$1 AND property_id=$2', [archive.lease.resident_id,archive.lease.property_id])).rows[0];
  const prepared = await prepareSponsoredLeaseFixture(pool, archive.user.id, repository, { propertyId: archive.lease.property_id, gender: resident.gender, excludeRoomId: archive.lease.room_id });
  assert.notEqual(prepared.room.id, archive.lease.room_id, 'Linked successor must exercise a distinct available room');
  const dto = { ...prepared.dto, resident_id: archive.lease.resident_id, visitor_name: resident.full_name,
    visitor_phone: resident.phone, visitor_email: resident.email ?? undefined, source_archive_id: archive.archiveId,
    archive_replacement_reason: 'Disposable proof: review new room and period without reviving old money' };
  const before = await fingerprints(pool);
  await assert.rejects(prepared.onboarding.commit(archive.user, { ...dto, resident_id: randomUUID() }, randomUUID(), {}),
    error => error.getResponse?.().code === 'LEASE_ARCHIVE_SUCCESSOR_SOURCE_STALE');
  assert.deepEqual(await fingerprints(pool), before);
  await pool.query(`CREATE FUNCTION h08_successor_reject() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'H08_SUCCESSOR_COMMAND_FAILURE'; END $$;
    CREATE TRIGGER h08_successor_reject BEFORE INSERT ON lease_archive_successor_commands FOR EACH ROW EXECUTE FUNCTION h08_successor_reject()`);
  await assert.rejects(prepared.onboarding.commit(archive.user, dto, randomUUID(), {}), /H08_SUCCESSOR_COMMAND_FAILURE/);
  assert.deepEqual(await fingerprints(pool), before);
  await pool.query('DROP TRIGGER h08_successor_reject ON lease_archive_successor_commands; DROP FUNCTION h08_successor_reject()');
  const oldInvoices = (await pool.query('SELECT to_jsonb(invoice) AS row FROM invoices invoice WHERE lease_id=$1 ORDER BY id', [archive.lease.id])).rows;
  const financeBefore = await fingerprints(pool, ['payments','payment_receipts','property_owner_realizations']);
  const key = randomUUID();
  const results = await Promise.all([prepared.onboarding.commit(archive.user, dto, key, {}), prepared.onboarding.commit(archive.user, dto, key, {})]);
  assert.equal(results[0].leaseId, results[1].leaseId);
  assert.notEqual(results[0].leaseId, archive.lease.id);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM lease_archive_successor_commands WHERE archive_id=$1', [archive.archiveId])).rows[0].n, 1);
  const state = (await pool.query(`SELECT archive.archive_status,archive.successor_lease_id,archive.financial_resolution_state,
    old.lease_status AS original_status,new.lease_status AS new_status,new.resident_id,new.occupancy_id,resident.resident_status
    FROM lease_archives archive JOIN leases old ON old.id=archive.lease_id JOIN leases new ON new.id=archive.successor_lease_id
    JOIN residents resident ON resident.id=new.resident_id WHERE archive.id=$1`, [archive.archiveId])).rows[0];
  assert.equal(state.archive_status, 'superseded');
  assert.equal(state.financial_resolution_state, 'pending_review');
  assert.equal(state.original_status, 'cancelled');
  assert.equal(state.new_status, 'awaiting_activation');
  assert.equal(state.resident_id, archive.lease.resident_id);
  assert.equal(state.occupancy_id, null);
  assert.notEqual(state.resident_status, 'archived');
  const archiveService = new LeaseArchiveService(repository, new LeaseRevisionContextService(repository));
  const detail = await archiveService.detail(archive.user, archive.archiveId, archive.lease.property_id);
  assert.equal(detail.data.successor_lease_id, results[0].leaseId);
  assert.equal(detail.data.replacement_reason, dto.archive_replacement_reason);
  assert.equal(detail.data.restored_at, null);
  const listed = await archiveService.list(archive.user, { property_id: archive.lease.property_id, limit: 100 });
  assert.ok(listed.data.items.some(item => item.id === archive.archiveId && item.archive_status === 'superseded'), 'Read-only source remains discoverable in archives');
  const roomEvents = [[archive.lease.room_id, 'lease_archive_replaced']];
  if (prepared.room.id !== archive.lease.room_id) roomEvents.push([prepared.room.id, 'lease_archive_successor_created']);
  for (const [roomId, type] of roomEvents) {
    const events = (await pool.query(ROOM_ACTIVITY_SQL, [archive.lease.property_id, roomId])).rows.filter(row => row.event_type === type);
    assert.equal(events.length, 1, `Captured room activity missing or duplicated: ${type}`);
    assert.equal(events[0].notes, dto.archive_replacement_reason);
  }
  assert.deepEqual(await fingerprints(pool, ['payments','payment_receipts','property_owner_realizations']), financeBefore);
  assert.deepEqual((await pool.query('SELECT to_jsonb(invoice) AS row FROM invoices invoice WHERE lease_id=$1 ORDER BY id', [archive.lease.id])).rows, oldInvoices);
  assert.ok(archive.residentRead, 'An actual W06 resident claim is required to prove successor isolation');
  const billing = new W06BillingService({ ...repository, client: pool }, {}, {});
  const current = parseMyW06Billing(await billing.myBilling(archive.residentRead.user));
  const original = parseMyW06Billing(await billing.myHistoricalBilling(archive.residentRead.user, archive.lease.id));
  const history = parseMyBillingHistory(await billing.myBillingHistory(archive.residentRead.user, {}));
  assert.equal(current.lease.id, results[0].leaseId);
  assert.equal(original.lease.id, archive.lease.id);
  assert.equal(original.lease.status, 'cancelled');
  assert.ok(history.items.some(item => item.id === archive.lease.id));
  assert.ok(original.proofs.some(item => item.id === archive.residentRead.proofId));
  assert.ok(!current.proofs.some(item => item.id === archive.residentRead.proofId));
  const oldInvoiceIds = new Set(original.invoices.map(item => item.id));
  assert.ok(current.invoices.every(item => !oldInvoiceIds.has(item.id)));
  assert.equal(original.contract_settlement?.partial_payment_allowed ?? false, false);
  process.stdout.write('Actual resident successor reads: current replacement and historical archive remain separately discoverable with no migrated claims, invoices or payment authority\n');
  await assert.rejects(prepared.onboarding.commit(archive.user, { ...dto, archive_replacement_reason: 'Changed intent' }, key, {}), error => error.getResponse?.().code === 'IDEMPOTENCY_KEY_REUSED');
  await assert.rejects(prepared.onboarding.commit(archive.user, dto, randomUUID(), {}), error => error.getResponse?.().code === 'LEASE_ARCHIVE_SUCCESSOR_SOURCE_STALE');
  await assert.rejects(pool.query('DELETE FROM lease_archive_successor_commands WHERE archive_id=$1', [archive.archiveId]), error => error.code === '23514');
  process.stdout.write('Real PostgreSQL successor: canonical onboarding atomically links one replacement, retains original pending finance, rejects scope/conflicts, rolls back and replays concurrent intent\n');
};
