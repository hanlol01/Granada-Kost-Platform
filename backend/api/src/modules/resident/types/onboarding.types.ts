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
  resolveDurationPricing,
  type DurationPricingAuthority,
  type DurationPricingTier,
} from '../../billing/helpers/duration-pricing.helper';

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
