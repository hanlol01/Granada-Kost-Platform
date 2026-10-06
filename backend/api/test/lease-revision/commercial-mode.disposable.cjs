// Runs only inside the guarded clone created by room-correction.disposable.cjs.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  LeaseDataCorrectionService,
} = require('../../src/modules/lease/lease-data-correction.service.ts');
const {
  LeaseRevisionContextService,
} = require('../../src/modules/lease/lease-revision-context.service.ts');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');

module.exports.runCommercialModeCorrectionProof = async function (pool, actorId, transaction, phase) {
  assert.ok(['before-check-in', 'after-check-in'].includes(phase));
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/,
  );
  const repository = {
    client: pool,
    query: (sql, values) => pool.query(sql, values),
    transaction: (operation) => transaction(pool, operation),
  };
  const contexts = new LeaseRevisionContextService(repository);
  const billing = new W06BillingService(
    repository,
    {
      assertCanReadProperty: async (user, propertyId) => {
        assert.ok(user.propertyIds.includes(propertyId));
      },
    },
    new AuditRepository(repository),
  );
  const service = new LeaseDataCorrectionService(repository, billing, {}, contexts);
  const candidates = (
    await pool.query(`SELECT lease.id,lease.property_id,lease.resident_id,
    lease.room_id,lease.onboarding_commitment_id,lease.term_months,term.owner_profile_id
    FROM leases lease JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=lease.property_id
    WHERE lease.commercial_mode='owner_sponsored' AND lease.lease_status IN ('awaiting_activation','active')
      AND lease.end_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND term.term_status='active'
    ORDER BY lease.created_at DESC LIMIT 40`)
  ).rows;
  let lease, user, initialContext;
  for (const candidate of candidates) {
    const proposed = {
      id: actorId,
      roles: ['admin'],
      permissions: ['lease.manage'],
      propertyIds: [candidate.property_id],
    };
    const context = await contexts.get(proposed, candidate.id);
    if (
      context.data.policies.commercial_mode_change.allowed &&
      context.data.lease.physical_check_in_recorded === (phase === 'after-check-in')
    ) {
      lease = candidate;
      user = proposed;
      initialContext = context.data;
      break;
    }
  }
  assert.ok(
    lease,
    `A real ${phase} sponsored lease without financial history is required; never modify source data to manufacture one`,
  );
  const snapshot = async () =>
    (
      await pool.query(
        `SELECT
    (SELECT to_jsonb(lease) FROM leases lease WHERE id=$1) AS lease,
    (SELECT to_jsonb(term) FROM owner_sponsored_lease_terms term WHERE lease_id=$1) AS term,
    (SELECT to_jsonb(settlement) FROM lease_contract_settlements settlement WHERE lease_id=$1) AS settlement,
    (SELECT COALESCE(jsonb_agg(to_jsonb(invoice) ORDER BY invoice.id),'[]') FROM invoices invoice WHERE lease_id=$1) AS invoices,
    (SELECT COALESCE(jsonb_agg(to_jsonb(installment) ORDER BY installment.id),'[]') FROM lease_installments installment WHERE lease_id=$1) AS installments,
    (SELECT COALESCE(jsonb_agg(to_jsonb(correction) ORDER BY correction.id),'[]') FROM lease_data_corrections correction WHERE lease_id=$1) AS amendments,
    (SELECT COALESCE(jsonb_agg(to_jsonb(revision) ORDER BY revision.id),'[]') FROM lease_commercial_mode_revisions revision WHERE lease_id=$1) AS revisions`,
        [lease.id],
      )
    ).rows[0];
  const original = await snapshot();
  process.stdout.write(
    `Mode proof facts: ${JSON.stringify({
      status: original.lease.lease_status,
      servicePeriod: original.lease.service_period_state,
      commitmentPresent: !!original.lease.onboarding_commitment_id,
      activationPresent: !!original.lease.activated_at,
      settlementState: original.settlement?.state ?? null,
    })}\n`,
  );
  const unchangedFacts = async () =>
    (
      await pool.query(
        `SELECT
    (SELECT to_jsonb(commitment) FROM onboarding_commitments commitment WHERE id=$2) AS commitment,
    (SELECT to_jsonb(lifecycle) FROM lease_activation_lifecycles lifecycle WHERE lease_id=$1) AS lifecycle,
    (SELECT COALESCE(jsonb_agg(to_jsonb(history) ORDER BY history.id),'[]') FROM occupancy_history history WHERE occupancy_id=$3) AS occupancy_history,
    (SELECT COALESCE(jsonb_agg(to_jsonb(transfer) ORDER BY transfer.id),'[]') FROM room_transfer_records transfer WHERE from_lease_id=$1 OR to_lease_id=$1) AS transfers`,
        [lease.id, lease.onboarding_commitment_id, original.lease.occupancy_id],
      )
    ).rows[0];
  const originalFacts = await unchangedFacts();
  const rentDto = {
    commercial_mode: 'rent',
    payment_plan_type: 'annual_full',
    billing_cycle: 'yearly',
    ...(lease.term_months < 3
      ? {
          pricing_source: 'negotiated',
          agreed_monthly_price: Number(original.lease.snapshot_reference_monthly_price),
          pricing_agreement_reason: 'Disposable proof: the original contract was paid rental',
          pricing_variance_acknowledged: true,
        }
      : { pricing_source: 'standard' }),
    reason: 'Disposable proof: originally paid rental, but occupancy mode was recorded incorrectly',
  };
  const sponsoredDto = {
    commercial_mode: 'owner_sponsored',
    sponsoring_owner_profile_id: lease.owner_profile_id,
    management_fee_mode: 'waived',
    owner_sponsorship_reason: 'Disposable proof: original Owner instruction',
    reason: 'Disposable proof: original occupancy mode was Owner sponsored',
  };
  const preview = await service.preview(user, lease.id, rentDto);
  assert.equal(preview.data.previous.commercial_mode, 'owner_sponsored');
  assert.equal(preview.data.corrected.commercial_mode, 'rent');
  assert.ok(preview.data.corrected.contract_rent_amount > 0);
  const key = randomUUID();
  const retries = await Promise.all([
    service.commit(user, lease.id, rentDto, key),
    service.commit(user, lease.id, rentDto, key),
  ]);
  assert.equal(retries[0].data.correction.id, retries[1].data.correction.id);
  assert.deepEqual(retries.map((result) => result.idempotent).sort(), [false, true]);
  const firstRent = await snapshot();
  assert.equal(firstRent.revisions.length, original.revisions.length + 1);
  assert.equal(firstRent.term.term_status, 'cancelled');
  assert.equal(firstRent.lease.service_period_state, original.lease.service_period_state);
  assert.equal(firstRent.lease.occupancy_id, original.lease.occupancy_id);
  assert.equal(firstRent.lease.activated_at, original.lease.activated_at);
  assert.equal(
    firstRent.settlement.state,
    original.lease.lease_status === 'active' ? 'open' : 'awaiting_activation',
  );
  assert.equal(
    firstRent.settlement.activated_at,
    original.lease.lease_status === 'active' ? original.lease.activated_at : null,
  );
  assert.equal((await contexts.get(user, lease.id)).data.owner_sponsorship, null);
  // Correcting a commercial recording must never create a second physical event.
  // Lifecycle review dates may be refreshed, but state/check-in identity stays fixed.
  const afterFacts = await unchangedFacts();
  assert.deepEqual(afterFacts.commitment, originalFacts.commitment);
  assert.deepEqual(afterFacts.occupancy_history, originalFacts.occupancy_history);
  assert.deepEqual(afterFacts.transfers, originalFacts.transfers);
  for (const key of ['id', 'state', 'checked_in_at', 'lease_id', 'property_id'])
    assert.equal(afterFacts.lifecycle?.[key], originalFacts.lifecycle?.[key]);
  assert.equal(
    firstRent.revisions.at(-1).previous_state.ownerSponsorship.ownerProfileId,
    lease.owner_profile_id,
  );
  // Failure after canonical invoice void must roll back the amendment, current
  // projections, invoice audit/event writes, and original policy/settlement.
  const beforeFailure = await snapshot();
  const auditBefore = (await pool.query('SELECT count(*)::int AS count FROM audit_logs')).rows[0]
    .count;
  await pool.query(`CREATE FUNCTION h08_proof_reject_mode_target() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.lease_id='${lease.id}'::uuid AND NEW.term_status='active' THEN RAISE EXCEPTION 'H08_MODE_TARGET_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER h08_proof_reject_mode_target BEFORE INSERT OR UPDATE ON owner_sponsored_lease_terms
      FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_mode_target()`);
  try {
    await assert.rejects(
      service.commit(user, lease.id, sponsoredDto, randomUUID()),
      /H08_MODE_TARGET_FAILURE/,
    );
    assert.deepEqual(await snapshot(), beforeFailure);
    assert.equal(
      (await pool.query('SELECT count(*)::int AS count FROM audit_logs')).rows[0].count,
      auditBefore,
    );
  } finally {
    await pool.query(
      'DROP TRIGGER h08_proof_reject_mode_target ON owner_sponsored_lease_terms; DROP FUNCTION h08_proof_reject_mode_target()',
    );
  }
  await service.commit(user, lease.id, sponsoredDto, randomUUID());
  const sponsored = await snapshot();
  assert.equal(sponsored.lease.commercial_mode, 'owner_sponsored');
  assert.equal(sponsored.lease.contract_rent_amount, 0);
  assert.equal(sponsored.term.term_status, 'active');
  assert.equal(sponsored.term.management_fee_mode, 'waived');
  assert.equal(sponsored.term.management_fee_payer, null);
  assert.ok(sponsored.invoices.every((invoice) => invoice.invoice_status === 'void'));
  assert.ok(
    sponsored.installments.every((installment) => installment.installment_status === 'void'),
  );
  assert.equal(sponsored.settlement.state, 'cancelled');
  // A second rent correction reuses the settlement row, appends a policy, and
  // assigns new monotonic installment and document codes rather than overwriting.
  await service.commit(user, lease.id, rentDto, randomUUID());
  const secondRent = await snapshot();
  assert.equal(secondRent.settlement.id, firstRent.settlement.id);
  assert.notEqual(
    secondRent.settlement.policy_snapshot_id,
    firstRent.settlement.policy_snapshot_id,
  );
  const priorMaximum = Math.max(...firstRent.installments.map((item) => item.sequence_number));
  const activeInstallments = secondRent.installments.filter(
    (item) => item.installment_status !== 'void',
  );
  assert.ok(
    activeInstallments.length > 0 &&
      activeInstallments.every((item) => item.sequence_number > priorMaximum),
  );
  const codes = secondRent.invoices.map((invoice) => invoice.invoice_code);
  assert.equal(new Set(codes).size, codes.length);
  for (const sql of [
    'UPDATE lease_commercial_mode_revisions SET effective_from=effective_from+1 WHERE lease_id=$1',
    'DELETE FROM lease_commercial_mode_revisions WHERE lease_id=$1',
  ])
    await assert.rejects(
      transaction(pool, (client) => client.query(sql, [lease.id])),
      (error) => error.code === '23514',
    );
  const payable = secondRent.invoices.find((invoice) => invoice.invoice_status === 'issued');
  assert.ok(payable);
  await billing.recordManualPayment(
    user,
    {
      property_id: lease.property_id,
      resident_id: lease.resident_id,
      lease_id: lease.id,
      method: 'cash',
      payment_purpose: 'rent',
      amount: 1000,
      allocations: [{ invoice_id: payable.id, amount: 1000 }],
      evidence_file_ids: [],
      note: 'Disposable mode correction proof only',
    },
    randomUUID(),
    {},
  );
  assert.deepEqual((await unchangedFacts()).commitment, originalFacts.commitment);
  await assert.rejects(
    service.commit(user, lease.id, sponsoredDto, randomUUID()),
    (error) => error.getResponse().code === 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
  );
  assert.equal((await snapshot()).revisions.length, secondRent.revisions.length);
  process.stdout.write(
    `Actual correction command (${phase}): sponsored/rent/sponsored/rent, concurrent replay, canonical invoice void/reissue, immutable history, target-write rollback, preserved check-in/onboarding, rent payment and financial guard pass (${initialContext.lease.service_period_state})\n`,
  );
};
