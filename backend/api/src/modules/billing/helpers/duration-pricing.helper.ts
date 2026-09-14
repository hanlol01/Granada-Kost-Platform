export type DurationPricingTier = 'short_stay' | 'medium_stay' | 'long_stay';

export type DurationPricingAuthority = {
  shortStayMonthlyPrice: number;
  mediumStayMonthlyPrice: number;
  longStayMonthlyPrice: number;
};

export type ResolvedDurationPricing = {
  tier: DurationPricingTier;
  monthlyRate: number;
  contractRent: number;
};

export type OwnerMonthlyEconomics = {
  grossRent: number;
  managementFee: number;
  ownerEntitlement: number;
};

export type LeasePricingSource = 'standard' | 'negotiated';

export type LeaseCommercialAgreementInput = {
  termMonths: number;
  pricingSource: LeasePricingSource;
  agreedMonthlyPrice?: number;
  managementFeeAmount: number;
  agreementReason?: string | null;
  varianceAcknowledged?: boolean;
};

export type LeaseCommercialAgreement = {
  pricingTier: DurationPricingTier;
  referenceMonthlyPrice: number;
  agreedMonthlyPrice: number;
  contractRent: number;
  pricingSource: LeasePricingSource;
  agreementReason: string | null;
  varianceAmount: number;
  varianceBasisPoints: number;
  requiresVarianceAcknowledgement: boolean;
};

const MATERIAL_VARIANCE_BASIS_POINTS = 1_500;

export function resolveLeaseCommercialAgreement(
  authority: DurationPricingAuthority,
  input: LeaseCommercialAgreementInput,
): LeaseCommercialAgreement {
  assertPricingAuthority(authority);
  if (!Number.isSafeInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 120)
    throw new RangeError('Lease term must be between 1 and 120 months');
  if (!Number.isSafeInteger(input.managementFeeAmount) || input.managementFeeAmount < 0)
    throw new RangeError('Management fee must be a non-negative safe integer');

  const pricingTier = resolveReferenceTier(input.termMonths);
  const referenceMonthlyPrice = priceForTier(authority, pricingTier);
  const normalizedReason = input.agreementReason?.trim() || null;

  if (input.pricingSource === 'standard') {
    if (input.termMonths < 3)
      throw new RangeError('One- and two-month leases require negotiated pricing');
    if (
      input.agreedMonthlyPrice !== undefined &&
      input.agreedMonthlyPrice !== referenceMonthlyPrice
    )
      throw new RangeError('Standard pricing must equal the reference tariff');
    if (normalizedReason !== null)
      throw new RangeError('Standard pricing cannot include a negotiation reason');
  } else if (input.pricingSource !== 'negotiated') {
    throw new RangeError('Pricing source must be standard or negotiated');
  }

  const agreedMonthlyPrice =
    input.pricingSource === 'standard' ? referenceMonthlyPrice : input.agreedMonthlyPrice;
  if (!Number.isSafeInteger(agreedMonthlyPrice) || (agreedMonthlyPrice ?? 0) <= 0)
    throw new RangeError('Agreed monthly price must be a positive safe integer');
  if ((agreedMonthlyPrice as number) <= input.managementFeeAmount)
    throw new RangeError('Agreed monthly price must be greater than the management fee');
  if (
    input.pricingSource === 'negotiated' &&
    (normalizedReason === null || normalizedReason.length < 3 || normalizedReason.length > 500)
  )
    throw new RangeError('Negotiated pricing requires an agreement reason of 3 to 500 characters');

  const varianceAmount = (agreedMonthlyPrice as number) - referenceMonthlyPrice;
  const varianceBasisPoints = Math.round((varianceAmount * 10_000) / referenceMonthlyPrice);
  const requiresVarianceAcknowledgement =
    Math.abs(varianceBasisPoints) >= MATERIAL_VARIANCE_BASIS_POINTS;
  if (requiresVarianceAcknowledgement && input.varianceAcknowledged !== true)
    throw new RangeError('Material tariff variance requires explicit acknowledgement');

  const contractRent = (agreedMonthlyPrice as number) * input.termMonths;
  if (!Number.isSafeInteger(contractRent)) throw new RangeError('Contract rent overflow');

  return {
    pricingTier,
    referenceMonthlyPrice,
    agreedMonthlyPrice: agreedMonthlyPrice as number,
    contractRent,
    pricingSource: input.pricingSource,
    agreementReason: normalizedReason,
    varianceAmount,
    varianceBasisPoints,
    requiresVarianceAcknowledgement,
  };
}

export function resolveDurationPricing(
  authority: DurationPricingAuthority,
  termMonths: number,
): ResolvedDurationPricing {
  assertPricingAuthority(authority);
  if (!Number.isSafeInteger(termMonths) || termMonths < 3)
    throw new RangeError('Invalid duration pricing authority');

  const tier = resolveReferenceTier(termMonths);
  const monthlyRate = priceForTier(authority, tier);
  const contractRent = monthlyRate * termMonths;
  if (!Number.isSafeInteger(contractRent)) throw new RangeError('Duration pricing overflow');
  return { tier, monthlyRate, contractRent };
}

function assertPricingAuthority(authority: DurationPricingAuthority): void {
  const prices = [
    authority.shortStayMonthlyPrice,
    authority.mediumStayMonthlyPrice,
    authority.longStayMonthlyPrice,
  ];
  if (
    prices.some((price) => !Number.isSafeInteger(price) || price <= 0) ||
    authority.shortStayMonthlyPrice < authority.mediumStayMonthlyPrice ||
    authority.mediumStayMonthlyPrice < authority.longStayMonthlyPrice
  )
    throw new RangeError('Invalid duration pricing authority');
}

function resolveReferenceTier(termMonths: number): DurationPricingTier {
  return termMonths <= 5 ? 'short_stay' : termMonths <= 11 ? 'medium_stay' : 'long_stay';
}

function priceForTier(authority: DurationPricingAuthority, tier: DurationPricingTier): number {
  return tier === 'short_stay'
    ? authority.shortStayMonthlyPrice
    : tier === 'medium_stay'
      ? authority.mediumStayMonthlyPrice
      : authority.longStayMonthlyPrice;
}

export function resolveOwnerMonthlyEconomics(
  monthlyRate: number,
  managementFee: number,
): OwnerMonthlyEconomics {
  if (
    !Number.isSafeInteger(monthlyRate) ||
    monthlyRate <= 0 ||
    !Number.isSafeInteger(managementFee) ||
    managementFee < 0 ||
    managementFee >= monthlyRate
  ) {
    throw new RangeError('Invalid owner monthly economics');
  }
  return {
    grossRent: monthlyRate,
    managementFee,
    ownerEntitlement: monthlyRate - managementFee,
  };
}
