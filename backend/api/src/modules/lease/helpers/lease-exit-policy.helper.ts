export const LEASE_EXIT_TYPES = ['resident_early_termination', 'normal_expiry'] as const;

export type LeaseExitType = (typeof LEASE_EXIT_TYPES)[number];

export type LeaseExitNoticeQuote = {
  exitType: LeaseExitType;
  noticeDays: number;
  missingNoticeDays: number;
  paymentPeriodDays: number;
  dailyRateAmount: number;
  recommendedShortNoticeCharge: number;
};

export type LeaseExitFinancialQuote = {
  contractRentAmount: number;
  verifiedRentPaymentAmount: number;
  existingInvoiceCreditAmount: number;
  recognizedRentCreditAmount: number;
  earnedRentAmount: number;
  earnedRentAmountDueBeforeDepositOffset: number;
  contractOutstandingAmount: number;
  approvedShortNoticeCharge: number;
  rentRefundableAmount: number;
  rentAmountDueBeforeDepositOffset: number;
  depositLiabilityAmount: number;
  depositDeductionAmount: number;
  depositRentOffsetAmount: number;
  refundableDepositAmount: number;
  recommendedRefundAmount: number;
  amountDue: number;
};

type LeaseExitNoticeQuoteInput = {
  exitType: LeaseExitType;
  leaseStartDate: string;
  plannedEndDate: string;
  noticeDate: string;
  effectiveDate: string;
  monthlyRateAmount: number;
};

type LeaseExitFinancialQuoteInput = {
  leaseStartDate: string;
  actualCheckoutDate: string;
  contractRentAmount: number;
  monthlyRateAmount: number;
  verifiedRentPaymentAmount: number;
  existingInvoiceCreditAmount: number;
  depositLiabilityAmount: number;
  depositDeductionAmount: number;
  approvedShortNoticeCharge: number;
  depositRentOffsetAmount: number;
};

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * Produces the immutable 14-day notice recommendation from lease snapshots.
 * Rupiah fractions are rounded to the nearest whole Rupiah only after the
 * monthly-rate multiplication, so the displayed daily rate cannot accumulate
 * rounding drift across the missing notice days.
 */
export function buildLeaseExitNoticeQuote(input: LeaseExitNoticeQuoteInput): LeaseExitNoticeQuote {
  if (!LEASE_EXIT_TYPES.includes(input.exitType))
    throw new RangeError('Lease exit type is invalid');
  const leaseStart = parseBusinessDate(input.leaseStartDate);
  const plannedEnd = parseBusinessDate(input.plannedEndDate);
  const notice = parseBusinessDate(input.noticeDate);
  const effective = parseBusinessDate(input.effectiveDate);
  const monthlyRate = assertPositiveMoney(input.monthlyRateAmount);

  if (effective.getTime() < notice.getTime())
    throw new RangeError('Checkout effective date cannot be before the notice date');
  if (
    input.exitType === 'resident_early_termination' &&
    effective.getTime() >= plannedEnd.getTime()
  )
    throw new RangeError('Early termination must occur before the planned lease end date');
  if (input.exitType === 'normal_expiry' && effective.getTime() < plannedEnd.getTime())
    throw new RangeError('Normal expiry checkout cannot occur before the planned lease end date');

  const noticeDays = differenceInCalendarDays(notice, effective);
  const paymentPeriodDays = leaseAnchoredPeriodDays(leaseStart, effective);
  const missingNoticeDays =
    input.exitType === 'resident_early_termination' ? Math.max(0, 14 - noticeDays) : 0;

  return {
    exitType: input.exitType,
    noticeDays,
    missingNoticeDays,
    paymentPeriodDays,
    dailyRateAmount: Math.round(monthlyRate / paymentPeriodDays),
    recommendedShortNoticeCharge: Math.round((monthlyRate * missingNoticeDays) / paymentPeriodDays),
  };
}

/**
 * Keeps rent credit, earned rent, charges, and deposit liability as separate
 * components. A deposit-to-rent offset is never inferred: callers must supply
 * an explicit amount, bounded by both the rent amount due and deposit balance.
 */
export function buildLeaseExitFinancialQuote(
  input: LeaseExitFinancialQuoteInput,
): LeaseExitFinancialQuote {
  const leaseStart = parseBusinessDate(input.leaseStartDate);
  const checkout = parseBusinessDate(input.actualCheckoutDate);
  const contractRent = assertNonNegativeMoney(input.contractRentAmount, 'contract rent');
  const monthlyRate = assertPositiveMoney(input.monthlyRateAmount);
  const verifiedPayment = assertNonNegativeMoney(
    input.verifiedRentPaymentAmount,
    'verified rent payment',
  );
  const invoiceCredit = assertNonNegativeMoney(
    input.existingInvoiceCreditAmount,
    'existing invoice credit',
  );
  const recognizedCredit = verifiedPayment + invoiceCredit;
  if (!Number.isSafeInteger(recognizedCredit))
    throw new RangeError('Recognized rent credit must be a safe integer');
  const deposit = assertNonNegativeMoney(input.depositLiabilityAmount, 'deposit liability');
  const deductions = assertNonNegativeMoney(input.depositDeductionAmount, 'deposit deduction');
  const noticeCharge = assertNonNegativeMoney(
    input.approvedShortNoticeCharge,
    'short-notice charge',
  );
  const depositOffset = assertNonNegativeMoney(
    input.depositRentOffsetAmount,
    'deposit rent offset',
  );
  if (checkout.getTime() < leaseStart.getTime())
    throw new RangeError('Actual checkout date cannot precede lease start');
  if (deductions > deposit) throw new RangeError('Deposit deductions exceed deposit liability');

  const earnedRent = Math.min(contractRent, calculateEarnedRent(leaseStart, checkout, monthlyRate));
  const earnedRentDue = Math.max(earnedRent - recognizedCredit, 0);
  const rentPosition = recognizedCredit - earnedRent - noticeCharge;
  const rentRefundable = Math.max(rentPosition, 0);
  const rentDue = Math.max(-rentPosition, 0);
  const depositAfterDeductions = deposit - deductions;
  const maximumDepositOffset = Math.min(rentDue, depositAfterDeductions);
  if (depositOffset > maximumDepositOffset)
    throw new RangeError('Deposit rent offset exceeds the permitted amount');
  const refundableDeposit = depositAfterDeductions - depositOffset;

  return {
    contractRentAmount: contractRent,
    verifiedRentPaymentAmount: verifiedPayment,
    existingInvoiceCreditAmount: invoiceCredit,
    recognizedRentCreditAmount: recognizedCredit,
    earnedRentAmount: earnedRent,
    earnedRentAmountDueBeforeDepositOffset: earnedRentDue,
    contractOutstandingAmount: Math.max(contractRent - recognizedCredit - depositOffset, 0),
    approvedShortNoticeCharge: noticeCharge,
    rentRefundableAmount: rentRefundable,
    rentAmountDueBeforeDepositOffset: rentDue,
    depositLiabilityAmount: deposit,
    depositDeductionAmount: deductions,
    depositRentOffsetAmount: depositOffset,
    refundableDepositAmount: refundableDeposit,
    recommendedRefundAmount: rentRefundable + refundableDeposit,
    amountDue: rentDue - depositOffset,
  };
}

function calculateEarnedRent(leaseStart: Date, checkout: Date, monthlyRate: number): number {
  let earned = 0;
  let period = 0;
  const checkoutExclusive = new Date(checkout.getTime() + DAY_MS);
  while (true) {
    const periodStart = addCalendarMonthsPreservingAnchor(leaseStart, period);
    if (periodStart.getTime() >= checkoutExclusive.getTime()) break;
    const periodEnd = addCalendarMonthsPreservingAnchor(leaseStart, period + 1);
    const periodDays = differenceInCalendarDays(periodStart, periodEnd);
    const coveredUntil = Math.min(periodEnd.getTime(), checkoutExclusive.getTime());
    const usedDays = Math.max(0, Math.round((coveredUntil - periodStart.getTime()) / DAY_MS));
    earned +=
      usedDays === periodDays ? monthlyRate : Math.round((monthlyRate * usedDays) / periodDays);
    period += 1;
  }
  return earned;
}

function leaseAnchoredPeriodDays(leaseStart: Date, effective: Date): number {
  let monthOffset =
    (effective.getUTCFullYear() - leaseStart.getUTCFullYear()) * 12 +
    effective.getUTCMonth() -
    leaseStart.getUTCMonth();
  let periodStart = addCalendarMonthsPreservingAnchor(leaseStart, monthOffset);
  if (periodStart.getTime() > effective.getTime()) {
    monthOffset -= 1;
    periodStart = addCalendarMonthsPreservingAnchor(leaseStart, monthOffset);
  }
  const periodEnd = addCalendarMonthsPreservingAnchor(leaseStart, monthOffset + 1);
  const days = differenceInCalendarDays(periodStart, periodEnd);
  if (days <= 0) throw new RangeError('Lease payment period must contain at least one day');
  return days;
}

function addCalendarMonthsPreservingAnchor(anchor: Date, months: number): Date {
  const target = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return target;
}

function differenceInCalendarDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function parseBusinessDate(value: string): Date {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Business date must use YYYY-MM-DD');
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (parsed.toISOString().slice(0, 10) !== value) throw new RangeError('Business date is invalid');
  return parsed;
}

function assertPositiveMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError('Monthly rate must be a positive safe integer');
  return value;
}

function assertNonNegativeMoney(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${label} must be a non-negative safe integer`);
  return value;
}
