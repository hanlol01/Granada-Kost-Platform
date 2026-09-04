import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { environmentValidationSchema } from '../../src/infrastructure/config/environment.validation';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { AdminPaymentVerificationPolicyService } from '../../src/modules/billing/services/admin-payment-verification-policy.service';

const sourceRoot = resolve(__dirname, '../..');
const root = existsSync(resolve(sourceRoot, 'src/modules/resident/onboarding.service.ts'))
  ? sourceRoot
  : resolve(process.cwd());
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const propertyId = '20000000-0000-4000-8000-000000000001';

function policy(input: { enabled: boolean; until?: string; propertyIds?: string[] }) {
  return new AdminPaymentVerificationPolicyService(
    new ConfigService({
      billing: {
        adminPaymentAutoVerify: {
          enabled: input.enabled,
          until: input.until,
          propertyIds: input.propertyIds ?? [],
        },
      },
    }),
  );
}

void test('automatic verification expiry remains an ISO string after environment validation', () => {
  const until = '2026-10-31T23:59:59+07:00';
  const { error, value } = environmentValidationSchema.validate({
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    ADMIN_PAYMENT_AUTO_VERIFY_ENABLED: 'true',
    ADMIN_PAYMENT_AUTO_VERIFY_UNTIL: until,
    ADMIN_PAYMENT_AUTO_VERIFY_PROPERTY_IDS: propertyId,
  });

  assert.equal(error, undefined);
  const validatedUntil: unknown = value.ADMIN_PAYMENT_AUTO_VERIFY_UNTIL;
  assert.equal(typeof validatedUntil, 'string');
  if (typeof validatedUntil !== 'string') assert.fail('validated expiry must remain a string');
  assert.equal(new Date(validatedUntil).getTime(), new Date(until).getTime());
});

void test('automatic verification is property-scoped, time-bound, and reversible', () => {
  const service = policy({
    enabled: true,
    until: '2026-10-31T16:59:59.000Z',
    propertyIds: [propertyId],
  });

  assert.deepEqual(
    service.decide(propertyId, 'bank_transfer', new Date('2026-09-03T00:00:00.000Z')),
    {
      status: 'verified',
      automaticallyVerified: true,
      policy: {
        mode: 'automatic_admin_entry',
        automaticVerificationActive: true,
        automaticVerificationUntil: '2026-10-31T16:59:59.000Z',
        requiresActualPaymentDate: true,
        transferEvidenceRequired: false,
      },
    },
  );
  assert.equal(
    service.decide(propertyId, 'bank_transfer', new Date('2026-11-01T00:00:00.000Z')).status,
    'pending_confirmation',
  );
  assert.equal(
    service.decide('30000000-0000-4000-8000-000000000001', 'bank_transfer').status,
    'pending_confirmation',
  );
});

void test('cash remains verified and disabled mode preserves manual bank verification', () => {
  const service = policy({ enabled: false });
  assert.equal(service.decide(propertyId, 'cash').status, 'verified');
  assert.equal(service.decide(propertyId, 'bank_transfer').status, 'pending_confirmation');
  assert.equal(service.current(propertyId).transferEvidenceRequired, true);
});

void test('historical payment date migration is manifest-bound', () => {
  const migration = read(
    'src/infrastructure/database/migrations/062_booking_payment_actual_paid_at.sql',
  );
  const manifest = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '062_booking_payment_actual_paid_at.sql',
  );
  assert.ok(manifest);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifest.checksumSha256);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ/);
  assert.match(migration, /ALTER COLUMN paid_at SET NOT NULL/);
});

void test('Admin entry points keep conditional evidence and actual-payment-date safeguards', () => {
  const onboarding = read('src/modules/resident/onboarding.service.ts');
  const bookingLead = read('src/modules/booking-lead/booking-lead-completion.service.ts');
  const billing = read('src/modules/billing/services/w06-billing.service.ts');

  for (const source of [onboarding, bookingLead, billing]) {
    assert.match(source, /PAYMENT_PAID_AT_REQUIRED/);
  }
  assert.match(onboarding, /payment_evidence_file_ids/);
  assert.match(bookingLead, /payment_evidence_file_ids/);
  assert.match(billing, /evidence_file_ids/);
  assert.match(
    onboarding,
    /const verificationDecision = dto\.booking_lead_id\s*\? normalVerificationDecision/,
  );
  assert.match(
    onboarding,
    /const recordsNewPayment = !leadPaymentCommitment \|\| isBookingFeeLead/,
  );
  assert.match(billing, /item\.method === 'bank_transfer' && item\.status !== 'verified'/);
  assert.match(
    billing,
    /dto\.method === 'bank_transfer' && verificationDecision\.status !== 'verified'/,
  );
  assert.match(billing, /billing\.payment_auto_verified/);
});
