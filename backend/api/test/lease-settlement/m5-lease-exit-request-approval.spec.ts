import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import {
  buildLeaseExitFinancialQuote,
  buildLeaseExitNoticeQuote,
} from '../../src/modules/lease/helpers/lease-exit-policy.helper';

const root = resolve(__dirname, '../..');
const migrationPath = resolve(
  root,
  'src/infrastructure/database/migrations/052_lease_exit_request_approval_m5.sql',
);
const finalSettlementMigrationPath = resolve(
  root,
  'src/infrastructure/database/migrations/053_lease_exit_final_settlement_m5.sql',
);

void test('M5 migration is manifest-bound, additive, and preserves legacy checkout rows', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (candidate) => candidate.version === '052_lease_exit_request_approval_m5.sql',
  );
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS exit_type TEXT/);
  assert.match(migration, /recommended_short_notice_charge BIGINT/);
  assert.match(migration, /approved_short_notice_charge BIGINT/);
  assert.match(migration, /physical_checkout_confirmed_at TIMESTAMPTZ/);
  assert.match(migration, /lease_checkout_commands_m5_physical_checkout_check/);
  assert.match(migration, /exit_type IS NULL OR/);
  assert.doesNotMatch(migration, /UPDATE\s+(leases|occupancies|rooms|payments|invoices)\b/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i);
});

void test('M5 final-settlement migration separates rent, deposit, refund, and amount due', () => {
  const migration = readFileSync(finalSettlementMigrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (candidate) => candidate.version === '053_lease_exit_final_settlement_m5.sql',
  );
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_exit_final_settlements/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_exit_refunds/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_exit_invoice_adjustments/);
  assert.match(migration, /deposit_rent_offset_amount BIGINT/);
  assert.match(migration, /final_rent_refund_amount BIGINT/);
  assert.match(migration, /final_deposit_refund_amount BIGINT/);
  assert.match(migration, /refund_adjustment_evidence_file_id UUID/);
  assert.match(migration, /deposit_transaction_id UUID/);
  assert.match(migration, /recognized_rent_credit_amount/);
  assert.match(migration, /final_refund_amount <= recommended_refund_amount/);
  assert.match(migration, /'deposit_offset','settlement'/);
  assert.doesNotMatch(migration, /UPDATE\s+(leases|occupancies|rooms|payments|invoices)\b/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i);
});

void test('M5 calculates a lease-anchored short-notice recommendation without rounding drift', () => {
  const quote = buildLeaseExitNoticeQuote({
    exitType: 'resident_early_termination',
    leaseStartDate: '2026-08-28',
    plannedEndDate: '2027-02-28',
    noticeDate: '2026-09-20',
    effectiveDate: '2026-09-28',
    monthlyRateAmount: 1_800_000,
  });
  assert.deepEqual(quote, {
    exitType: 'resident_early_termination',
    noticeDays: 8,
    missingNoticeDays: 6,
    paymentPeriodDays: 30,
    dailyRateAmount: 60_000,
    recommendedShortNoticeCharge: 360_000,
  });
});

void test('M5 preserves the original anchor around month-end and caps missing notice at fourteen days', () => {
  const quote = buildLeaseExitNoticeQuote({
    exitType: 'resident_early_termination',
    leaseStartDate: '2026-01-31',
    plannedEndDate: '2026-07-31',
    noticeDate: '2026-02-10',
    effectiveDate: '2026-02-10',
    monthlyRateAmount: 1_800_000,
  });
  assert.equal(quote.paymentPeriodDays, 28);
  assert.equal(quote.missingNoticeDays, 14);
  assert.equal(quote.recommendedShortNoticeCharge, 900_000);
});

void test('same-day checkout shows the full fourteen-day recommendation for its anchored period', () => {
  const quote = buildLeaseExitNoticeQuote({
    exitType: 'resident_early_termination',
    leaseStartDate: '2026-08-01',
    plannedEndDate: '2027-08-01',
    noticeDate: '2026-09-14',
    effectiveDate: '2026-09-14',
    monthlyRateAmount: 1_800_000,
  });

  assert.equal(quote.noticeDays, 0);
  assert.equal(quote.missingNoticeDays, 14);
  assert.equal(quote.paymentPeriodDays, 30);
  assert.equal(quote.dailyRateAmount, 60_000);
  assert.equal(quote.recommendedShortNoticeCharge, 840_000);
});

void test('normal expiry never creates short-notice charges and cannot precede the planned end', () => {
  const quote = buildLeaseExitNoticeQuote({
    exitType: 'normal_expiry',
    leaseStartDate: '2026-08-28',
    plannedEndDate: '2026-11-28',
    noticeDate: '2026-11-27',
    effectiveDate: '2026-11-28',
    monthlyRateAmount: 1_800_000,
  });
  assert.equal(quote.recommendedShortNoticeCharge, 0);
  assert.equal(quote.missingNoticeDays, 0);
  assert.throws(
    () =>
      buildLeaseExitNoticeQuote({
        exitType: 'normal_expiry',
        leaseStartDate: '2026-08-28',
        plannedEndDate: '2026-11-28',
        noticeDate: '2026-11-01',
        effectiveDate: '2026-11-20',
        monthlyRateAmount: 1_800_000,
      }),
    /cannot occur before/,
  );
});

void test('M5 final settlement recommends refundable rent and deposit as separate components', () => {
  const quote = buildLeaseExitFinancialQuote({
    leaseStartDate: '2026-08-28',
    actualCheckoutDate: '2026-09-27',
    contractRentAmount: 10_800_000,
    monthlyRateAmount: 1_800_000,
    verifiedRentPaymentAmount: 2_800_000,
    existingInvoiceCreditAmount: 0,
    depositLiabilityAmount: 1_800_000,
    documentedDamageAmount: 200_000,
    approvedShortNoticeCharge: 300_000,
    depositRentOffsetAmount: 0,
  });
  assert.equal(quote.verifiedRentPaymentAmount, 2_800_000);
  assert.equal(quote.existingInvoiceCreditAmount, 0);
  assert.equal(quote.recognizedRentCreditAmount, 2_800_000);
  assert.equal(quote.earnedRentAmount, 1_800_000);
  assert.equal(quote.rentRefundableAmount, 700_000);
  assert.equal(quote.refundableDepositAmount, 1_600_000);
  assert.equal(quote.recommendedRefundAmount, 2_300_000);
  assert.equal(quote.amountDue, 0);
});

void test('M5 only offsets deposit against rent through an explicit bounded decision', () => {
  const input = {
    leaseStartDate: '2026-08-28',
    actualCheckoutDate: '2026-09-27',
    contractRentAmount: 10_800_000,
    monthlyRateAmount: 1_800_000,
    verifiedRentPaymentAmount: 1_000_000,
    existingInvoiceCreditAmount: 0,
    depositLiabilityAmount: 1_800_000,
    documentedDamageAmount: 200_000,
    approvedShortNoticeCharge: 0,
  };
  const withoutOffset = buildLeaseExitFinancialQuote({
    ...input,
    depositRentOffsetAmount: 0,
  });
  assert.equal(withoutOffset.rentAmountDueBeforeDepositOffset, 800_000);
  assert.equal(withoutOffset.refundableDepositAmount, 1_600_000);
  assert.equal(withoutOffset.grossAmountDue, 800_000);
  assert.equal(withoutOffset.grossRefundAmount, 1_600_000);
  assert.equal(withoutOffset.recommendedRefundAmount, 800_000);
  assert.equal(withoutOffset.amountDue, 0);

  const withOffset = buildLeaseExitFinancialQuote({
    ...input,
    depositRentOffsetAmount: 800_000,
  });
  assert.equal(withOffset.amountDue, 0);
  assert.equal(withOffset.refundableDepositAmount, 800_000);
  assert.equal(withOffset.grossAmountDue, 0);
  assert.equal(withOffset.grossRefundAmount, 800_000);
  assert.equal(withOffset.recommendedRefundAmount, 800_000);
  assert.throws(
    () => buildLeaseExitFinancialQuote({ ...input, depositRentOffsetAmount: 800_001 }),
    /exceeds the permitted amount/,
  );
});

void test('Stage 3 applies rent offset before damage and exposes damage above the remaining deposit', () => {
  const quote = buildLeaseExitFinancialQuote({
    leaseStartDate: '2026-08-01',
    actualCheckoutDate: '2026-08-31',
    contractRentAmount: 21_600_000,
    monthlyRateAmount: 1_800_000,
    verifiedRentPaymentAmount: 1_400_000,
    existingInvoiceCreditAmount: 0,
    depositLiabilityAmount: 1_000_000,
    documentedDamageAmount: 900_000,
    approvedShortNoticeCharge: 0,
    depositRentOffsetAmount: 400_000,
  });

  assert.equal(quote.rentAmountDueBeforeDepositOffset, 400_000);
  assert.equal(quote.depositRentOffsetAmount, 400_000);
  assert.equal(quote.depositDeductionAmount, 600_000);
  assert.equal(quote.damageAmountDue, 300_000);
  assert.equal(quote.refundableDepositAmount, 0);
  assert.equal(quote.amountDue, 300_000);
});

void test('Stage 3 nets refundable rent against damage due while preserving both gross components', () => {
  const quote = buildLeaseExitFinancialQuote({
    leaseStartDate: '2026-08-01',
    actualCheckoutDate: '2026-08-31',
    contractRentAmount: 21_600_000,
    monthlyRateAmount: 1_800_000,
    verifiedRentPaymentAmount: 2_300_000,
    existingInvoiceCreditAmount: 0,
    depositLiabilityAmount: 200_000,
    documentedDamageAmount: 1_000_000,
    approvedShortNoticeCharge: 0,
    depositRentOffsetAmount: 0,
  });

  assert.equal(quote.rentRefundableAmount, 500_000);
  assert.equal(quote.depositDeductionAmount, 200_000);
  assert.equal(quote.damageAmountDue, 800_000);
  assert.equal(quote.grossRefundAmount, 500_000);
  assert.equal(quote.grossAmountDue, 800_000);
  assert.equal(quote.recommendedRefundAmount, 0);
  assert.equal(quote.amountDue, 300_000);
});
