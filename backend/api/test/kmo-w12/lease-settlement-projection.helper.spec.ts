import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLeaseSettlementV2 } from '../../src/modules/billing/helpers/lease-settlement-projection.helper';

const checkpoint = (
  code: 'checkpoint_1' | 'checkpoint_2' | 'final_settlement',
  sequence: number,
  dueAt: string,
  cumulativeRequiredAmount: number | null,
) => ({
  id: `${code}-${sequence}`,
  code,
  sequence,
  mode:
    code === 'final_settlement'
      ? ('exact_remaining_balance' as const)
      : ('minimum_monthly_coverage' as const),
  dueAt: new Date(dueAt),
  cumulativeRequiredAmount,
});

const sixMonthCheckpoints = [
  checkpoint('checkpoint_1', 1, '2026-09-28T16:59:59.999Z', 3_600_000),
  checkpoint('checkpoint_2', 2, '2026-10-28T16:59:59.999Z', 5_400_000),
  checkpoint('final_settlement', 3, '2026-11-28T16:59:59.999Z', null),
];

void test('regular checkpoint uses cumulative verified credit and exposes only its shortfall', () => {
  const projection = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 10_800_000,
    cumulativeVerifiedRentCredit: 2_800_000,
    authoritativeNow: new Date('2026-09-29T00:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: sixMonthCheckpoints,
  });
  assert.equal(projection.stage, 'overdue_grace');
  assert.equal(projection.currentCheckpoint.code, 'checkpoint_1');
  assert.equal(projection.checkpointShortfallAmount, 800_000);
  assert.equal(projection.partialPaymentAllowed, true);
  assert.equal(projection.exactFinalPaymentRequired, false);
});

void test('met checkpoint advances without losing the cumulative credit authority', () => {
  const projection = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 10_800_000,
    cumulativeVerifiedRentCredit: 3_600_000,
    authoritativeNow: new Date('2026-09-29T00:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: sixMonthCheckpoints,
  });
  assert.equal(projection.stage, 'checkpoint_2');
  assert.equal(projection.currentCheckpoint.code, 'checkpoint_2');
  assert.equal(projection.currentCheckpoint.shortfallAmount, 1_800_000);
});

void test('final checkpoint rejects instalment semantics immediately after its due time', () => {
  const projection = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 10_800_000,
    cumulativeVerifiedRentCredit: 5_400_000,
    authoritativeNow: new Date('2026-11-28T17:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: sixMonthCheckpoints,
  });
  assert.equal(projection.stage, 'overdue_grace');
  assert.equal(projection.currentCheckpoint.code, 'final_settlement');
  assert.equal(projection.currentCheckpoint.shortfallAmount, 5_400_000);
  assert.equal(projection.exactFinalPaymentRequired, true);
  assert.equal(projection.partialPaymentAllowed, false);
});

void test('after grace and seven days the workflow escalates without ending occupancy', () => {
  const afterGrace = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 5_400_000,
    cumulativeVerifiedRentCredit: 1_800_000,
    authoritativeNow: new Date('2026-10-02T17:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: [
      checkpoint('checkpoint_1', 1, '2026-09-28T16:59:59.999Z', 3_600_000),
      checkpoint('final_settlement', 2, '2026-10-28T16:59:59.999Z', null),
    ],
  });
  assert.equal(afterGrace.stage, 'admin_action_required');
  assert.equal(afterGrace.adminActionRequired, true);

  const afterSevenDays = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 5_400_000,
    cumulativeVerifiedRentCredit: 1_800_000,
    authoritativeNow: new Date('2026-10-06T17:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: [
      checkpoint('checkpoint_1', 1, '2026-09-28T16:59:59.999Z', 3_600_000),
      checkpoint('final_settlement', 2, '2026-10-28T16:59:59.999Z', null),
    ],
  });
  assert.equal(afterSevenDays.stage, 'termination_eligible');
  assert.equal(afterSevenDays.terminationEligible, true);
});
