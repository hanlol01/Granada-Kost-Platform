import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveDurationPricing,
  resolveOwnerMonthlyEconomics,
} from '../../src/modules/billing/helpers/duration-pricing.helper';

const rates = {
  shortStayMonthlyPrice: 1_900_000,
  mediumStayMonthlyPrice: 1_850_000,
  longStayMonthlyPrice: 1_800_000,
};

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
