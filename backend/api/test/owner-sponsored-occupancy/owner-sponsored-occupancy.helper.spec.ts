import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateOwnerSponsoredManagementFee,
  resolveOwnerSponsoredPaymentProgress,
} from '../../src/modules/billing/helpers/owner-sponsored-occupancy.helper';

test('owner-sponsored occupancy keeps rent at zero and projects management fee by term', () => {
  assert.deepEqual(calculateOwnerSponsoredManagementFee(300_000, 12), {
    contractRentAmount: 0,
    agreedMonthlyRentAmount: 0,
    monthlyManagementFee: 300_000,
    projectedManagementFeeAmount: 3_600_000,
  });
});

test('management-fee progress stays independent from rent and has no due-date state', () => {
  assert.deepEqual(resolveOwnerSponsoredPaymentProgress(3_600_000, 900_000), {
    projectedAmount: 3_600_000,
    verifiedPaidAmount: 900_000,
    remainingAmount: 2_700_000,
    overpaidAmount: 0,
    status: 'partially_paid',
  });
  assert.deepEqual(resolveOwnerSponsoredPaymentProgress(3_600_000, 3_600_000), {
    projectedAmount: 3_600_000,
    verifiedPaidAmount: 3_600_000,
    remainingAmount: 0,
    overpaidAmount: 0,
    status: 'paid',
  });
});

test('owner-sponsored management fee rejects unsafe money and term values', () => {
  assert.throws(() => calculateOwnerSponsoredManagementFee(0, 12), RangeError);
  assert.throws(() => calculateOwnerSponsoredManagementFee(300_000, 0), RangeError);
  assert.throws(() => resolveOwnerSponsoredPaymentProgress(3_600_000, -1), RangeError);
});
