require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseDataCorrectionService,
} = require('../../src/modules/lease/lease-data-correction.service.ts');
const propertyId = 'property';
const user = {
  id: 'admin',
  roles: ['admin'],
  permissions: ['lease.manage'],
  propertyIds: [propertyId],
};

// An executable lock/unique-key model isolates the command's orchestration.
// PostgreSQL integration/rollback is an additional gate, not replaced by this test.
function harness() {
  let tail = Promise.resolve();
  const corrections = new Map();
  let applied = 0;
  const repository = {
    async transaction(operation) {
      let release;
      let claimed = false;
      const client = {
        async query(sql, values = []) {
          if (sql.startsWith('SELECT property_id FROM leases')) {
            if (/FOR UPDATE/.test(sql)) {
              const previous = tail;
              tail = new Promise((resolve) => {
                release = resolve;
              });
              await previous;
              claimed = true;
            }
            return { rows: [{ property_id: propertyId }] };
          }
          if (sql.includes('request_fingerprint') && sql.includes('FROM lease_data_corrections')) {
            const row = corrections.get(values[1]);
            // Let unlocked requests overlap so the duplicate insert is observable.
            await new Promise((resolve) => setImmediate(resolve));
            return { rows: row ? [row] : [] };
          }
          if (sql.includes('max(sequence_number)'))
            return { rows: [{ next: corrections.size + 1 }] };
          if (sql.includes('INSERT INTO lease_data_corrections(')) {
            if (corrections.has(values[15]))
              throw Object.assign(new Error('duplicate command'), { code: '23505' });
            const row = {
              id: values[0],
              property_id: values[1],
              lease_id: values[2],
              sequence_number: values[3],
              correction_kind: values[4],
              previous_snapshot: JSON.parse(values[5]),
              corrected_snapshot: JSON.parse(values[6]),
              contract_amount_delta: values[7],
              additional_charge_amount: values[8],
              contract_credit_amount: values[9],
              verified_rent_payment_amount: values[10],
              outstanding_amount_after: values[11],
              overpayment_amount_after: values[12],
              reason: values[13],
              created_by_user_id: values[14],
              request_fingerprint: values[16],
              created_at: new Date(),
            };
            corrections.set(values[15], row);
            return { rows: [row] };
          }
          return { rows: [], rowCount: 0 };
        },
      };
      try {
        return await operation(client);
      } finally {
        if (claimed) release();
      }
    },
  };
  const service = new LeaseDataCorrectionService(repository, {}, {});
  const previous = {
    startDate: '2027-01-01',
    endDate: '2028-01-01',
    termMonths: 12,
    checkedInDate: null,
    pricingTier: 'long_stay',
    referenceMonthlyPrice: 1800000,
    agreedMonthlyPrice: 1800000,
    contractRentAmount: 21600000,
    pricingSource: 'standard',
    pricingAgreementReason: null,
  };
  // The test owns only concurrency/append orchestration, not preview math.
  service.buildPreview = async () => ({
    leaseId: 'lease',
    propertyId,
    commercialMode: 'rent',
    previous,
    corrected: { ...previous, pricingAgreementReason: 'Recorded reason' },
    impact: {
      contractDelta: 0,
      additionalCharge: 0,
      contractCredit: 0,
      verifiedRentPayment: 0,
      outstandingAfter: 21600000,
      overpaymentAfter: 0,
    },
    correctionKind: 'combined',
  });
  service.applyEffectiveLease = async () => {
    applied++;
  };
  return { service, corrections, applied: () => applied };
}

test('simultaneous identical correction commands serialize and replay once', async () => {
  const h = harness();
  const dto = { reason: 'Correct a recording error' };
  const results = await Promise.all([
    h.service.commit(user, 'lease', dto, 'same-command'),
    h.service.commit(user, 'lease', dto, 'same-command'),
  ]);
  assert.equal(h.corrections.size, 1);
  assert.equal(h.applied(), 1);
  assert.equal(results[0].data.correction.id, results[1].data.correction.id);
  assert.deepEqual(results.map((item) => item.idempotent).sort(), [false, true]);
});
test('a different request cannot reuse the same correction key', async () => {
  const h = harness();
  await h.service.commit(user, 'lease', { reason: 'First correction' }, 'same-command');
  await assert.rejects(
    h.service.commit(user, 'lease', { reason: 'Different correction' }, 'same-command'),
    (error) => error.getResponse().code === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.equal(h.applied(), 1);
});
test('a missing idempotency key or unauthorized actor cannot append a correction', async () => {
  const h = harness();
  await assert.rejects(
    h.service.commit(user, 'lease', { reason: 'Correction' }, undefined),
    (error) => error.getResponse().code === 'IDEMPOTENCY_KEY_REQUIRED',
  );
  await assert.rejects(
    h.service.commit(
      { ...user, roles: ['property_owner'] },
      'lease',
      { reason: 'Correction' },
      'key',
    ),
    (error) => error.getStatus() === 403,
  );
  assert.equal(h.corrections.size, 0);
  assert.equal(h.applied(), 0);
});
