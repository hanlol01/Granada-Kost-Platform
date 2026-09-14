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
  paymentPlanType: 'annual_full' | 'two_month_installments' | 'monthly_installments';
  contractRentAmount: number;
  pricingSource: 'standard' | 'negotiated';
  pricingTier: 'short_stay' | 'medium_stay' | 'long_stay';
  referenceMonthlyPrice: number;
  agreedMonthlyPrice: number;
  pricingAgreementReason: string | null;
  dpRequiredAmount: number;
  securityDepositRequiredAmount: number;
  initialPayment: {
    method: 'cash' | 'bank_transfer';
    status: 'verified' | 'pending_confirmation';
    dpRecordedAmount: number;
    securityDepositRecordedAmount: number;
    dpVerifiedAmount: number;
    securityDepositVerifiedAmount: number;
    receipts: Array<{
      id: string;
      purpose:
        | 'booking_fee'
        | 'down_payment'
        | 'installment'
        | 'full_settlement'
        | 'security_deposit';
      amount: number;
      rentPaymentSequence: number | null;
    }>;
  };
  contractPaidDocument: {
    id: string;
    documentCode: string;
    issuedAt: string;
  } | null;
  temporaryPassword: string | null;
};

import {
  resolveLeaseCommercialAgreement,
  resolveDurationPricing,
  type LeaseCommercialAgreementInput,
  type DurationPricingAuthority,
  type DurationPricingTier,
} from '../../billing/helpers/duration-pricing.helper';

export function calculateOnboardingCommercialAgreement(
  pricing: DurationPricingAuthority,
  input: LeaseCommercialAgreementInput,
): {
  contractRent: number;
  dpRequired: number;
  depositRequired: number;
  monthlyRate: number;
  referenceMonthlyPrice: number;
  pricingTier: DurationPricingTier;
  pricingSource: 'standard' | 'negotiated';
  pricingAgreementReason: string | null;
  varianceAmount: number;
  varianceBasisPoints: number;
} {
  const agreement = resolveLeaseCommercialAgreement(pricing, input);
  return {
    contractRent: agreement.contractRent,
    dpRequired: Math.ceil(agreement.contractRent * 0.25),
    depositRequired: 0,
    monthlyRate: agreement.agreedMonthlyPrice,
    referenceMonthlyPrice: agreement.referenceMonthlyPrice,
    pricingTier: agreement.pricingTier,
    pricingSource: agreement.pricingSource,
    pricingAgreementReason: agreement.agreementReason,
    varianceAmount: agreement.varianceAmount,
    varianceBasisPoints: agreement.varianceBasisPoints,
  };
}

export function calculateOnboardingCommercialFromSnapshot(input: {
  termMonths: number;
  pricingTier: DurationPricingTier;
  referenceMonthlyPrice: number;
  agreedMonthlyPrice: number;
  pricingSource: 'standard' | 'negotiated';
  pricingAgreementReason: string | null;
}): ReturnType<typeof calculateOnboardingCommercialAgreement> {
  const agreement = calculateOnboardingCommercialAgreement(
    {
      shortStayMonthlyPrice: input.referenceMonthlyPrice,
      mediumStayMonthlyPrice: input.referenceMonthlyPrice,
      longStayMonthlyPrice: input.referenceMonthlyPrice,
    },
    {
      termMonths: input.termMonths,
      pricingSource: input.pricingSource,
      agreedMonthlyPrice: input.agreedMonthlyPrice,
      managementFeeAmount: 0,
      agreementReason: input.pricingAgreementReason ?? undefined,
      varianceAcknowledged: true,
    },
  );
  if (agreement.pricingTier !== input.pricingTier) {
    throw new Error('LEASE_COMMERCIAL_SNAPSHOT_TIER_INVALID');
  }
  return agreement;
}

export function calculateOnboardingCommercial(
  pricing: DurationPricingAuthority,
  termMonths: number,
): {
  contractRent: number;
  dpRequired: number;
  depositRequired: number;
  monthlyRate: number;
  pricingTier: DurationPricingTier;
} {
  const resolved = resolveDurationPricing(pricing, termMonths);
  return {
    contractRent: resolved.contractRent,
    dpRequired: Math.ceil(resolved.contractRent * 0.25),
    // Security deposit remains a separate liability. Its funding is a free
    // non-negative commitment input and never reduces rent receivable.
    depositRequired: 0,
    monthlyRate: resolved.monthlyRate,
    pricingTier: resolved.tier,
  };
}
