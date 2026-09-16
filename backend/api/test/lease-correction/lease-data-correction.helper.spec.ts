import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCorrectedLeaseEndDate,
  calculateLeaseCorrectionImpact,
} from '../../src/modules/lease/lease-data-correction.helper';

test('lease correction preserves the calendar day when adding contract months', () => {
  assert.equal(calculateCorrectedLeaseEndDate('2026-08-01', 12), '2027-08-01');
  assert.equal(calculateCorrectedLeaseEndDate('2026-01-31', 1), '2026-02-28');
  assert.equal(calculateCorrectedLeaseEndDate('2024-01-31', 1), '2024-02-29');
});

test('lease correction reports added obligation, credit, and remaining balance separately', () => {
  assert.deepEqual(calculateLeaseCorrectionImpact(21_600_000, 23_400_000, 10_000_000), {
    contractDelta: 1_800_000,
    additionalCharge: 1_800_000,
    contractCredit: 0,
    verifiedRentPayment: 10_000_000,
    outstandingAfter: 13_400_000,
    overpaymentAfter: 0,
  });
  assert.deepEqual(calculateLeaseCorrectionImpact(21_600_000, 10_800_000, 21_600_000), {
    contractDelta: -10_800_000,
    additionalCharge: 0,
    contractCredit: 10_800_000,
    verifiedRentPayment: 21_600_000,
    outstandingAfter: 0,
    overpaymentAfter: 10_800_000,
  });
});

test('lease correction rejects unsafe money and date inputs', () => {
  assert.throws(() => calculateCorrectedLeaseEndDate('31/01/2026', 1), RangeError);
  assert.throws(() => calculateCorrectedLeaseEndDate('2026-01-01', 0), RangeError);
  assert.throws(() => calculateLeaseCorrectionImpact(-1, 1, 0), RangeError);
});
