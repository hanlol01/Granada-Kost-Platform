export type LeaseSettlementCheckpointCode = 'checkpoint_1' | 'checkpoint_2' | 'final_settlement';

export type LeaseSettlementCheckpointInput = {
  id: string;
  code: LeaseSettlementCheckpointCode;
  sequence: number;
  mode: 'minimum_monthly_coverage' | 'exact_remaining_balance';
  dueAt: Date;
  cumulativeRequiredAmount: number | null;
  extensionDueAt?: Date | null;
};

export type LeaseSettlementCheckpointStatus =
  | 'pending'
  | 'met_early'
  | 'met'
  | 'overdue_grace'
  | 'extended'
  | 'admin_action_required'
  | 'termination_eligible';

export type LeaseSettlementStage =
  | 'awaiting_activation'
  | 'checkpoint_1'
  | 'checkpoint_1_met'
  | 'checkpoint_2'
  | 'checkpoint_2_met'
  | 'final_settlement'
  | 'overdue_grace'
  | 'extended'
  | 'admin_action_required'
  | 'termination_eligible'
  | 'termination_pending'
  | 'paid';

export type LeaseSettlementCheckpointProjection = LeaseSettlementCheckpointInput & {
  effectiveDueAt: Date;
  requiredAmount: number;
  shortfallAmount: number;
  status: LeaseSettlementCheckpointStatus;
};

type LeaseSettlementProjectionInput = {
  activated: boolean;
  terminationPending: boolean;
  contractRentAmount: number;
  cumulativeVerifiedRentCredit: number;
  authoritativeNow: Date;
  gracePeriodDays: number;
  checkpoints: LeaseSettlementCheckpointInput[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function projectLeaseSettlementV2(input: LeaseSettlementProjectionInput) {
  const contractRentAmount = positiveSafeMoney(input.contractRentAmount, 'contract rent');
  const cumulativeVerifiedRentCredit = nonNegativeSafeMoney(
    input.cumulativeVerifiedRentCredit,
    'verified rent credit',
  );
  if (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0)
    throw new RangeError('grace period must be a non-negative integer');
  const outstandingAmount = Math.max(0, contractRentAmount - cumulativeVerifiedRentCredit);
  const checkpoints = input.checkpoints
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map((checkpoint) =>
      projectCheckpoint(
        checkpoint,
        cumulativeVerifiedRentCredit,
        outstandingAmount,
        input.authoritativeNow,
        input.gracePeriodDays,
      ),
    );
  assertCheckpointSchedule(checkpoints);

  const nowTime = input.authoritativeNow.getTime();
  const currentCheckpoint =
    checkpoints.find(
      (checkpoint) => checkpoint.shortfallAmount > 0 && nowTime > checkpoint.dueAt.getTime(),
    ) ??
    checkpoints.find((checkpoint) => nowTime <= checkpoint.dueAt.getTime()) ??
    checkpoints.at(-1)!;
  const finalCheckpoint = checkpoints.find((checkpoint) => checkpoint.code === 'final_settlement')!;
  const exactFinalPaymentRequired =
    input.activated &&
    outstandingAmount > 0 &&
    (input.terminationPending || nowTime > finalCheckpoint.dueAt.getTime());
  const stage = settlementStage(
    input.activated,
    input.terminationPending,
    outstandingAmount,
    currentCheckpoint,
  );

  return {
    stage,
    outstandingAmount,
    cumulativeVerifiedRentCredit,
    checkpointShortfallAmount: currentCheckpoint.shortfallAmount,
    currentCheckpoint,
    finalCheckpoint,
    checkpoints,
    exactFinalPaymentRequired,
    partialPaymentAllowed:
      outstandingAmount > 0 && !input.terminationPending && !exactFinalPaymentRequired,
    adminActionRequired:
      currentCheckpoint.status === 'admin_action_required' ||
      currentCheckpoint.status === 'termination_eligible',
    terminationEligible: currentCheckpoint.status === 'termination_eligible',
  };
}

function projectCheckpoint(
  checkpoint: LeaseSettlementCheckpointInput,
  cumulativeCredit: number,
  outstandingAmount: number,
  now: Date,
  graceDays: number,
): LeaseSettlementCheckpointProjection {
  const requiredAmount =
    checkpoint.mode === 'exact_remaining_balance'
      ? outstandingAmount
      : positiveSafeMoney(checkpoint.cumulativeRequiredAmount ?? 0, 'checkpoint minimum');
  const shortfallAmount =
    checkpoint.mode === 'exact_remaining_balance'
      ? outstandingAmount
      : Math.max(0, requiredAmount - cumulativeCredit);
  const dueTime = checkpoint.dueAt.getTime();
  const nowTime = now.getTime();
  const extensionDueAt = checkpoint.extensionDueAt ?? null;
  const effectiveDueAt = extensionDueAt ?? checkpoint.dueAt;
  let status: LeaseSettlementCheckpointStatus;
  if (shortfallAmount === 0) status = nowTime <= dueTime ? 'met_early' : 'met';
  else if (nowTime <= dueTime) status = 'pending';
  else if (extensionDueAt && nowTime <= extensionDueAt.getTime()) status = 'extended';
  else if (extensionDueAt && nowTime <= dueTime + 7 * DAY_MS) status = 'admin_action_required';
  else if (extensionDueAt) status = 'termination_eligible';
  else if (nowTime <= dueTime + graceDays * DAY_MS) status = 'overdue_grace';
  else if (nowTime <= dueTime + 7 * DAY_MS) status = 'admin_action_required';
  else status = 'termination_eligible';
  return {
    ...checkpoint,
    effectiveDueAt,
    requiredAmount,
    shortfallAmount,
    status,
  };
}

function settlementStage(
  activated: boolean,
  terminationPending: boolean,
  outstandingAmount: number,
  checkpoint: LeaseSettlementCheckpointProjection,
): LeaseSettlementStage {
  if (!activated) return 'awaiting_activation';
  if (terminationPending) return 'termination_pending';
  if (outstandingAmount === 0) return 'paid';
  if (checkpoint.status === 'overdue_grace') return 'overdue_grace';
  if (checkpoint.status === 'extended') return 'extended';
  if (checkpoint.status === 'admin_action_required') return 'admin_action_required';
  if (checkpoint.status === 'termination_eligible') return 'termination_eligible';
  if (checkpoint.code === 'final_settlement') return 'final_settlement';
  if (checkpoint.code === 'checkpoint_1')
    return checkpoint.status === 'met' || checkpoint.status === 'met_early'
      ? 'checkpoint_1_met'
      : 'checkpoint_1';
  return checkpoint.status === 'met' || checkpoint.status === 'met_early'
    ? 'checkpoint_2_met'
    : 'checkpoint_2';
}

function assertCheckpointSchedule(checkpoints: LeaseSettlementCheckpointProjection[]) {
  if (!checkpoints.length || !checkpoints.some(({ code }) => code === 'final_settlement'))
    throw new RangeError('settlement policy requires a final checkpoint');
  if (new Set(checkpoints.map(({ sequence }) => sequence)).size !== checkpoints.length)
    throw new RangeError('settlement checkpoint sequence must be unique');
}

function positiveSafeMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeSafeMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${label} must be a non-negative safe integer`);
  return value;
}
