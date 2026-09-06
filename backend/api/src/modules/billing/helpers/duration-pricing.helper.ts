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

export function resolveDurationPricing(
  authority: DurationPricingAuthority,
  termMonths: number,
): ResolvedDurationPricing {
  const prices = [
    authority.shortStayMonthlyPrice,
    authority.mediumStayMonthlyPrice,
    authority.longStayMonthlyPrice,
  ];
  if (
    !Number.isSafeInteger(termMonths) ||
    termMonths < 3 ||
    prices.some((price) => !Number.isSafeInteger(price) || price <= 0) ||
    authority.shortStayMonthlyPrice < authority.mediumStayMonthlyPrice ||
    authority.mediumStayMonthlyPrice < authority.longStayMonthlyPrice
  ) {
    throw new RangeError('Invalid duration pricing authority');
  }

  const tier: DurationPricingTier =
    termMonths <= 5 ? 'short_stay' : termMonths <= 11 ? 'medium_stay' : 'long_stay';
  const monthlyRate =
    tier === 'short_stay'
      ? authority.shortStayMonthlyPrice
      : tier === 'medium_stay'
        ? authority.mediumStayMonthlyPrice
        : authority.longStayMonthlyPrice;
  const contractRent = monthlyRate * termMonths;
  if (!Number.isSafeInteger(contractRent)) throw new RangeError('Duration pricing overflow');
  return { tier, monthlyRate, contractRent };
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
