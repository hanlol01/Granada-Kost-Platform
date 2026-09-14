import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommitOnboardingDto } from '../../src/modules/resident/dto/commit-onboarding.dto';
import { CompleteBookingLeadDto } from '../../src/modules/booking-lead/dto/complete-booking-lead.dto';
import { calculateOnboardingCommercialFromSnapshot } from '../../src/modules/resident/types/onboarding.types';

const basePayload = {
  property_id: '11111111-1111-4111-8111-111111111111',
  room_id: '22222222-2222-4222-8222-222222222222',
  visitor_name: 'Penghuni Durasi Khusus',
  visitor_phone: '081234567890',
  gender: 'female',
  start_date: '2026-09-15',
  term_months: 1,
  billing_cycle: 'monthly',
  payment_plan_type: 'annual_full',
  accepted_terms_version: 'custom-lease-v1',
  dp_verified_amount: 1_950_000,
  security_deposit_funded_amount: 0,
  payment_method: 'bank_transfer',
  pricing_source: 'negotiated',
  agreed_monthly_price: 1_950_000,
  pricing_agreement_reason: 'Sewa singkat selama masa orientasi kampus',
  pricing_variance_acknowledged: false,
};

void test('custom lease onboarding accepts an explicit one-month negotiated agreement', async () => {
  const errors = await validate(plainToInstance(CommitOnboardingDto, basePayload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  assert.deepEqual(errors, []);
});

void test('custom lease onboarding still rejects client-supplied contract totals', async () => {
  const errors = await validate(
    plainToInstance(CommitOnboardingDto, {
      ...basePayload,
      contract_rent_amount: 1,
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  assert.ok(errors.some((error) => error.property === 'contract_rent_amount'));
});

void test('paid booking commitment accepts the same negotiated commercial proposal', async () => {
  const errors = await validate(
    plainToInstance(CompleteBookingLeadDto, {
      property_id: basePayload.property_id,
      start_date: basePayload.start_date,
      term_months: 2,
      billing_cycle: 'monthly',
      payment_plan_type: 'annual_full',
      payment_type: 'booking_fee',
      rent_credit_amount: 1_000_000,
      security_deposit_amount: 0,
      payment_method: 'cash',
      pricing_source: 'negotiated',
      agreed_monthly_price: 1_900_000,
      pricing_agreement_reason: 'Kesepakatan masa tinggal dua bulan',
      pricing_variance_acknowledged: false,
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  assert.deepEqual(errors, []);
});

void test('paid booking materialization preserves its immutable negotiated price snapshot', () => {
  assert.deepEqual(
    calculateOnboardingCommercialFromSnapshot({
      termMonths: 2,
      pricingTier: 'short_stay',
      referenceMonthlyPrice: 1_900_000,
      agreedMonthlyPrice: 1_850_000,
      pricingSource: 'negotiated',
      pricingAgreementReason: 'Kesepakatan masa tinggal dua bulan',
    }),
    {
      contractRent: 3_700_000,
      dpRequired: 925_000,
      depositRequired: 0,
      monthlyRate: 1_850_000,
      referenceMonthlyPrice: 1_900_000,
      pricingTier: 'short_stay',
      pricingSource: 'negotiated',
      pricingAgreementReason: 'Kesepakatan masa tinggal dua bulan',
      varianceAmount: -50_000,
      varianceBasisPoints: -263,
    },
  );
});
