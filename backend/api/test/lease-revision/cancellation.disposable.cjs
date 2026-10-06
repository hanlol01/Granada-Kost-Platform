// Real SQL proof. Invoked only by the explicitly opted-in disposable clone harness.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { LeaseArchiveService } = require('../../src/modules/lease/lease-archive.service.ts');
const { LeaseRevisionContextService } = require('../../src/modules/lease/lease-revision-context.service.ts');
const { LeaseDataCorrectionService } = require('../../src/modules/lease/lease-data-correction.service.ts');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');
const { ROOM_ACTIVITY_SQL } = require('../../src/modules/admin-ux-master/room-activity.sql.ts');
const { createSponsoredLeaseFixture } = require('./onboarding-fixture.disposable.cjs');
const { LeaseActivationService } = require('../../src/modules/lease/lease-activation.service.ts');
const { LeaseCheckInService } = require('../../src/modules/lease/lease-check-in.service.ts');
const { LeaseServicePeriodService } = require('../../src/modules/lease/lease-service-period.service.ts');
const { PropertyOwnerRealizationService } = require('../../src/modules/property-owner-management/property-owner-realization.service.ts');
const { PropertyOwnerPortalService } = require('../../src/modules/property-owner-management/property-owner-portal.service.ts');
const { ReportService } = require('../../src/modules/report/report.service.ts');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(id, ...args) {
  if (id === '@/lib/api') return { apiClient: {} };
  if (id === '@/lib/document-download') return {};
  if (id === '@/lib/env') return { env: {} };
  return originalLoad.call(this, id, ...args);
};
const { parseMyW06Billing, parseMyBillingHistory } = require('../../../../apps/penghuni/src/lib/penghuni-w06-billing.ts');
Module._load = originalLoad;
const { createLeaseRevisionClient } = require('../../../../apps/admin/src/lib/lease-revision-contract.ts');

module.exports.runCancellationProof = async function (pool, actorId, transaction, fingerprints) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const repository = {
    client: pool, query: (sql, values) => pool.query(sql, values),
    transaction: (operation) => transaction(pool, operation),
  };
  const contexts = new LeaseRevisionContextService(repository);
  const billing = new W06BillingService(repository, {
    assertCanReadProperty: async (user, propertyId) => assert.ok(user.propertyIds.includes(propertyId)),
  }, new AuditRepository(repository));
  const service = new LeaseArchiveService(repository, contexts, billing);
  await createSponsoredLeaseFixture(pool, actorId, repository);
  await createSponsoredLeaseFixture(pool, actorId, repository);
  const activationFixture = await createSponsoredLeaseFixture(pool, actorId, repository);
  const activation = new LeaseActivationService(repository, {
    assertCanReadProperty: async (user, propertyId) => assert.ok(user.propertyIds.includes(propertyId)),
  }, new AuditRepository(repository), {});
  await activation.activate(activationFixture.user, activationFixture.lease.id,
    { property_id: activationFixture.lease.property_id, confirm_check_in: false }, randomUUID(), {});
  // Submit a real resident claim through W06, without creating a payment. The
  // upload metadata is clone-only; this SQL proof never reads application storage.
  const claimFixture = await createSponsoredLeaseFixture(pool, actorId, repository);
  const correction = new LeaseDataCorrectionService(repository, billing,
    new LeaseServicePeriodService(repository,{assertCanReadProperty:async(user,propertyId)=>assert.ok(user.propertyIds.includes(propertyId))}),contexts);
  const claimProposal = { commercial_mode: 'rent', payment_plan_type: 'annual_full', billing_cycle: 'yearly',
    pricing_source: 'standard', reason: 'Disposable proof: original paid rental without payment' };
  const actualPreview = await correction.preview(claimFixture.user, claimFixture.lease.id, claimProposal);
  const parsedPreview = await createLeaseRevisionClient({ post: async () => actualPreview })
    .previewDataCorrection(claimFixture.lease.id, { commercialMode: 'rent', reason: claimProposal.reason }, claimFixture.lease.property_id);
  assert.equal(parsedPreview.ownerImpact.transferAmountUnchanged, true);
  assert.equal(parsedPreview.ownerImpact.projectionOnly, true);
  assert.equal(parsedPreview.ownerImpact.previous.projectedOwnerEntitlement, 0);
  assert.equal(parsedPreview.ownerImpact.corrected.projectedOwnerEntitlement,
    parsedPreview.corrected.contractRentAmount - parsedPreview.ownerImpact.corrected.managementFeeAmount);
  assert.ok(Array.isArray(parsedPreview.documentImpact));
  const correctionKey = randomUUID();
  const actualCommit = await correction.commit(claimFixture.user, claimFixture.lease.id, claimProposal, correctionKey);
  const parsedCommit = await createLeaseRevisionClient({ post: async () => actualCommit })
    .commitDataCorrection(claimFixture.lease.id, { commercialMode: 'rent', reason: claimProposal.reason }, correctionKey, claimFixture.lease.property_id);
  assert.equal(parsedCommit.correction.corrected.contractRentAmount, parsedPreview.corrected.contractRentAmount);
  const actualReplay = await correction.commit(claimFixture.user, claimFixture.lease.id, claimProposal, correctionKey);
  const parsedReplay = await createLeaseRevisionClient({ post: async () => actualReplay })
    .commitDataCorrection(claimFixture.lease.id, { commercialMode: 'rent', reason: claimProposal.reason }, correctionKey, claimFixture.lease.property_id);
  assert.equal(parsedReplay.correction.id, parsedCommit.correction.id, 'Retry must return the same committed correction');
  const shorter = await correction.preview(claimFixture.user, claimFixture.lease.id, { term_months: 6, pricing_source: 'standard' });
  await correction.commit(claimFixture.user, claimFixture.lease.id,
    { term_months: 6, pricing_source: 'standard', reason: 'Disposable proof: reduce mistaken duration without pretending cash was paid' }, randomUUID());
  const claimant = (await pool.query('SELECT user_id FROM residents WHERE id=$1 AND property_id=$2',
    [claimFixture.lease.resident_id, claimFixture.lease.property_id])).rows[0].user_id;
  assert.ok(claimant, 'Canonical resident account required for the transfer claim');
  const correctedBilling = await billing.myBilling({ id: claimant, roles: ['resident'], permissions: [], propertyIds: [claimFixture.lease.property_id] });
  assert.equal(correctedBilling.data.contract_settlement.initial_rent_credit, 0, 'Price-reduction credit is not an initial cash payment');
  assert.equal(correctedBilling.data.contract_settlement.payment_allocated, 0);
  assert.equal(correctedBilling.data.contract_settlement.outstanding_amount, shorter.data.impact.outstanding_amount_after,
    'Corrected contract must not subtract the same price reduction again');
  const residentProjection = (await pool.query('SELECT contract_settlement_remaining_amount FROM resident_admin_lifecycle_projection WHERE resident_id=$1',
    [claimFixture.lease.resident_id])).rows[0];
  assert.equal(Number(residentProjection.contract_settlement_remaining_amount), shorter.data.impact.outstanding_amount_after,
    'Resident list and notifications must agree with corrected billing, not count price reduction as cash');
  const ownerRealizations = Object.create(PropertyOwnerRealizationService.prototype);
  ownerRealizations.database = { client: pool };
  const ownerPeriod = (await pool.query("SELECT to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYY-MM') AS period")).rows[0].period;
  const notEligible = await ownerRealizations.notEligibleRows(claimFixture.lease.property_id, ownerPeriod);
  assert.equal(notEligible.find(row => row.lease_id === claimFixture.lease.id)?.reason_code, 'AWAITING_PHYSICAL_CHECK_IN');
  const ownerProjectionFixture = await createSponsoredLeaseFixture(pool, actorId, repository);
  await activation.activate(ownerProjectionFixture.user, ownerProjectionFixture.lease.id,
    { property_id: ownerProjectionFixture.lease.property_id, confirm_check_in: false }, randomUUID(), {});
  await correction.commit(ownerProjectionFixture.user, ownerProjectionFixture.lease.id,
    { ...claimProposal, reason: 'Disposable Owner projection proof: correct commercial mode' }, randomUUID());
  const ownerCorrection = await correction.preview(ownerProjectionFixture.user, ownerProjectionFixture.lease.id, { term_months: 6, pricing_source: 'standard' });
  await correction.commit(ownerProjectionFixture.user, ownerProjectionFixture.lease.id,
    { term_months: 6, pricing_source: 'standard', reason: 'Disposable Owner projection proof: reduce incorrect duration' }, randomUUID());
  const ownerAccount = (await pool.query(`SELECT profile.user_id FROM rooms room
    JOIN building_owner_assignments assignment ON assignment.building_id=room.building_id AND assignment.property_id=room.property_id AND assignment.assignment_status='active'
    JOIN property_owner_profiles profile ON profile.id=assignment.owner_profile_id AND profile.profile_status='active'
    WHERE room.id=$1`, [ownerProjectionFixture.lease.room_id])).rows[0];
  assert.ok(ownerAccount?.user_id, 'An existing Owner account is required for the real account-scoped projection');
  const ownerProgress = await new PropertyOwnerPortalService({ client: pool }).collectionProgress({ id: ownerAccount.user_id, roles: ['property_owner'], permissions: [], propertyIds: [ownerProjectionFixture.lease.property_id] });
  const ownerRoom = (await pool.query('SELECT room_code FROM rooms WHERE id=$1', [ownerProjectionFixture.lease.room_id])).rows[0].room_code;
  const ownerItem = ownerProgress.items.find(item => item.room.code === ownerRoom);
  assert.ok(ownerItem);
  assert.equal(Number(ownerItem.billing.rent_verified), 0, 'Owner must not see a price reduction as a payment');
  assert.equal(Number(ownerItem.billing.contract_outstanding), ownerCorrection.data.impact.outstanding_amount_after);
  const claimInvoice = (await pool.query("SELECT id FROM invoices WHERE lease_id=$1 AND property_id=$2 AND invoice_purpose='rent' AND invoice_status NOT IN ('void','draft','paid') ORDER BY due_date,id LIMIT 1",
    [claimFixture.lease.id, claimFixture.lease.property_id])).rows[0];
  assert.ok(claimInvoice, 'Canonical rent invoice required for the transfer claim');
  const claimFileId = randomUUID();
  await pool.query(`INSERT INTO files(id,property_id,uploader_user_id,original_filename,sanitized_filename,
    mime_type,file_extension,file_size_bytes,file_purpose,storage_driver,storage_path,checksum_sha256)
    VALUES($1,$2,$3,'claim.pdf','claim.pdf','application/pdf','pdf',100,'payment_proof','local',$4,$5)`,
    [claimFileId, claimFixture.lease.property_id, claimant, `disposable-only/${claimFileId}.pdf`, 'a'.repeat(64)]);
  const submitted = await billing.submitMyProof({ id: claimant, roles: ['resident'], permissions: [],
    propertyIds: [claimFixture.lease.property_id] }, { invoice_id: claimInvoice.id, claimed_amount: 1000,
    payment_purpose: 'rent', file_ids: [claimFileId] }, randomUUID(), {});
  assert.equal(submitted.data.proof_status, 'pending_review');
  const claimFacts = (await contexts.get(claimFixture.user, claimFixture.lease.id)).data;
  assert.equal(claimFacts.financial.payment_count, 0);
  assert.equal(claimFacts.financial.payment_proof_count, 1);
  assert.equal(claimFacts.financial.pending_proof_claimed_amount, 1000);
  assert.equal(claimFacts.financial.verified_payment_amount, 0);
  assert.equal(claimFacts.policies.cancellation.financial_resolution_required, true);
  assert.equal(claimFacts.policies.commercial_mode_change.allowed, false);
  // Compile and execute the actual proof workspace query, not a SQL substring mock.
  const workspace = await billing.proofWorkspace(claimFixture.user, { property_id: claimFixture.lease.property_id });
  const projectedClaim = workspace.data.find(item => item.id === submitted.data.id);
  assert.ok(projectedClaim);
  assert.equal(projectedClaim.evidence[0].id, claimFileId);
  assert.equal(projectedClaim.claimed_amount, 1000);
  const candidates = (await pool.query(`SELECT id,property_id,room_id,resident_id,commercial_mode,lease_status
    FROM leases WHERE lease_status IN ('awaiting_activation','active') AND id<>$1 ORDER BY created_at DESC LIMIT 150`, [ownerProjectionFixture.lease.id])).rows;
  const reviews = [];
  const rejectedBindings = {};
  let occupied;
  for (const lease of candidates) {
    const user = { id: actorId, roles: ['admin'], permissions: ['lease.manage','lease.read'], propertyIds: [lease.property_id] };
    const context = await contexts.get(user, lease.id);
    if (context.data.lease.physical_check_in_recorded && !occupied) occupied = { lease, user };
    if (!context.data.policies.cancellation.allowed) continue;
    // Binding errors on genuine records are evidence of ineligibility, not synthetic fixtures.
    try {
      const review = await service.previewCancellation(user, lease.id);
      reviews.push({ lease, user, review: review.data });
    } catch (error) {
      if (error.getStatus?.() !== 409) throw error;
      const code = error.getResponse?.().code ?? 'UNCLASSIFIED';
      rejectedBindings[code] = (rejectedBindings[code] ?? 0) + 1;
      if (code === 'LEASE_CANCELLATION_BINDINGS_INVALID') {
        const diagnostic = (await pool.query(`SELECT lease.lease_status,lease.commercial_mode,room.room_status,
          commitment.status AS commitment_status,commitment.id IS NOT NULL AS commitment_present,
          commitment.lease_id=lease.id AS commitment_lease_matches,
          commitment.resident_id=lease.resident_id AS commitment_resident_matches,
          commitment.room_id=lease.room_id AS commitment_room_matches,
          commitment.hold_id IS NOT NULL AS hold_expected,hold.id IS NOT NULL AS hold_present,
          hold.hold_status,hold.onboarding_commitment_id=commitment.id AS hold_commitment_matches,
          hold.room_id=lease.room_id AS hold_room_matches,lease.booking_lead_id IS NOT NULL AS lead_expected,
          lead.lease_id=lease.id AS lead_lease_matches
          FROM leases lease JOIN rooms room ON room.id=lease.room_id
          LEFT JOIN onboarding_commitments commitment ON commitment.id=lease.onboarding_commitment_id
          LEFT JOIN booking_lead_holds hold ON hold.id=commitment.hold_id
          LEFT JOIN booking_leads lead ON lead.id=lease.booking_lead_id WHERE lease.id=$1`, [lease.id])).rows[0];
        process.stdout.write(`Cancellation binding diagnostics (no identity): ${JSON.stringify(diagnostic)}\n`);
      }
    }
  }
  process.stdout.write(`Cancellation proof candidate counts: ${JSON.stringify({
    paidWithoutMoney: reviews.filter((item) => item.lease.commercial_mode === 'rent' && item.review.financial_resolution_state === 'not_required').length,
    sponsoredWithoutMoney: reviews.filter((item) => item.lease.commercial_mode === 'owner_sponsored' && item.review.financial_resolution_state === 'not_required').length,
    pendingFinance: reviews.filter((item) => item.review.financial_resolution_state === 'pending_review').length,
    rejectedBindings,
  })}\n`);
  assert.ok(occupied, 'A genuine occupied lease is required for the no-quick-cancellation gate');
  await assert.rejects(service.previewCancellation(occupied.user, occupied.lease.id),
    (error) => error.getResponse?.().code === 'LEASE_CANCELLATION_REAL_OCCUPANCY');
  let paid = reviews.find((item) => item.lease.commercial_mode === 'rent' && item.review.financial_resolution_state === 'not_required');
  // When onboarding in the source already captured booking fees, obtain the
  // no-money rental case via the real, already-proven mode-correction authority
  // in this clone. Never directly forge invoices/payments or alter source data.
  if (!paid) {
    const preparable = reviews.find((item) => item.lease.id !== activationFixture.lease.id && item.lease.commercial_mode === 'owner_sponsored' &&
      item.review.financial_resolution_state === 'not_required' && item.review.policies.commercial_mode_change.allowed &&
      item.review.lease.recorded_end_date > new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));
    assert.ok(preparable, 'A genuine eligible sponsored record is required to prepare the clone-only no-money rental case');
    const correction = new LeaseDataCorrectionService(repository, billing, {}, contexts);
    const proposal = { commercial_mode: 'rent', payment_plan_type: 'annual_full', billing_cycle: 'yearly',
      reason: 'Disposable proof: originally paid rental with no money yet',
      ...(preparable.review.lease.term_months < 3
        ? { pricing_source: 'negotiated', agreed_monthly_price: preparable.review.lease.reference_monthly_price,
            pricing_agreement_reason: 'Disposable proof of the original agreed tariff', pricing_variance_acknowledged: true }
        : { pricing_source: 'standard' }) };
    await correction.preview(preparable.user, preparable.lease.id, proposal);
    await correction.commit(preparable.user, preparable.lease.id, proposal, randomUUID());
    paid = { ...preparable, lease: { ...preparable.lease, commercial_mode: 'rent' },
      review: (await service.previewCancellation(preparable.user, preparable.lease.id)).data };
  }
  const sponsored = reviews.find((item) => item.lease.id !== activationFixture.lease.id && item.lease.id !== paid.lease.id && item.lease.commercial_mode === 'owner_sponsored' && item.review.financial_resolution_state === 'not_required');
  const money = reviews.find((item) => item.review.financial_resolution_state === 'pending_review');
  const activationOnly = reviews.find(item => item.lease.id === activationFixture.lease.id);
  const proofOnly = reviews.find(item => item.lease.id === claimFixture.lease.id);
  assert.ok(paid, 'A real unoccupied paid lease without transactions is required');
  assert.ok(sponsored, 'A real unoccupied sponsored lease without transactions is required');
  assert.ok(money, 'A real unoccupied lease with transactions is required');
  assert.ok(activationOnly, 'Canonical activation without physical check-in must permit explicit mistaken-activation review');
  assert.ok(proofOnly, 'A transfer claim without any payment must remain archivable with financial review');
  const dtoFor = (item) => ({ reason: 'Disposable proof: mistaken onboarding record',
    review_fingerprint: item.review.review_fingerprint, cancellation_confirmed: true,
    mistaken_activation_confirmed: item.review.policies.cancellation.requires_mistaken_activation_confirmation });

  const baseline = await fingerprints(pool);
  await assert.rejects(service.cancel(paid.user, paid.lease.id,
    { ...dtoFor(paid), review_fingerprint: '0'.repeat(64) }, randomUUID()),
    (error) => error.getResponse?.().code === 'LEASE_CANCELLATION_REVIEW_STALE');
  await assert.rejects(service.cancel({ ...paid.user, propertyIds: [] }, paid.lease.id, dtoFor(paid), randomUUID()),
    (error) => error.getStatus?.() === 403);
  assert.deepEqual(await fingerprints(pool), baseline);
  await assert.rejects(service.cancel(activationOnly.user, activationOnly.lease.id,
    { ...dtoFor(activationOnly), mistaken_activation_confirmed: false }, randomUUID()),
    error => error.getResponse?.().code === 'LEASE_CANCELLATION_ACTIVATION_CONFIRMATION_REQUIRED');
  // Reject after the room/invoice/commitment changes, at the final archive insert.
  // The actual PostgreSQL transaction must roll all of them back.
  await pool.query(`CREATE FUNCTION h08_archive_proof_reject() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'H08_ARCHIVE_COMMAND_FAILURE'; END $$;
    CREATE TRIGGER h08_archive_proof_reject BEFORE INSERT ON lease_archives
      FOR EACH ROW EXECUTE FUNCTION h08_archive_proof_reject()`);
  await assert.rejects(service.cancel(paid.user, paid.lease.id, dtoFor(paid), randomUUID()), /H08_ARCHIVE_COMMAND_FAILURE/);
  assert.deepEqual(await fingerprints(pool), baseline);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM lease_archive_commands')).rows[0].n, 0);
  await pool.query('DROP TRIGGER h08_archive_proof_reject ON lease_archives; DROP FUNCTION h08_archive_proof_reject()');

  const key = randomUUID();
  const retries = await Promise.all([
    service.cancel(paid.user, paid.lease.id, dtoFor(paid), key),
    service.cancel(paid.user, paid.lease.id, dtoFor(paid), key),
  ]);
  assert.deepEqual(retries.map((result) => result.idempotent).sort(), [false,true]);
  assert.equal(retries[0].data.archive.id, retries[1].data.archive.id);
  await assert.rejects(service.cancel(paid.user, paid.lease.id, { ...dtoFor(paid), reason: 'Changed intent' }, key),
    (error) => error.getResponse?.().code === 'IDEMPOTENCY_KEY_REUSED');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM lease_archive_commands WHERE lease_id=$1', [paid.lease.id])).rows[0].n, 1);

  const archived = [];
  for (const item of [...new Set([paid,sponsored,money,activationOnly,proofOnly])]) {
    const financialBefore = await fingerprints(pool, ['payments','payment_receipts','property_owner_realizations']);
    const invoicesBefore = (await pool.query('SELECT to_jsonb(invoice) AS row FROM invoices invoice WHERE lease_id=$1 ORDER BY id', [item.lease.id])).rows;
    const result = item === paid ? retries[0] : await service.cancel(item.user, item.lease.id, dtoFor(item), randomUUID());
    archived.push({ ...item, archiveId: result.data.archive.id, activationOnly: item === activationOnly });
    const state = (await pool.query(`SELECT lease.lease_status,lease.occupancy_id,room.room_status,resident.resident_status
      FROM leases lease JOIN rooms room ON room.id=lease.room_id JOIN residents resident ON resident.id=lease.resident_id WHERE lease.id=$1`, [item.lease.id])).rows[0];
    assert.equal(state.lease_status, 'cancelled');
    assert.equal(state.occupancy_id, null);
    assert.equal(state.room_status, 'vacant');
    assert.equal(result.data.archive.financial_resolution_state, item.review.financial_resolution_state);
    assert.deepEqual(await fingerprints(pool, ['payments','payment_receipts','property_owner_realizations']), financialBefore);
    if (item.review.financial_resolution_state === 'pending_review') {
      assert.deepEqual((await pool.query('SELECT to_jsonb(invoice) AS row FROM invoices invoice WHERE lease_id=$1 ORDER BY id', [item.lease.id])).rows, invoicesBefore);
      assert.deepEqual(result.data.archive.voided_invoice_ids, []);
    } else {
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoices WHERE lease_id=$1 AND invoice_status<>'void'", [item.lease.id])).rows[0].n, 0);
    }
    const detail = await service.detail(item.user, result.data.archive.id, item.lease.property_id);
    assert.equal(detail.data.original_context.lease.id, item.lease.id);
    assert.equal(detail.data.current_room_status, 'vacant');
    const listed = await service.list(item.user, { property_id: item.lease.property_id, q: item.review.lease.lease_code });
    assert.equal(listed.data.items.length, 1);
    assert.equal(listed.data.items[0].id, result.data.archive.id);
    const pastEnd = await service.list(item.user, { property_id: item.lease.property_id, q: item.review.lease.lease_code, offset: 1000 });
    assert.deepEqual(pastEnd.data.items, []);
    assert.equal(pastEnd.data.total, 1, 'An empty page must retain the actual filtered total');
    const events = (await pool.query(ROOM_ACTIVITY_SQL, [item.lease.property_id, item.lease.room_id])).rows;
    assert.equal(events.filter((event) => event.event_type === 'lease_cancelled_and_archived' && event.resident_id === item.lease.resident_id).length, 1);
    await assert.rejects(pool.query('UPDATE lease_archive_commands SET reason=$2 WHERE lease_id=$1', [item.lease.id,'Erase reason']), (error) => error.code === '23514');
    await assert.rejects(pool.query('DELETE FROM lease_archives WHERE id=$1', [result.data.archive.id]), (error) => error.code === '23514');
    await assert.rejects(service.detail({ ...item.user, roles: ['property_owner'] }, result.data.archive.id, item.lease.property_id), (error) => error.getStatus?.() === 403);
  }
  // Execute the public self-read authorities and the real Penghuni parser after
  // archiving. No synthetic DTO can conceal an API/client contract mismatch.
  const selfUser = { id: claimant, roles: ['resident'], permissions: ['billing.self.read'], propertyIds: [claimFixture.lease.property_id] };
  const history = parseMyBillingHistory(await billing.myBillingHistory(selfUser, {}));
  assert.ok(history.items.some(item => item.id === claimFixture.lease.id));
  const historical = parseMyW06Billing(await billing.myHistoricalBilling(selfUser, claimFixture.lease.id));
  assert.equal(historical.lease.status, 'cancelled');
  assert.ok(historical.proofs.some(proof => proof.id === submitted.data.id));
  assert.equal(historical.contract_settlement?.partial_payment_allowed ?? false, false);
  await assert.rejects(billing.myHistoricalBilling({ ...selfUser, id: actorId }, claimFixture.lease.id), error => error.getStatus?.() === 404);
  await assert.rejects(billing.submitMyProof(selfUser, { invoice_id: claimInvoice.id, claimed_amount: 1000,
    payment_purpose: 'rent', file_ids: [claimFileId] }, randomUUID(), {}),
    error => error.getResponse?.().code === 'LEASE_BILLING_STATUS_INVALID');
  for (const item of archived) {
    const resident = (await pool.query('SELECT user_id FROM residents WHERE id=$1 AND property_id=$2', [item.lease.resident_id, item.lease.property_id])).rows[0];
    if (!resident.user_id) continue;
    const projection = parseMyW06Billing(await billing.myHistoricalBilling({ ...selfUser, id: resident.user_id }, item.lease.id));
    assert.equal(projection.lease.id, item.lease.id);
    assert.equal(projection.lease.status, 'cancelled');
    if (item.lease.id !== claimFixture.lease.id) assert.ok(!projection.proofs.some(proof => proof.id === submitted.data.id));
  }
  const excludedRows = await ownerRealizations.notEligibleRows(claimFixture.lease.property_id, ownerPeriod);
  const eligibleRows = await ownerRealizations.eligibleCandidates(pool, claimFixture.lease.property_id, null);
  for (const item of archived.filter(item => item.lease.property_id === claimFixture.lease.property_id)) {
    assert.ok(!excludedRows.some(row => row.lease_id === item.lease.id), 'Cancelled archives are not an active Owner realization queue');
    assert.ok(!eligibleRows.some(row => row.lease_id === item.lease.id));
  }
  process.stdout.write('Corrected financial projections: resident list, W06 billing and account-scoped Owner progress agree; cancelled archives excluded from live realization queues\n');
  const financeOwner = (await pool.query("SELECT user_id FROM property_owner_profiles WHERE property_id=$1 AND profile_status='active' AND user_id IS NOT NULL ORDER BY id LIMIT 1", [claimFixture.lease.property_id])).rows[0];
  assert.ok(financeOwner);
  const oldRoomAllocations = (await pool.query(`SELECT allocation.id
    FROM payment_allocations allocation JOIN payments payment ON payment.id=allocation.payment_id
    JOIN invoices invoice ON invoice.id=allocation.invoice_id JOIN leases lease ON lease.id=allocation.lease_id
    JOIN occupancies occupancy ON occupancy.id=lease.occupancy_id
    WHERE payment.property_id=$1 AND payment.payment_status='verified' AND payment.payment_purpose IN ('rent','dp')
      AND allocation.target_type='invoice' AND allocation.allocation_status='active' AND allocation.allocation_purpose IN ('rent','dp')
      AND invoice.invoice_purpose='rent' AND invoice.invoice_status IN ('issued','unpaid','partially_paid','paid','overdue')
      AND invoice.total_amount>0 AND invoice.snapshot_monthly_price>0
      AND lease.lease_status IN ('active','ended','completed') AND lease.activated_at IS NOT NULL
      AND occupancy.occupancy_status IN ('active','ended')
      AND (invoice.room_id<>lease.room_id OR invoice.room_id<>occupancy.room_id)
      AND NOT EXISTS (SELECT 1 FROM payment_reversal_allocations reversal WHERE reversal.original_allocation_id=allocation.id)`,
    [claimFixture.lease.property_id])).rows.map(row=>row.id);
  assert.ok(oldRoomAllocations.length>0, 'Real historical/current-room mismatch must remain covered');
  const earningBefore = (await pool.query('SELECT to_jsonb(earning) AS record FROM property_owner_earnings earning WHERE payment_allocation_id=ANY($1::uuid[]) ORDER BY id', [oldRoomAllocations])).rows;
  // Valid current-room money must still be recognized after candidate filtering.
  await correction.commit(ownerProjectionFixture.user,ownerProjectionFixture.lease.id,
    {term_months:7,pricing_source:'standard',reason:'Disposable proof: extend a corrected term before actual check-in'},randomUUID());
  const scope={assertCanReadProperty:async(user,propertyId)=>assert.ok(user.propertyIds.includes(propertyId))};
  const checkIns=new LeaseCheckInService(repository,scope,new AuditRepository(repository),new LeaseServicePeriodService(repository,scope));
  await checkIns.confirm(ownerProjectionFixture.user,ownerProjectionFixture.lease.id,
    {property_id:ownerProjectionFixture.lease.property_id,notes:'Disposable proof: valid physical check-in'},randomUUID(),{});
  const chargeAuthority=(await pool.query('SELECT * FROM lease_installments WHERE lease_id=$1 AND correction_id IS NOT NULL',[ownerProjectionFixture.lease.id])).rows[0];
  assert.ok(chargeAuthority?.correction_id,'Every new correction charge requires its immutable journal link');
  await assert.rejects(transaction(pool,client=>client.query('UPDATE lease_installments SET correction_id=NULL WHERE id=$1',[chargeAuthority.id])),error=>error.code==='23514');
  await assert.rejects(transaction(pool,client=>client.query(`INSERT INTO lease_installments
    SELECT (jsonb_populate_record(NULL::lease_installments,to_jsonb(source)||jsonb_build_object('id',$2::uuid,'sequence_number',source.sequence_number+100,'invoice_id',NULL,'scheduled_amount',source.scheduled_amount+1))).*
    FROM lease_installments source WHERE id=$1`,[chargeAuthority.id,randomUUID()])),error=>error.code==='23514');
  const routine=(await pool.query("SELECT id,invoice_id FROM lease_installments WHERE lease_id=$1 AND correction_id IS NULL AND installment_status<>'void' ORDER BY sequence_number LIMIT 1",[ownerProjectionFixture.lease.id])).rows[0];
  await assert.rejects(transaction(pool,client=>client.query(`INSERT INTO lease_installments
    SELECT (jsonb_populate_record(NULL::lease_installments,to_jsonb(source)||jsonb_build_object('id',$2::uuid,'sequence_number',source.sequence_number+100,'invoice_id',NULL))).*
    FROM lease_installments source WHERE id=$1`,[routine.id,randomUUID()])),error=>error.code==='23505'&&error.constraint==='lease_installments_current_period_unique');
  await assert.rejects(transaction(pool,client=>client.query(`INSERT INTO invoices
    SELECT (jsonb_populate_record(NULL::invoices,to_jsonb(source)||jsonb_build_object('id',$2::uuid,'invoice_code',$3::text,'command_fingerprint',$4::text))).*
    FROM invoices source WHERE id=$1`,[routine.invoice_id,randomUUID(),`H08-ROUTINE-${randomUUID()}`,`h08-routine:${randomUUID()}`])),
    // Both unchanged one-invoice-per-installment and routine-cycle uniqueness
    // protect this exact duplicate; PostgreSQL may report either first.
    error=>error.code==='23505'&&['idx_invoices_lease_cycle_start_unique','uq_invoices_w06_installment'].includes(error.constraint));
  await assert.rejects(transaction(pool,client=>client.query(`INSERT INTO invoices
    SELECT (jsonb_populate_record(NULL::invoices,to_jsonb(source)||jsonb_build_object('id',$2::uuid,'invoice_code',$3::text,'command_fingerprint',$4::text))).*
    FROM invoices source WHERE id=$1`,[routine.invoice_id,randomUUID(),`H08-FORGED-${randomUUID()}`,`lease-correction:${chargeAuthority.correction_id}`])),error=>error.code==='23514');
  process.stdout.write('Correction charge authority: routine duplicates, fabricated adjustment invoice, changed journal link and wrong charge amount rejected by PostgreSQL\n');
  for (const paymentPlan of ['monthly_installments','two_month_installments']) {
    process.stdout.write(`Corrected check-in matrix: ${paymentPlan}\n`);
    // Prove each schedule in a real PostgreSQL transaction, then roll it back.
    // This matrix must not consume rooms needed by independent restore/successor tests.
    const beforeSchedule=await fingerprints(pool);
    const scheduleClient=await pool.connect();
    try {
    await scheduleClient.query('BEGIN');
    const scheduleRepository={client:scheduleClient,query:(sql,values)=>scheduleClient.query(sql,values),transaction:operation=>operation(scheduleClient)};
    const scheduleBilling=new W06BillingService(scheduleRepository,scope,new AuditRepository(scheduleRepository));
    const correction=new LeaseDataCorrectionService(scheduleRepository,scheduleBilling,
      new LeaseServicePeriodService(scheduleRepository,scope),new LeaseRevisionContextService(scheduleRepository));
    const activation=new LeaseActivationService(scheduleRepository,scope,new AuditRepository(scheduleRepository),{});
    const checkIns=new LeaseCheckInService(scheduleRepository,scope,new AuditRepository(scheduleRepository),new LeaseServicePeriodService(scheduleRepository,scope));
    const scheduleFixture=await createSponsoredLeaseFixture(scheduleClient,actorId,scheduleRepository);
    await activation.activate(scheduleFixture.user,scheduleFixture.lease.id,
      {property_id:scheduleFixture.lease.property_id,confirm_check_in:false},randomUUID(),{});
    await correction.commit(scheduleFixture.user,scheduleFixture.lease.id,
      {commercial_mode:'rent',payment_plan_type:paymentPlan,billing_cycle:'monthly',
        pricing_source:'standard',reason:'Disposable proof: review an installment rental before check-in'},randomUUID());
    await correction.commit(scheduleFixture.user,scheduleFixture.lease.id,
      {term_months:6,pricing_source:'standard',reason:'Disposable proof: shorten an installment term before check-in'},randomUUID());
    await correction.commit(scheduleFixture.user,scheduleFixture.lease.id,
      {term_months:8,pricing_source:'standard',reason:'Disposable proof: extend an installment term before check-in'},randomUUID());
    const moneyBefore=await fingerprints(scheduleClient,['payments','invoices','payment_receipts']);
    await checkIns.confirm(scheduleFixture.user,scheduleFixture.lease.id,
      {property_id:scheduleFixture.lease.property_id,notes:'Disposable proof: corrected installment check-in'},randomUUID(),{});
    assert.deepEqual(await fingerprints(scheduleClient,['payments','invoices','payment_receipts']),moneyBefore);
    const dates=(await scheduleClient.query(`SELECT min(period.coverage_start_date)::text AS first,max(period.coverage_end_date)::text AS last
      FROM lease_installment_effective_periods period JOIN invoices invoice ON invoice.id=period.invoice_id
      WHERE period.lease_id=$1 AND period.installment_status<>'void' AND invoice.total_amount>invoice.credit_amount`,[scheduleFixture.lease.id])).rows[0];
    const current=(await scheduleClient.query('SELECT start_date::text,end_date::text FROM leases WHERE id=$1',[scheduleFixture.lease.id])).rows[0];
    assert.equal(dates.first,current.start_date);
    assert.equal(new Date(`${dates.last}T00:00:00Z`).getTime()+86400000,new Date(`${current.end_date}T00:00:00Z`).getTime());
    const amendedDate=new Date(new Date(`${current.start_date}T00:00:00Z`).getTime()-86400000).toISOString().slice(0,10);
    await correction.commit(scheduleFixture.user,scheduleFixture.lease.id,
      {checked_in_date:amendedDate,reason:'Disposable proof: correct recorded arrival without rewriting installment money'},randomUUID());
    assert.deepEqual(await fingerprints(scheduleClient,['payments','invoices','payment_receipts']),moneyBefore);
    assert.equal((await scheduleClient.query('SELECT start_date::text FROM leases WHERE id=$1',[scheduleFixture.lease.id])).rows[0].start_date,amendedDate);
    assert.equal((await scheduleClient.query('SELECT count(*)::int AS n FROM lease_service_period_versions WHERE lease_id=$1',[scheduleFixture.lease.id])).rows[0].n,2);
    } finally {await scheduleClient.query('ROLLBACK');scheduleClient.release();}
    assert.deepEqual(await fingerprints(pool),beforeSchedule,'Schedule matrix must leave later proof fixtures unchanged');
  }
  const payable=(await pool.query("SELECT id FROM invoices WHERE lease_id=$1 AND invoice_purpose='rent' AND invoice_status='issued' ORDER BY due_date,id LIMIT 1",[ownerProjectionFixture.lease.id])).rows[0];
  assert.ok(payable);
  await billing.recordManualPayment(ownerProjectionFixture.user,{property_id:ownerProjectionFixture.lease.property_id,
    resident_id:ownerProjectionFixture.lease.resident_id,lease_id:ownerProjectionFixture.lease.id,
    method:'cash',payment_purpose:'rent',amount:1000,allocations:[{invoice_id:payable.id,amount:1000}],evidence_file_ids:[],
    note:'Disposable proof: valid current-room recognition'},randomUUID(),{});
  const financeBefore=await fingerprints(pool,['payments','invoices','payment_receipts','property_owner_realizations']);
  const ownerFinance = await new PropertyOwnerPortalService({ client: pool }).finance({ id: financeOwner.user_id, roles: ['property_owner'], permissions: [], propertyIds: [claimFixture.lease.property_id] }, ownerPeriod);
  assert.equal(ownerFinance.period.period, ownerPeriod);
  assert.deepEqual((await pool.query('SELECT to_jsonb(earning) AS record FROM property_owner_earnings earning WHERE payment_allocation_id=ANY($1::uuid[]) ORDER BY id', [oldRoomAllocations])).rows,earningBefore,
    'Historical room earnings are retained without being attributed to the new room');
  assert.ok((await pool.query("SELECT count(*)::int AS n FROM property_owner_earnings WHERE lease_id=$1 AND earning_status='recognized'",[ownerProjectionFixture.lease.id])).rows[0].n>0,
    'Filtering inconsistent historical candidates must not disable valid earnings');
  assert.equal(Number((await pool.query('SELECT recognize_property_owner_earnings($1) AS n',[claimFixture.lease.property_id])).rows[0].n),0,'Recognition replay must not double-credit');
  assert.deepEqual(await fingerprints(pool,['payments','invoices','payment_receipts','property_owner_realizations']),financeBefore);
  process.stdout.write('Owner finance: historical/current-room candidates no longer abort recognition; valid canonical current-room payment recognized, replay=0, recorded finance unchanged\n');
  for (const format of ['pdf','xlsx']) {
    const document=await new PropertyOwnerPortalService({client:pool}).export({id:financeOwner.user_id,roles:['property_owner'],permissions:[],propertyIds:[claimFixture.lease.property_id]},ownerPeriod,format);
    assert.ok(Buffer.isBuffer(document.content));
    assert.ok(document.content.length>100);
    assert.ok(document.filename.includes(ownerPeriod));
    assert.equal(document.content.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');
  }
  assert.deepEqual(await fingerprints(pool,['payments','invoices','payment_receipts','property_owner_realizations']),financeBefore);
  process.stdout.write('Owner PDF/XLSX export: actual scoped SQL and document renderers produce named valid binary documents without changing transaction facts\n');
  process.stdout.write('Resident historical billing: real account-scoped SQL and Penghuni parser; cancelled paid/sponsored archives discoverable, claims retained, cross-account denied and new claims blocked\n');
  const reportScope={get:async(user,propertyId)=>{assert.ok(user.propertyIds.includes(propertyId));return {name:'Disposable property'};}};
  const reports=new ReportService({client:pool},reportScope,new AuditRepository(repository));
  const archiveRecord=(await pool.query('SELECT lease_code,start_date::text FROM leases WHERE id=$1',[claimFixture.lease.id])).rows[0];
  const reportInput={property_id:claimFixture.lease.property_id,date_from:archiveRecord.start_date,date_to:archiveRecord.start_date,q:archiveRecord.lease_code,limit:20,offset:0};
  const liveReport=await reports.preview(claimFixture.user,'leases',reportInput);
  assert.equal(liveReport.rows.length,0);
  assert.equal(liveReport.summary.contract_value,0);
  const historyReport=await reports.preview(claimFixture.user,'leases',{...reportInput,status:'cancelled'});
  assert.equal(historyReport.rows.length,1);
  assert.equal(historyReport.rows[0].lease_status,'cancelled');
  assert.equal(historyReport.summary.total_contracts,1);
  process.stdout.write('Lease report: real scoped rows and totals exclude erroneous archives by default; explicit cancelled-status history stays readable\n');
  archived.find(item => item.lease.id === claimFixture.lease.id).residentRead = { user: selfUser, proofId: submitted.data.id };
  process.stdout.write('Real PostgreSQL cancellation: paid/sponsored/finance-pending/activation-only/proof-only; W06 claim/workspace SQL, invoice preservation, occupied rejection, stale/scope gates, atomic rollback, concurrent replay, canonical void, immutable archive and room activity pass\n');
  return archived;
};
