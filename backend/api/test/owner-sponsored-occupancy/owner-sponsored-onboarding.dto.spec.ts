import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommitOnboardingDto } from '../../src/modules/resident/dto/commit-onboarding.dto';

const payload = {
  property_id: '11111111-1111-4111-8111-111111111111',
  room_id: '22222222-2222-4222-8222-222222222222',
  visitor_name: 'Keluarga Pemilik',
  visitor_phone: '081234567890',
  gender: 'female',
  start_date: '2026-09-15',
  term_months: 12,
  commercial_mode: 'owner_sponsored',
  sponsoring_owner_profile_id: '33333333-3333-4333-8333-333333333333',
  management_fee_payer: 'owner',
  owner_sponsorship_reason: 'Anak pemilik menempati kamar selama masa kuliah',
  billing_cycle: 'monthly',
  payment_plan_type: 'monthly_installments',
  accepted_terms_version: 'owner-sponsored-v1',
  dp_verified_amount: 0,
  security_deposit_funded_amount: 0,
  booking_fee_paid_amount: 0,
  payment_method: 'bank_transfer',
};

void test('owner-sponsored onboarding accepts explicit owner authority with zero rent inputs', async () => {
  const errors = await validate(plainToInstance(CommitOnboardingDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  assert.deepEqual(errors, []);
});

void test('owner-sponsored onboarding still rejects client-supplied fee totals', async () => {
  const errors = await validate(
    plainToInstance(CommitOnboardingDto, { ...payload, projected_management_fee_amount: 1 }),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  assert.ok(errors.some((error) => error.property === 'projected_management_fee_amount'));
});
