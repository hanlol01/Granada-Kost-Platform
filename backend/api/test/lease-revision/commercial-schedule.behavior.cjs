require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ContractScheduleIssuanceService,
} = require('../../src/modules/billing/services/contract-schedule-issuance.service.ts');

function fixture(overrides = {}) {
  const calls = [];
  const input = {
    propertyId: 'property',
    leaseId: 'lease',
    startDate: '2090-01-01',
    termMonths: 12,
    paymentPlanType: 'annual_full',
    contractRentAmount: 21600000,
    billingCycle: 'yearly',
    snapshotMonthlyPrice: 1800000,
    snapshotRoomNumber: 'RK-01-01',
    snapshotBuildingCode: 'RK-01',
    snapshotCategoryName: 'Rumah Kost',
    initialRentCredit: 0,
    actorUserId: 'actor',
    ...overrides,
  };
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [], rowCount: 1 };
    },
  };
  return { input, client, calls, service: new ContractScheduleIssuanceService() };
}
test('ordinary issuance still creates the original lifecycle and schedule', async () => {
  const f = fixture();
  await f.service.issueScheduleInTransaction(f.client, f.input);
  assert.ok(f.calls.some((call) => call.sql.includes('INSERT INTO lease_activation_lifecycles')));
  assert.equal(
    f.calls.find((call) => call.sql.includes('INSERT INTO lease_installments')).values[3],
    1,
  );
});
test('correction schedule preserves old numbering and does not invent a second activation', async () => {
  const f = fixture({
    correction: {
      correctionId: 'correction',
      sequenceOffset: 9,
      previousSettlementId: null,
      activateFrom: null,
    },
  });
  await f.service.issueScheduleInTransaction(f.client, f.input);
  assert.equal(
    f.calls.find((call) => call.sql.includes('INSERT INTO lease_installments')).values[3],
    10,
  );
  assert.equal(
    f.calls.find((call) => call.sql.includes('INSERT INTO invoices')).values[3],
    'RENT-LEASE-10',
  );
  assert.ok(!f.calls.some((call) => call.sql.includes('INSERT INTO lease_activation_lifecycles')));
});
test('a cancelled current settlement is replaced conditionally without deleting its old policy', async () => {
  const f = fixture({
    correction: {
      correctionId: 'correction',
      sequenceOffset: 9,
      previousSettlementId: 'settlement',
      activateFrom: null,
    },
  });
  await f.service.issueScheduleInTransaction(f.client, f.input);
  const update = f.calls.find((call) => call.sql.includes('UPDATE lease_contract_settlements'));
  assert.ok(update);
  assert.match(update.sql, /state='cancelled'/);
  assert.match(update.sql, /lease_commercial_mode_revisions/);
  assert.ok(
    !f.calls.some((call) => /DELETE|UPDATE lease_settlement_policy_snapshots/.test(call.sql)),
  );
});
test('a checked-in correction keeps its recorded activation time instead of activating now', async () => {
  const f = fixture({
    correction: {
      correctionId: 'correction',
      sequenceOffset: 0,
      previousSettlementId: null,
      activateFrom: '2089-12-31T01:00:00.000Z',
    },
  });
  await f.service.issueScheduleInTransaction(f.client, f.input);
  const update = f.calls.find((call) => call.sql.includes("SET state='open'"));
  assert.ok(update);
  assert.ok(update.values.includes('2089-12-31T01:00:00.000Z'));
  assert.match(update.sql, /final_settlement/);
});
test('a correction cannot carry fabricated initial credit or an unsafe sequence offset', async () => {
  for (const changes of [{ initialRentCredit: 1 }, { correction: { sequenceOffset: -1 } }]) {
    const f = fixture({
      correction: {
        correctionId: 'correction',
        sequenceOffset: 0,
        previousSettlementId: null,
        activateFrom: null,
      },
      ...changes,
    });
    await assert.rejects(f.service.issueScheduleInTransaction(f.client, f.input));
    assert.equal(f.calls.length, 0);
  }
});
