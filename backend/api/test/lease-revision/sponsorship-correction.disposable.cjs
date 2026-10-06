// Invoked only inside the guarded, freshly created clone owned by the room proof.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const {
  LeaseDataCorrectionService,
} = require('../../src/modules/lease/lease-data-correction.service.ts');
const {
  LeaseRevisionContextService,
} = require('../../src/modules/lease/lease-revision-context.service.ts');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');

async function bounded(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports.runSponsorshipCorrectionProof = async function (
  pool,
  actorId,
  transaction,
  fingerprints,
) {
  const repository = {
    query: (sql, values) => pool.query(sql, values),
    transaction: (operation) => transaction(pool, operation),
  };
  const contexts = new LeaseRevisionContextService(repository);
  const service = new LeaseDataCorrectionService(repository, {}, {}, contexts);
  const candidates = (
    await pool.query(`SELECT lease.id,lease.property_id,lease.onboarding_commitment_id,term.management_fee_mode
    FROM leases lease JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=lease.property_id
    WHERE lease.commercial_mode='owner_sponsored' AND lease.lease_status IN ('awaiting_activation','active')
      AND lease.end_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
      AND term.term_status='active' AND term.management_fee_mode IN ('charged','waived')
    ORDER BY lease.created_at DESC LIMIT 40`)
  ).rows;
  let lease, user;
  for (const candidate of candidates) {
    const proposedUser = {
      id: actorId,
      roles: ['admin'],
      permissions: ['lease.manage'],
      propertyIds: [candidate.property_id],
    };
    const context = await contexts.get(proposedUser, candidate.id);
    if (context.data.policies.sponsorship_policy_change.allowed) {
      lease = candidate;
      user = proposedUser;
      break;
    }
  }
  assert.ok(
    lease,
    'A real sponsored local lease without financial history is required; never alter source data to manufacture one',
  );
  const financialTables = [
    'payments',
    'invoices',
    'payment_receipts',
    'property_owner_realizations',
  ];
  const beforeFinancial = await fingerprints(pool, financialTables);
  const commitment = (
    await pool.query(
      'SELECT to_jsonb(commitment) AS data FROM onboarding_commitments commitment WHERE id=$1',
      [lease.onboarding_commitment_id],
    )
  ).rows;
  if (lease.management_fee_mode === 'waived') {
    await service.commit(
      user,
      lease.id,
      {
        management_fee_mode: 'charged',
        management_fee_payer: 'owner',
        reason: 'Disposable proof: review a fee instruction originally recorded as waived',
      },
      randomUUID(),
    );
  }
  const dto = {
    management_fee_mode: 'waived',
    reason: 'Disposable proof: original Owner instruction was recorded incorrectly',
  };
  const preview = await service.preview(user, lease.id, dto);
  assert.equal(preview.data.corrected.owner_sponsorship.management_fee_mode, 'waived');
  assert.equal(preview.data.corrected.contract_rent_amount, 0);
  const key = randomUUID();
  const results = await Promise.all([
    service.commit(user, lease.id, dto, key),
    service.commit(user, lease.id, dto, key),
  ]);
  assert.equal(results[0].data.correction.id, results[1].data.correction.id);
  assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
  const correctionId = results[0].data.correction.id;
  const revision = (
    await pool.query('SELECT * FROM owner_sponsored_policy_revisions WHERE correction_id=$1', [
      correctionId,
    ])
  ).rows;
  assert.equal(revision.length, 1);
  assert.equal(revision[0].previous_policy.managementFeeMode, 'charged');
  assert.equal(revision[0].corrected_policy.managementFeeMode, 'waived');
  const current = (
    await pool.query(
      'SELECT management_fee_mode,management_fee_payer,current_projected_management_fee_amount FROM owner_sponsored_management_fee_progress WHERE lease_id=$1',
      [lease.id],
    )
  ).rows[0];
  assert.equal(current.management_fee_mode, 'waived');
  assert.equal(current.management_fee_payer, null);
  assert.equal(Number(current.current_projected_management_fee_amount), 0);
  assert.deepEqual(
    (
      await pool.query(
        'SELECT to_jsonb(commitment) AS data FROM onboarding_commitments commitment WHERE id=$1',
        [lease.onboarding_commitment_id],
      )
    ).rows,
    commitment,
  );
  assert.deepEqual(await fingerprints(pool, financialTables), beforeFinancial);

  for (const sql of [
    'UPDATE owner_sponsored_policy_revisions SET effective_from=effective_from+1 WHERE correction_id=$1',
    'DELETE FROM owner_sponsored_policy_revisions WHERE correction_id=$1',
  ])
    await assert.rejects(
      transaction(pool, (client) => client.query(sql, [correctionId])),
      (error) => error.code === '23514',
    );

  // The FK alone is insufficient: an unrelated amendment must not authorize a policy version.
  await assert.rejects(
    transaction(pool, async (client) => {
      const wrong = randomUUID();
      const hash = (value) => createHash('sha256').update(value).digest('hex');
      await client.query(
        `INSERT INTO lease_data_corrections(id,property_id,lease_id,sequence_number,correction_kind,
      previous_snapshot,corrected_snapshot,reason,created_by_user_id,command_fingerprint,request_fingerprint)
      SELECT $1,$2,$3,COALESCE(max(sequence_number),0)+1,'combined','{}','{}','Disposable invalid policy proof',$4,$5,$6
      FROM lease_data_corrections WHERE lease_id=$3`,
        [wrong, lease.property_id, lease.id, actorId, hash(randomUUID()), hash(randomUUID())],
      );
      await client.query(
        `INSERT INTO owner_sponsored_policy_revisions(property_id,lease_id,term_id,correction_id,
      effective_from,previous_policy,corrected_policy,created_by_user_id)
      SELECT property_id,lease_id,term_id,$2,effective_from,previous_policy,corrected_policy,created_by_user_id
      FROM owner_sponsored_policy_revisions WHERE correction_id=$1`,
        [correctionId, wrong],
      );
    }),
    (error) => error.code === '23514',
  );

  const chargedDto = {
    management_fee_mode: 'charged',
    management_fee_payer: 'resident',
    reason: 'Disposable proof: review the originally charged policy and payer',
  };
  const chargedPreview = await service.preview(user, lease.id, chargedDto);
  assert.ok(chargedPreview.data.corrected.owner_sponsorship.projected_management_fee_amount > 0);
  await service.commit(user, lease.id, chargedDto, randomUUID());
  const charged = (
    await pool.query(
      'SELECT current_projected_management_fee_amount,management_fee_payer FROM owner_sponsored_management_fee_progress WHERE lease_id=$1',
      [lease.id],
    )
  ).rows[0];
  assert.equal(
    Number(charged.current_projected_management_fee_amount),
    chargedPreview.data.corrected.owner_sponsorship.projected_management_fee_amount,
  );
  assert.equal(charged.management_fee_payer, 'resident');

  // Fail after amendment/version append, during current term application.
  const beforeFailure = await fingerprints(pool);
  const countBefore = (
    await pool.query(
      'SELECT count(*)::int AS count FROM owner_sponsored_policy_revisions WHERE lease_id=$1',
      [lease.id],
    )
  ).rows[0].count;
  await pool.query(`CREATE FUNCTION h08_proof_reject_policy() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.management_fee_mode='waived' THEN RAISE EXCEPTION 'H08_POLICY_PROOF_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER h08_proof_reject_policy BEFORE UPDATE ON owner_sponsored_lease_terms FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_policy()`);
  try {
    await assert.rejects(
      service.commit(user, lease.id, dto, randomUUID()),
      /H08_POLICY_PROOF_FAILURE/,
    );
    assert.deepEqual(await fingerprints(pool), beforeFailure);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM owner_sponsored_policy_revisions WHERE lease_id=$1',
          [lease.id],
        )
      ).rows[0].count,
      countBefore,
    );
  } finally {
    await pool.query(
      'DROP TRIGGER h08_proof_reject_policy ON owner_sponsored_lease_terms; DROP FUNCTION h08_proof_reject_policy()',
    );
  }
  assert.deepEqual(await fingerprints(pool, financialTables), beforeFinancial);
  // A real W06 payment holds the shared aggregate lock first. The correction
  // waits in PostgreSQL and must re-read its newly committed financial history.
  let signalPaymentLocked, releasePayment, signalCorrectionPid;
  const paymentLocked = new Promise((resolve) => {
    signalPaymentLocked = resolve;
  });
  const paymentGate = new Promise((resolve) => {
    releasePayment = resolve;
  });
  const correctionPid = new Promise((resolve) => {
    signalCorrectionPid = resolve;
  });
  const paymentDatabase = {
    client: pool,
    transaction: (operation) =>
      transaction(pool, (client) => {
        const wrapped = Object.create(client);
        wrapped.query = async (sql, values) => {
          const result = await client.query(sql, values);
          if (/SELECT id FROM properties WHERE id=\$1 FOR UPDATE/.test(sql)) {
            signalPaymentLocked(client.processID);
            await paymentGate;
          }
          return result;
        };
        return operation(wrapped);
      }),
  };
  const concurrentRepository = {
    ...repository,
    transaction: (operation) =>
      transaction(pool, (client) => {
        signalCorrectionPid(client.processID);
        return operation(client);
      }),
  };
  const concurrentService = new LeaseDataCorrectionService(concurrentRepository, {}, {}, contexts);
  const billing = new W06BillingService(
    paymentDatabase,
    {
      assertCanReadProperty: async (access, propertyId) => {
        assert.ok(access.propertyIds.includes(propertyId));
      },
    },
    new AuditRepository(paymentDatabase),
  );
  const residentId = (await pool.query('SELECT resident_id FROM leases WHERE id=$1', [lease.id]))
    .rows[0].resident_id;
  const countsBeforeRace = (
    await pool.query(
      `SELECT
    (SELECT count(*)::int FROM lease_data_corrections WHERE lease_id=$1) AS amendments,
    (SELECT count(*)::int FROM owner_sponsored_policy_revisions WHERE lease_id=$1) AS policies`,
      [lease.id],
    )
  ).rows[0];
  const paymentOutcome = billing
    .recordManualPayment(
      user,
      {
        property_id: lease.property_id,
        resident_id: residentId,
        lease_id: lease.id,
        method: 'cash',
        payment_purpose: 'management_fee',
        amount: 1000,
        allocations: [],
        evidence_file_ids: [],
        note: 'Disposable concurrency proof only',
      },
      randomUUID(),
      {},
    )
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  let correctionOutcome;
  try {
    const paymentPid = await bounded(
      Promise.race([
        paymentLocked,
        paymentOutcome.then((outcome) => {
          throw outcome.error ?? new Error('Payment did not acquire its aggregate lock');
        }),
      ]),
      'Payment aggregate lock was not reached',
    );
    correctionOutcome = concurrentService.commit(user, lease.id, dto, randomUUID()).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    const waitingPid = await bounded(correctionPid, 'Correction transaction did not start');
    let blocked = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      blocked = (
        await pool.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked', [
          waitingPid,
          paymentPid,
        ])
      ).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, 'The actual correction must wait on the W06 payment transaction');
  } finally {
    releasePayment();
  }
  const paymentResult = await bounded(paymentOutcome, 'W06 payment did not finish');
  assert.ifError(paymentResult.error);
  const rejectedCorrection = await bounded(
    correctionOutcome,
    'Concurrent correction did not finish',
  );
  assert.ok(rejectedCorrection.error, 'A newly committed payment must prevent fee-policy mutation');
  assert.equal(
    rejectedCorrection.error.getResponse().code,
    'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
  );
  assert.match(rejectedCorrection.error.getResponse().message, /pembayaran|keuangan/i);
  assert.deepEqual(
    (
      await pool.query(
        `SELECT
    (SELECT count(*)::int FROM lease_data_corrections WHERE lease_id=$1) AS amendments,
    (SELECT count(*)::int FROM owner_sponsored_policy_revisions WHERE lease_id=$1) AS policies`,
        [lease.id],
      )
    ).rows[0],
    countsBeforeRace,
  );
  const paymentId = paymentResult.value.data.payment_id;
  const receiptId = paymentResult.value.data.receipt_id;
  assert.ok(receiptId, 'The actual verified payment must issue its immutable receipt');
  const paid = (
    await pool.query(
      'SELECT management_fee_mode,verified_paid_amount FROM owner_sponsored_management_fee_progress WHERE lease_id=$1',
      [lease.id],
    )
  ).rows[0];
  assert.equal(paid.management_fee_mode, 'charged');
  assert.equal(Number(paid.verified_paid_amount), 1000);
  // Existing financial records are untouched. Only the intentional clone-only
  // payment and receipt were appended through their canonical W06 authority.
  for (const table of financialTables) {
    const excluded =
      table === 'payments' ? paymentId : table === 'payment_receipts' ? receiptId : null;
    const content = (
      await pool.query(
        `SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb)::text AS content
      FROM ${table} row WHERE ($1::uuid IS NULL OR row.id<>$1::uuid)`,
        [excluded],
      )
    ).rows[0].content;
    assert.equal(createHash('sha256').update(content).digest('hex'), beforeFinancial[table]);
  }
  process.stdout.write(
    'Actual sponsored correction API-service transaction, concurrent idempotent retry, immutable policy/amendment binding, authoritative fee projection, whole-command rollback and actual W06 payment race pass\n',
  );
};
