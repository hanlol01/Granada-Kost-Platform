import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveLeaseCommercialAgreement,
  resolveDurationPricing,
  resolveOwnerMonthlyEconomics,
} from '../../src/modules/billing/helpers/duration-pricing.helper';

const rates = {
  shortStayMonthlyPrice: 1_900_000,
  mediumStayMonthlyPrice: 1_850_000,
  longStayMonthlyPrice: 1_800_000,
};

test('negotiated one-month agreement uses short-stay only as its reference tariff', () => {
  assert.deepEqual(
    resolveLeaseCommercialAgreement(rates, {
      termMonths: 1,
      pricingSource: 'negotiated',
      agreedMonthlyPrice: 1_950_000,
      managementFeeAmount: 300_000,
      agreementReason: 'Permintaan sewa singkat selama masa orientasi',
    }),
    {
      pricingTier: 'short_stay',
      referenceMonthlyPrice: 1_900_000,
      agreedMonthlyPrice: 1_950_000,
      contractRent: 1_950_000,
      pricingSource: 'negotiated',
      agreementReason: 'Permintaan sewa singkat selama masa orientasi',
      varianceAmount: 50_000,
      varianceBasisPoints: 263,
      requiresVarianceAcknowledgement: false,
    },
  );
});

test('standard agreements use the effective duration tier without private negotiation data', () => {
  assert.deepEqual(
    resolveLeaseCommercialAgreement(rates, {
      termMonths: 11,
      pricingSource: 'standard',
      managementFeeAmount: 300_000,
    }),
    {
      pricingTier: 'medium_stay',
      referenceMonthlyPrice: 1_850_000,
      agreedMonthlyPrice: 1_850_000,
      contractRent: 20_350_000,
      pricingSource: 'standard',
      agreementReason: null,
      varianceAmount: 0,
      varianceBasisPoints: 0,
      requiresVarianceAcknowledgement: false,
    },
  );
});

test('negotiated agreements require a reason, fee-safe rate, and material variance acknowledgement', () => {
  assert.throws(
    () =>
      resolveLeaseCommercialAgreement(rates, {
        termMonths: 2,
        pricingSource: 'negotiated',
        agreedMonthlyPrice: 1_900_000,
        managementFeeAmount: 300_000,
      }),
    /requires an agreement reason/,
  );
  assert.throws(
    () =>
      resolveLeaseCommercialAgreement(rates, {
        termMonths: 11,
        pricingSource: 'negotiated',
        agreedMonthlyPrice: 300_000,
        managementFeeAmount: 300_000,
        agreementReason: 'Tarif program khusus',
      }),
    /greater than the management fee/,
  );
  assert.throws(
    () =>
      resolveLeaseCommercialAgreement(rates, {
        termMonths: 11,
        pricingSource: 'negotiated',
        agreedMonthlyPrice: 1_500_000,
        managementFeeAmount: 300_000,
        agreementReason: 'Kesepakatan promosi',
      }),
    /explicit acknowledgement/,
  );
  assert.equal(
    resolveLeaseCommercialAgreement(rates, {
      termMonths: 11,
      pricingSource: 'negotiated',
      agreedMonthlyPrice: 1_500_000,
      managementFeeAmount: 300_000,
      agreementReason: 'Kesepakatan promosi',
      varianceAcknowledged: true,
    }).contractRent,
    16_500_000,
  );
});

test('negotiated agreement reason follows the persisted audit length', () => {
  assert.throws(
    () =>
      resolveLeaseCommercialAgreement(rates, {
        termMonths: 3,
        pricingSource: 'negotiated',
        agreedMonthlyPrice: 1_850_000,
        managementFeeAmount: 300_000,
        agreementReason: 'x',
      }),
    /3 to 500 characters/,
  );
});

test('one- and two-month agreements cannot silently use standard pricing', () => {
  for (const termMonths of [1, 2]) {
    assert.throws(
      () =>
        resolveLeaseCommercialAgreement(rates, {
          termMonths,
          pricingSource: 'standard',
          managementFeeAmount: 300_000,
        }),
      /require negotiated pricing/,
    );
  }
});

test('selects one rate for every month in the chosen duration tier', () => {
  assert.deepEqual(resolveDurationPricing(rates, 3), {
    tier: 'short_stay',
    monthlyRate: 1_900_000,
    contractRent: 5_700_000,
  });
  assert.equal(resolveDurationPricing(rates, 5).contractRent, 9_500_000);
  assert.equal(resolveDurationPricing(rates, 6).contractRent, 11_100_000);
  assert.equal(resolveDurationPricing(rates, 11).contractRent, 20_350_000);
  assert.equal(resolveDurationPricing(rates, 12).contractRent, 21_600_000);
  assert.equal(resolveDurationPricing(rates, 13).contractRent, 23_400_000);
});

test('rejects invalid tier ordering and terms shorter than three months', () => {
  assert.throws(() => resolveDurationPricing(rates, 2), RangeError);
  assert.throws(
    () => resolveDurationPricing({ ...rates, mediumStayMonthlyPrice: 2_000_000 }, 6),
    RangeError,
  );
});

test('deducts one effective management fee from the selected monthly tier', () => {
  assert.deepEqual(resolveOwnerMonthlyEconomics(1_900_000, 300_000), {
    grossRent: 1_900_000,
    managementFee: 300_000,
    ownerEntitlement: 1_600_000,
  });
  assert.equal(resolveOwnerMonthlyEconomics(1_850_000, 300_000).ownerEntitlement, 1_550_000);
  assert.equal(resolveOwnerMonthlyEconomics(1_800_000, 300_000).ownerEntitlement, 1_500_000);
  assert.throws(() => resolveOwnerMonthlyEconomics(1_800_000, 1_800_000), RangeError);
});
