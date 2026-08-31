export const SUPPORTED_LEASE_SETTLEMENT_TERMS = [3, 6, 12] as const;

export type SupportedLeaseSettlementTerm = (typeof SUPPORTED_LEASE_SETTLEMENT_TERMS)[number];

export type LeaseSettlementCheckpointSchedule = {
  code: 'checkpoint_1' | 'checkpoint_2' | 'final_settlement';
  sequence: 1 | 2 | 3;
  dueDate: string;
  settlementMode: 'minimum_monthly_coverage' | 'exact_remaining_balance';
  minimumRequiredAmount: number | null;
};

export type LeaseSettlementPolicySchedule = {
  policyVersion: 'lease_settlement_v2';
  checkpointAnchorDay: number;
  initialMonthMinimumAmount: number;
  finalSettlementOffsetMonths: 2 | 3;
  checkpoints: LeaseSettlementCheckpointSchedule[];
};

type LeaseSettlementPolicyInput = {
  leaseStartDate: string;
  termMonths: number;
  monthlyRentAmount: number;
};

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Calculates the v2 settlement policy from the lease's immutable commercial
 * start date and snapshot. It intentionally returns Jakarta business dates; the
 * command layer owns the authoritative end-of-day timestamp conversion.
 */
export function buildLeaseSettlementPolicySchedule(
  input: LeaseSettlementPolicyInput,
): LeaseSettlementPolicySchedule {
  const leaseStartDate = parseBusinessDate(input.leaseStartDate);
  const termMonths = assertSupportedTerm(input.termMonths);
  const monthlyRentAmount = assertPositiveMoney(input.monthlyRentAmount, 'monthly rent');
  const checkpointOneMinimum = assertPositiveMoney(
    monthlyRentAmount * 2,
    'checkpoint one cumulative minimum',
  );
  const checkpointTwoMinimum = assertPositiveMoney(
    monthlyRentAmount * 3,
    'checkpoint two cumulative minimum',
  );
  const anchorDay = leaseStartDate.getUTCDate();
  const finalSettlementOffsetMonths: 2 | 3 = termMonths === 3 ? 2 : 3;
  const dueDate = (monthsFromActivation: number) =>
    formatBusinessDate(addCalendarMonthsPreservingAnchor(leaseStartDate, monthsFromActivation));

  const checkpoints: LeaseSettlementCheckpointSchedule[] =
    termMonths === 3
      ? [
          {
            code: 'checkpoint_1',
            sequence: 1,
            dueDate: dueDate(1),
            settlementMode: 'minimum_monthly_coverage',
            minimumRequiredAmount: checkpointOneMinimum,
          },
          {
            code: 'final_settlement',
            sequence: 2,
            dueDate: dueDate(2),
            settlementMode: 'exact_remaining_balance',
            minimumRequiredAmount: null,
          },
        ]
      : [
          {
            code: 'checkpoint_1',
            sequence: 1,
            dueDate: dueDate(1),
            settlementMode: 'minimum_monthly_coverage',
            minimumRequiredAmount: checkpointOneMinimum,
          },
          {
            code: 'checkpoint_2',
            sequence: 2,
            dueDate: dueDate(2),
            settlementMode: 'minimum_monthly_coverage',
            minimumRequiredAmount: checkpointTwoMinimum,
          },
          {
            code: 'final_settlement',
            sequence: 3,
            dueDate: dueDate(3),
            settlementMode: 'exact_remaining_balance',
            minimumRequiredAmount: null,
          },
        ];

  return {
    policyVersion: 'lease_settlement_v2',
    checkpointAnchorDay: anchorDay,
    initialMonthMinimumAmount: monthlyRentAmount,
    finalSettlementOffsetMonths,
    checkpoints,
  };
}

function assertSupportedTerm(value: number): SupportedLeaseSettlementTerm {
  if (!SUPPORTED_LEASE_SETTLEMENT_TERMS.includes(value as SupportedLeaseSettlementTerm))
    throw new RangeError('Lease settlement policy supports only 3, 6, or 12 months');
  return value as SupportedLeaseSettlementTerm;
}

function assertPositiveMoney(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function parseBusinessDate(value: string): Date {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Business date must use YYYY-MM-DD');
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatBusinessDate(parsed) !== value) throw new RangeError('Business date is invalid');
  return parsed;
}

function addCalendarMonthsPreservingAnchor(leaseStartDate: Date, months: number): Date {
  const firstOfTarget = new Date(
    Date.UTC(leaseStartDate.getUTCFullYear(), leaseStartDate.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(leaseStartDate.getUTCDate(), lastDay));
  return firstOfTarget;
}

function formatBusinessDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
