import { BILLING_POLICY } from '../constants/billing.constants';

export type LateFeeCalculationInput = {
  subtotalAmount: number;
  dueDate: string | Date;
  assessmentDate: string | Date;
};

export type LateFeeCalculationResult = {
  daysOverdue: number;
  ratePercentPerDay: number;
  capPercent: number;
  assessedAmount: number;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function toUtcDateOnly(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : value;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function calculateLateFee(input: LateFeeCalculationInput): LateFeeCalculationResult {
  const dueDate = toUtcDateOnly(input.dueDate);
  const assessmentDate = toUtcDateOnly(input.assessmentDate);
  const rawDays = Math.floor((assessmentDate - dueDate) / millisecondsPerDay);
  const daysOverdue = Math.max(0, rawDays - BILLING_POLICY.gracePeriodDays);
  const uncapped = Math.floor(input.subtotalAmount * (BILLING_POLICY.lateFeeRatePercentPerDay / 100) * daysOverdue);
  const cap = Math.floor(input.subtotalAmount * (BILLING_POLICY.lateFeeCapPercent / 100));

  return {
    daysOverdue,
    ratePercentPerDay: BILLING_POLICY.lateFeeRatePercentPerDay,
    capPercent: BILLING_POLICY.lateFeeCapPercent,
    assessedAmount: Math.min(uncapped, cap),
  };
}
