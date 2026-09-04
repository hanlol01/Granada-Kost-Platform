import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const source = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

test('onboarding preserves Booking Fee, DP top-up, and full settlement as distinct payments', () => {
  const onboarding = source('src/modules/resident/onboarding.service.ts');
  const billing = source('src/modules/billing/services/w06-billing.service.ts');

  assert.match(onboarding, /rentPayments,/);
  assert.match(onboarding, /classification: 'booking_fee'/);
  assert.match(onboarding, /if \(isBookingFeeLead && effectiveDpAmount > 0\)/);
  assert.match(
    onboarding,
    /initialRentCredit === contractRent \? 'full_settlement' : 'down_payment'/,
  );
  assert.match(onboarding, /transactionCode: leadPaymentCommitment\.transaction_code/);
  assert.doesNotMatch(onboarding, /dpAmount: initialRentCredit/);

  assert.match(billing, /classification: InitialOnboardingRentPaymentClassification/);
  assert.match(
    billing,
    /payment\.classification === 'full_settlement' \|\|\s*payment\.classification === 'installment'/,
  );
  assert.match(billing, /classification === 'booking_fee'\s*\? 'BOOKING'/);
  assert.match(billing, /classification === 'full_settlement'\s*\? 'LUNAS'/);
  assert.match(billing, /classification === 'installment'\s*\? 'SEWA'/);
  assert.match(billing, /paymentCode\.endsWith\('-BOOKING'\)\) return 'booking_fee'/);
  assert.match(billing, /paymentCode\.endsWith\('-LUNAS'\)[\s\S]*return 'full_settlement'/);
  assert.match(billing, /booking_commitment\.receipt_code AS booking_receipt_code/);
  assert.match(billing, /prior_payment\.payment_code NOT LIKE '%-BOOKING'/);
});

test('full settlement and booking-stage documents use explicit Indonesian identities', () => {
  const booking = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  const billing = source('src/modules/billing/services/w06-billing.service.ts');
  const document = source('src/modules/billing/helpers/billing-document.helper.ts');

  assert.match(booking, /ELSE 'LUNAS'/);
  assert.doesNotMatch(booking, /ELSE 'PELUNASAN-AWAL'/);
  assert.match(booking, /'PELUNASAN SEWA'/);
  assert.match(booking, /'BOOKING FEE \/ TAHAN KAMAR'/);
  assert.match(billing, /KUITANSI PELUNASAN SEWA/);
  assert.match(document, /full_settlement: 'Pelunasan sewa penuh'/);
});
