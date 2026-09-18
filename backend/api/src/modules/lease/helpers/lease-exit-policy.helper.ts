export const LEASE_EXIT_TYPES = ['resident_early_termination', 'normal_expiry'] as const;

export type LeaseExitType = (typeof LEASE_EXIT_TYPES)[number];

/**
 * Checkout records created before the late-checkout policy retain their
 * short-notice economics forever. New records use the simpler, operational
 * late-checkout policy. The policy is a snapshot, never an inferred label.
 */
export const CHECKOUT_CHARGE_POLICIES = [
  'legacy_short_notice_v1',
  'late_checkout_penalty_v1',
] as const;

export type CheckoutChargePolicy = (typeof CHECKOUT_CHARGE_POLICIES)[number];

export const LATE_CHECKOUT_GRACE_DAYS = 3;
export const LATE_CHECKOUT_PENALTY_DAY_CAP = 30;

export type LateCheckoutPenaltyQuote = {
  contractLastOccupancyDate: string;
  penaltyFreeUntilDate: string;
  graceDays: number;
  dailyPenaltyAmount: number;
  overdueDays: number;
  chargedDays: number;
  lateCheckoutPenaltyAmount: number;
};

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
  lateCheckoutPenaltyAmount: number;
  checkoutChargeAmount: number;
  baseRentAmountDueBeforeCheckoutCharge: number;
  shortNoticeChargeDue: number;
  lateCheckoutPenaltyDue: number;
  rentRefundableAmount: number;
  rentAmountDueBeforeDepositOffset: number;
  depositLiabilityAmount: number;
  documentedDamageAmount: number;
  depositDeductionAmount: number;
  damageAmountDue: number;
  depositRentOffsetAmount: number;
  refundableDepositAmount: number;
  grossRefundAmount: number;
  grossAmountDue: number;
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
  documentedDamageAmount: number;
  approvedShortNoticeCharge: number;
  lateCheckoutPenaltyAmount?: number;
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
  const documentedDamage = assertNonNegativeMoney(
    input.documentedDamageAmount,
    'documented damage',
  );
  const noticeCharge = assertNonNegativeMoney(
    input.approvedShortNoticeCharge,
    'short-notice charge',
  );
  const lateCheckoutPenalty = assertNonNegativeMoney(
    input.lateCheckoutPenaltyAmount ?? 0,
    'late checkout penalty',
  );
  const depositOffset = assertNonNegativeMoney(
    input.depositRentOffsetAmount,
    'deposit rent offset',
  );
  if (checkout.getTime() < leaseStart.getTime())
    throw new RangeError('Actual checkout date cannot precede lease start');
  const earnedRent = Math.min(contractRent, calculateEarnedRent(leaseStart, checkout, monthlyRate));
  const earnedRentDue = Math.max(earnedRent - recognizedCredit, 0);
  const creditAfterEarnedRent = Math.max(recognizedCredit - earnedRent, 0);
  const checkoutCharge = noticeCharge + lateCheckoutPenalty;
  if (!Number.isSafeInteger(checkoutCharge))
    throw new RangeError('Checkout charges must be a safe integer');

  // Charges first consume an eligible rent credit/refund. Any remainder is a
  // separately visible final obligation. A security deposit is never silently
  // used for either type of checkout charge.
  const shortNoticeChargeCovered = Math.min(noticeCharge, creditAfterEarnedRent);
  const lateCheckoutPenaltyCovered = Math.min(
    lateCheckoutPenalty,
    Math.max(creditAfterEarnedRent - shortNoticeChargeCovered, 0),
  );
  const shortNoticeChargeDue = noticeCharge - shortNoticeChargeCovered;
  const lateCheckoutPenaltyDue = lateCheckoutPenalty - lateCheckoutPenaltyCovered;
  const rentRefundable = Math.max(
    creditAfterEarnedRent - shortNoticeChargeCovered - lateCheckoutPenaltyCovered,
    0,
  );
  const rentDue = earnedRentDue + shortNoticeChargeDue + lateCheckoutPenaltyDue;
  const maximumDepositOffset = Math.min(rentDue, deposit);
  if (depositOffset > maximumDepositOffset)
    throw new RangeError('Deposit rent offset exceeds the permitted amount');
  const depositAfterRent = deposit - depositOffset;
  const depositDeduction = Math.min(documentedDamage, depositAfterRent);
  const damageAmountDue = Math.max(documentedDamage - depositAfterRent, 0);
  const refundableDeposit = depositAfterRent - depositDeduction;
  const grossRefund = rentRefundable + refundableDeposit;
  const grossAmountDue = rentDue - depositOffset + damageAmountDue;

  return {
    contractRentAmount: contractRent,
    verifiedRentPaymentAmount: verifiedPayment,
    existingInvoiceCreditAmount: invoiceCredit,
    recognizedRentCreditAmount: recognizedCredit,
    earnedRentAmount: earnedRent,
    earnedRentAmountDueBeforeDepositOffset: earnedRentDue,
    contractOutstandingAmount: Math.max(contractRent - recognizedCredit - depositOffset, 0),
    approvedShortNoticeCharge: noticeCharge,
    lateCheckoutPenaltyAmount: lateCheckoutPenalty,
    checkoutChargeAmount: checkoutCharge,
    baseRentAmountDueBeforeCheckoutCharge: earnedRentDue,
    shortNoticeChargeDue,
    lateCheckoutPenaltyDue,
    rentRefundableAmount: rentRefundable,
    rentAmountDueBeforeDepositOffset: rentDue,
    depositLiabilityAmount: deposit,
    documentedDamageAmount: documentedDamage,
    depositDeductionAmount: depositDeduction,
    damageAmountDue,
    depositRentOffsetAmount: depositOffset,
    refundableDepositAmount: refundableDeposit,
    grossRefundAmount: grossRefund,
    grossAmountDue,
    recommendedRefundAmount: Math.max(grossRefund - grossAmountDue, 0),
    amountDue: Math.max(grossAmountDue - grossRefund, 0),
  };
}

/**
 * Calculates the post-contract checkout penalty from immutable lease pricing.
 * `plannedLeaseEndDate` is the exclusive end of the contract interval, so the
 * final contractual occupancy date is one calendar day before it.
 */
export function buildLateCheckoutPenaltyQuote(input: {
  plannedLeaseEndDate: string;
  actualPossessionReturnedDate: string;
  monthlyRateAmount: number;
  graceDays?: number;
  penaltyDayCap?: number;
  /** Stored by the checkout command to make later tariff edits irrelevant. */
  dailyPenaltyAmount?: number;
}): LateCheckoutPenaltyQuote {
  const plannedEndExclusive = parseBusinessDate(input.plannedLeaseEndDate);
  const actualReturn = parseBusinessDate(input.actualPossessionReturnedDate);
  const monthlyRate =
    input.dailyPenaltyAmount === undefined
      ? assertPositiveMoney(input.monthlyRateAmount)
      : assertNonNegativeMoney(input.monthlyRateAmount, 'Monthly rate');
  const graceDays = input.graceDays ?? LATE_CHECKOUT_GRACE_DAYS;
  const penaltyDayCap = input.penaltyDayCap ?? LATE_CHECKOUT_PENALTY_DAY_CAP;
  if (!Number.isSafeInteger(graceDays) || graceDays < 0 || graceDays > 31)
    throw new RangeError('Late checkout grace days must be between 0 and 31');
  if (!Number.isSafeInteger(penaltyDayCap) || penaltyDayCap < 1 || penaltyDayCap > 366)
    throw new RangeError('Late checkout penalty day cap must be between 1 and 366');

  const contractLastOccupancy = new Date(plannedEndExclusive.getTime() - DAY_MS);
  const penaltyFreeUntil = new Date(contractLastOccupancy.getTime() + graceDays * DAY_MS);
  const overdueDays = Math.max(0, differenceInCalendarDays(penaltyFreeUntil, actualReturn));
  const chargedDays = Math.min(overdueDays, penaltyDayCap);
  const dailyPenaltyAmount =
    input.dailyPenaltyAmount !== undefined
      ? assertNonNegativeMoney(input.dailyPenaltyAmount, 'Daily late checkout penalty')
      : Math.round(monthlyRate / 30);
  const lateCheckoutPenaltyAmount = dailyPenaltyAmount * chargedDays;
  if (!Number.isSafeInteger(lateCheckoutPenaltyAmount))
    throw new RangeError('Late checkout penalty must be a safe integer');

  return {
    contractLastOccupancyDate: formatBusinessDate(contractLastOccupancy),
    penaltyFreeUntilDate: formatBusinessDate(penaltyFreeUntil),
    graceDays,
    dailyPenaltyAmount,
    overdueDays,
    chargedDays,
    lateCheckoutPenaltyAmount,
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

function formatBusinessDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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
