import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLeaseSettlementPolicySchedule,
  buildLeaseSettlementPolicyScheduleV3,
} from '../../src/modules/billing/helpers/lease-settlement-policy.helper';

void test('one-month v3 lease settles at activation without a duplicate checkpoint', () => {
  const policy = buildLeaseSettlementPolicyScheduleV3({
    leaseStartDate: '2026-08-28',
    termMonths: 1,
    monthlyRentAmount: 1_950_000,
  });

  assert.equal(policy.policyVersion, 'lease_settlement_v3');
  assert.equal(policy.initialMonthMinimumAmount, 1_950_000);
  assert.equal(policy.finalSettlementOffsetMonths, 0);
  assert.deepEqual(policy.checkpoints, [
    {
      code: 'final_settlement',
      sequence: 1,
      dueDate: '2026-08-28',
      settlementMode: 'exact_remaining_balance',
      minimumRequiredAmount: null,
    },
  ]);
});

void test('two-month v3 lease settles after one month without an intermediate checkpoint', () => {
  const policy = buildLeaseSettlementPolicyScheduleV3({
    leaseStartDate: '2027-01-31',
    termMonths: 2,
    monthlyRentAmount: 1_900_000,
  });

  assert.equal(policy.finalSettlementOffsetMonths, 1);
  assert.deepEqual(policy.checkpoints, [
    {
      code: 'final_settlement',
      sequence: 1,
      dueDate: '2027-02-28',
      settlementMode: 'exact_remaining_balance',
      minimumRequiredAmount: null,
    },
  ]);
});

void test('v3 applies the three-checkpoint policy consistently from four through 120 months', () => {
  for (const termMonths of [4, 11, 12, 120]) {
    const policy = buildLeaseSettlementPolicyScheduleV3({
      leaseStartDate: '2026-08-28',
      termMonths,
      monthlyRentAmount: 1_750_000,
    });

    assert.equal(policy.policyVersion, 'lease_settlement_v3');
    assert.equal(policy.finalSettlementOffsetMonths, 3);
    assert.deepEqual(
      policy.checkpoints.map(({ code, dueDate, minimumRequiredAmount }) => ({
        code,
        dueDate,
        minimumRequiredAmount,
      })),
      [
        { code: 'checkpoint_1', dueDate: '2026-09-28', minimumRequiredAmount: 3_500_000 },
        { code: 'checkpoint_2', dueDate: '2026-10-28', minimumRequiredAmount: 5_250_000 },
        { code: 'final_settlement', dueDate: '2026-11-28', minimumRequiredAmount: null },
      ],
    );
  }
});

void test('v3 rejects terms outside 1 through 120 months', () => {
  for (const termMonths of [0, 121, 1.5]) {
    assert.throws(
      () =>
        buildLeaseSettlementPolicyScheduleV3({
          leaseStartDate: '2026-08-28',
          termMonths,
          monthlyRentAmount: 1_800_000,
        }),
      /1 through 120 months/,
    );
  }
});

void test('three-month lease locks its final settlement at activation plus two calendar months', () => {
  const policy = buildLeaseSettlementPolicySchedule({
    leaseStartDate: '2026-08-28',
    termMonths: 3,
    monthlyRentAmount: 1_800_000,
  });

  assert.equal(policy.initialMonthMinimumAmount, 1_800_000);
  assert.equal(policy.finalSettlementOffsetMonths, 2);
  assert.deepEqual(policy.checkpoints, [
    {
      code: 'checkpoint_1',
      sequence: 1,
      dueDate: '2026-09-28',
      settlementMode: 'minimum_monthly_coverage',
      minimumRequiredAmount: 3_600_000,
    },
    {
      code: 'final_settlement',
      sequence: 2,
      dueDate: '2026-10-28',
      settlementMode: 'exact_remaining_balance',
      minimumRequiredAmount: null,
    },
  ]);
});

void test('six- and twelve-month leases require two monthly-coverage checkpoints before final settlement', () => {
  for (const termMonths of [6, 12]) {
    const policy = buildLeaseSettlementPolicySchedule({
      leaseStartDate: '2026-08-28',
      termMonths,
      monthlyRentAmount: 1_800_000,
    });
    assert.equal(policy.finalSettlementOffsetMonths, 3);
    assert.deepEqual(
      policy.checkpoints.map(({ code, dueDate, minimumRequiredAmount }) => ({
        code,
        dueDate,
        minimumRequiredAmount,
      })),
      [
        { code: 'checkpoint_1', dueDate: '2026-09-28', minimumRequiredAmount: 3_600_000 },
        { code: 'checkpoint_2', dueDate: '2026-10-28', minimumRequiredAmount: 5_400_000 },
        { code: 'final_settlement', dueDate: '2026-11-28', minimumRequiredAmount: null },
      ],
    );
  }
});

void test('month-end anchor clamps temporarily and returns to the original anchor', () => {
  const policy = buildLeaseSettlementPolicySchedule({
    leaseStartDate: '2027-01-31',
    termMonths: 6,
    monthlyRentAmount: 1_800_000,
  });

  assert.equal(policy.checkpointAnchorDay, 31);
  assert.deepEqual(
    policy.checkpoints.map((checkpoint) => checkpoint.dueDate),
    ['2027-02-28', '2027-03-31', '2027-04-30'],
  );
});

void test('unsupported durations and zero monthly rent are rejected', () => {
  assert.throws(
    () =>
      buildLeaseSettlementPolicySchedule({
        leaseStartDate: '2026-08-28',
        termMonths: 4,
        monthlyRentAmount: 1_800_000,
      }),
    /only 3, 6, or 12 months/,
  );
  assert.throws(
    () =>
      buildLeaseSettlementPolicySchedule({
        leaseStartDate: '2026-08-28',
        termMonths: 3,
        monthlyRentAmount: 0,
      }),
    /positive safe integer/,
  );
});
