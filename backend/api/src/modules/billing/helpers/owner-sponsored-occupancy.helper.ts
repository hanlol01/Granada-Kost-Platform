export type OwnerSponsoredManagementFeeProgress = {
  projectedAmount: number;
  verifiedPaidAmount: number;
  remainingAmount: number;
  overpaidAmount: number;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overpaid';
};

function assertMoney(value: number, allowZero: boolean): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new RangeError('OWNER_SPONSORED_MONEY_INVALID');
  }
}

export function calculateOwnerSponsoredManagementFee(monthlyFee: number, termMonths: number) {
  assertMoney(monthlyFee, false);
  if (!Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 120) {
    throw new RangeError('OWNER_SPONSORED_TERM_INVALID');
  }
  const projectedManagementFeeAmount = monthlyFee * termMonths;
  assertMoney(projectedManagementFeeAmount, false);
  return {
    contractRentAmount: 0,
    agreedMonthlyRentAmount: 0,
    monthlyManagementFee: monthlyFee,
    projectedManagementFeeAmount,
  };
}

export function resolveOwnerSponsoredPaymentProgress(
  projectedAmount: number,
  verifiedPaidAmount: number,
): OwnerSponsoredManagementFeeProgress {
  assertMoney(projectedAmount, false);
  assertMoney(verifiedPaidAmount, true);
  const remainingAmount = Math.max(projectedAmount - verifiedPaidAmount, 0);
  const overpaidAmount = Math.max(verifiedPaidAmount - projectedAmount, 0);
  return {
    projectedAmount,
    verifiedPaidAmount,
    remainingAmount,
    overpaidAmount,
    status:
      overpaidAmount > 0
        ? 'overpaid'
        : remainingAmount === 0
          ? 'paid'
          : verifiedPaidAmount > 0
            ? 'partially_paid'
            : 'unpaid',
  };
}
