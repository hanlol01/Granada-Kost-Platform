require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LeaseServicePeriodService,
} = require('../../src/modules/lease/lease-service-period.service.ts');

function fixture(rows, amount = '12950000', plan = 'annual_full') {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (/FROM leases WHERE id=\$1/.test(sql))
        return {
          rows: [
            {
              id: 'lease',
              property_id: 'property',
              room_id: 'room',
              resident_id: 'resident',
              start_date: '2026-08-01',
              end_date: '2027-03-01',
              planned_start_date: '2026-08-01',
              service_period_state: 'pending_check_in',
              lease_status: 'active',
              occupancy_id: null,
              term_months: plan === 'annual_full' ? 7 : 8,
              payment_plan_type: plan,
              snapshot_monthly_price: '1850000',
              contract_rent_amount: amount,
              commercial_mode: 'rent',
            },
          ],
        };
      if (/WITH chosen/.test(sql))
        return {
          rows: [
            {
              checked_in_at: new Date('2026-10-01T00:00:00+07:00'),
              business_date: '2026-10-01',
              today: '2026-10-05',
              valid: true,
            },
          ],
        };
      if (/AS room_conflict/.test(sql))
        return {
          rows: [
            {
              room_conflict: false,
              financial_lock: false,
              checkout: false,
              deadline_override: false,
            },
          ],
        };
      if (/FROM lease_installments installment/.test(sql)) return { rows };
      if (/FROM lease_contract_settlements settlement/.test(sql)) return { rows: [] };
      if (/FROM lease_installment_effective_periods/.test(sql)) return { rows };
      if (/INSERT INTO lease_service_period_versions/.test(sql))
        return { rows: [{ id: 'version', sequence_number: 1 }], rowCount: 1 };
      if (/INSERT INTO lease_service_period_installments|UPDATE leases/.test(sql))
        return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new LeaseServicePeriodService({ client }, {});
  return {
    calls,
    run: () =>
      service.finalizeLocked(client, {
        leaseId: 'lease',
        propertyId: 'property',
        checkedInAt: new Date('2026-10-01T00:00:00+07:00'),
        actorId: 'actor',
        commandFingerprint: 'command',
      }),
  };
}
const base = {
  id: 'original',
  invoice_id: 'original-invoice',
  sequence_number: 1,
  coverage_start_date: '2026-08-01',
  coverage_end_date: '2027-07-31',
  due_date: '2026-08-15',
  scheduled_amount: '11100000',
  correction_charge: false,
};
const charge = {
  ...base,
  id: 'adjustment',
  invoice_id: 'adjustment-invoice',
  sequence_number: 2,
  scheduled_amount: '1850000',
  correction_charge: true,
};

for (const plan of ['monthly_installments', 'two_month_installments'])
  test(`${plan} keeps journal-adjusted amounts and rebases coverage to physical check-in`, async () => {
    const months = plan === 'monthly_installments' ? 1 : 2;
    const f = fixture(
      [
        {
          ...base,
          coverage_end_date: months === 1 ? '2026-08-31' : '2026-09-30',
          correction_credit: true,
        },
        {
          ...charge,
          coverage_start_date: '2027-02-01',
          coverage_end_date: '2027-03-31',
          scheduled_amount: '3700000',
        },
      ],
      '14800000',
      plan,
    );
    const result = await f.run();
    assert.equal(result.endDate, '2027-06-01');
    const periods = f.calls.filter((call) =>
      call.sql.includes('INSERT INTO lease_service_period_installments'),
    );
    assert.deepEqual(
      periods.map((call) => call.values.slice(1)),
      [
        ['original', '2026-10-01', months === 1 ? '2026-10-31' : '2026-11-30', '2026-10-15'],
        ['adjustment', '2027-04-01', '2027-05-31', '2027-04-15'],
      ],
    );
    assert.ok(
      !f.calls.some((call) =>
        /^\s*(UPDATE|DELETE)\s+(invoices|lease_installments|payments)/i.test(call.sql),
      ),
    );
  });

test('annual check-in rebases original and journal-authorized correction invoices without changing money', async () => {
  const f = fixture([base, charge]);
  const result = await f.run();
  assert.equal(result.startDate, '2026-10-01');
  assert.equal(result.endDate, '2027-05-01');
  const periods = f.calls.filter((call) =>
    call.sql.includes('INSERT INTO lease_service_period_installments'),
  );
  assert.deepEqual(
    periods.map((call) => call.values.slice(1)),
    [
      ['original', '2026-10-01', '2027-04-30', '2026-10-15'],
      ['adjustment', '2026-10-01', '2027-04-30', '2026-10-15'],
    ],
  );
  assert.ok(
    !f.calls.some((call) =>
      /^\s*(UPDATE|DELETE)\s+(invoices|lease_installments|payments)/i.test(call.sql),
    ),
  );
});
for (const [label, rows] of [
  ['unrecorded duplicate invoices', [base, { ...charge, correction_charge: false }]],
  ['wrong total', [base, { ...charge, scheduled_amount: '1850001' }]],
  ['unsafe amounts', [{ ...base, scheduled_amount: '9007199254740992' }, charge]],
])
  test(`check-in rejects ${label} before period writes`, async () => {
    const f = fixture(rows);
    await assert.rejects(
      f.run,
      (error) =>
        error.getResponse?.().code === 'LEASE_SERVICE_PERIOD_BILLING_RECONCILIATION_REQUIRED',
    );
    assert.ok(!f.calls.some((call) => /^\s*(INSERT|UPDATE|DELETE)/i.test(call.sql)));
  });

test('a correction cannot hide two routine invoices in the same rebased installment period', async () => {
  const f = fixture([
    { ...base, scheduled_amount: '9250000', coverage_end_date: '2026-08-31' },
    { ...base, id: 'duplicate', invoice_id: 'duplicate-invoice', sequence_number: 2,
      coverage_start_date: '2026-08-15', coverage_end_date: '2026-08-31', scheduled_amount: '1850000' },
    { ...charge, sequence_number: 3, coverage_start_date: '2027-02-01', coverage_end_date: '2027-03-31', scheduled_amount: '3700000' },
  ], '14800000', 'monthly_installments');
  await assert.rejects(f.run, error => error.getResponse?.().code === 'LEASE_SERVICE_PERIOD_BILLING_RECONCILIATION_REQUIRED');
  assert.ok(!f.calls.some(call => /^\s*(INSERT|UPDATE|DELETE)/i.test(call.sql)));
});
