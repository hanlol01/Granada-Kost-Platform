export type OnboardingCommitmentStatus = 'committed' | 'completed' | 'cancelled';

export type OnboardingCommitmentResponse = {
  commitmentId: string;
  status: OnboardingCommitmentStatus;
  leaseId: string;
  leaseStatus: 'awaiting_activation' | 'active';
  roomNumber: string;
  category: 'rukost' | 'apartkost';
  startDate: string;
  endDate: string;
  termMonths: number;
  billingCycle: 'monthly' | 'yearly';
  paymentPlanType: 'annual_full' | 'two_month_installments';
  contractRentAmount: number;
  dpRequiredAmount: number;
  securityDepositRequiredAmount: number;
  temporaryPassword: string | null;
};

export function calculateOnboardingCommercial(
  monthlyPrice: number,
  yearlyPrice: number,
  billingCycle: 'monthly' | 'yearly',
  termMonths: number,
): { contractRent: number; dpRequired: number; depositRequired: number } {
  if (
    !Number.isSafeInteger(monthlyPrice) ||
    !Number.isSafeInteger(yearlyPrice) ||
    monthlyPrice < 0 ||
    yearlyPrice < 0 ||
    !Number.isSafeInteger(termMonths) ||
    termMonths < 12 ||
    (billingCycle === 'yearly' && termMonths % 12 !== 0)
  ) {
    throw new RangeError('Invalid onboarding commercial authority');
  }
  const contractRent =
    billingCycle === 'yearly' ? yearlyPrice * (termMonths / 12) : monthlyPrice * termMonths;
  return {
    contractRent,
    dpRequired: Math.ceil(contractRent * 0.25),
    depositRequired: monthlyPrice,
  };
}
