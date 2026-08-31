import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const migrationVersion = '055_resident_lifecycle_read_model_m7.sql';
const migration = readFileSync(
  new URL(`../../src/infrastructure/database/migrations/${migrationVersion}`, import.meta.url),
  'utf8',
);
const residentRepository = readFileSync(
  new URL('../../src/modules/resident/repositories/resident.repository.ts', import.meta.url),
  'utf8',
);
const residentController = readFileSync(
  new URL('../../src/modules/resident/resident.controller.ts', import.meta.url),
  'utf8',
);
const bookingLeadCompletion = readFileSync(
  new URL('../../src/modules/booking-lead/booking-lead-completion.service.ts', import.meta.url),
  'utf8',
);
const billingService = readFileSync(
  new URL('../../src/modules/billing/services/w06-billing.service.ts', import.meta.url),
  'utf8',
);
const checkoutService = readFileSync(
  new URL('../../src/modules/lease/lease-checkout.service.ts', import.meta.url),
  'utf8',
);
const dashboardRepository = readFileSync(
  new URL('../../src/modules/dashboard/dashboard.repository.ts', import.meta.url),
  'utf8',
);

void test('M7 resident lifecycle migration is manifest-bound and owns one canonical projection', () => {
  const entry = MIGRATION_MANIFEST.find((candidate) => candidate.version === migrationVersion);
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS archive_reason TEXT/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archive_source TEXT/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
  assert.match(migration, /CREATE OR REPLACE VIEW resident_admin_lifecycle_projection AS/);
  assert.match(migration, /THEN 'preactivation_cancelled'/);
  assert.match(migration, /AS lease_expired_admin_action_required/);
});

void test('M7 pre-activation cancellation archives materialized residents with audit metadata', () => {
  assert.match(bookingLeadCompletion, /SET resident_status='archived',archive_reason=\$3/);
  assert.match(bookingLeadCompletion, /archive_source='pre_activation_cancellation'/);
  assert.match(bookingLeadCompletion, /archived_at=now\(\)/);
  assert.doesNotMatch(
    bookingLeadCompletion,
    /SET resident_status='inactive'[\s\S]{0,300}pre_activation_cancellation/,
  );
});

void test('M7 resident reads hide non-operational history by default and expose it explicitly', () => {
  const defaultOperationalPredicate =
    /\$3::text IS NULL AND residents\.resident_status IN \('active','pending_activation'\)/g;
  assert.equal(residentRepository.match(defaultOperationalPredicate)?.length, 2);
  assert.match(residentRepository, /LEFT JOIN resident_admin_lifecycle_projection projection/);
  assert.match(residentRepository, /residents\.resident_status\s*=\s*\$3/);
  assert.match(residentRepository, /projection\.lease_expired_admin_action_required/);

  assert.match(residentController, /lease_expired_admin_action_required/);
  assert.match(residentController, /archive_reason: resident\.archiveReason/);
  assert.match(residentController, /archive_source: resident\.archiveSource/);
  assert.match(residentController, /archived_at: resident\.archivedAt/);
});

void test('M7 resident billing exposes one chronological financial timeline without duplicate ledger refunds', () => {
  assert.match(billingService, /financial_timeline: financialTimelineResult\.rows\.map/);
  assert.match(billingService, /'payment_recorded'::text AS event_type/);
  assert.match(billingService, /'payment_reversed'::text/);
  assert.match(billingService, /'booking_refund'::text/);
  assert.match(billingService, /'invoice_adjustment'::text/);
  assert.match(billingService, /'exit_refund'::text/);
  assert.match(billingService, /deposit\.reversal_id IS NULL/);
  assert.match(billingService, /exit_refund\.deposit_transaction_id=deposit\.id/);
  assert.match(billingService, /ORDER BY timeline\.occurred_at DESC,timeline\.id DESC/);
  assert.match(
    billingService,
    /view === 'admin' \? \(event\.actor_name \?\? 'Sistem'\) : 'Pengelola'/,
  );
});

void test('M7 checkout and dashboard keep resident, room, and reversed money projections synchronized', () => {
  assert.match(checkoutService, /deactivateResidentAfterCheckout/);
  assert.match(checkoutService, /SET resident_status='inactive'/);
  assert.match(
    checkoutService,
    /operational_lease\.lease_status IN \('awaiting_activation','active'\)/,
  );
  assert.match(checkoutService, /room_status='inspection_required'/);
  assert.match(checkoutService, /room_status IN \('inspection_required','maintenance'\)/);

  assert.match(dashboardRepository, /payment_reversal_allocations\.reversed_amount/);
  assert.match(dashboardRepository, /invoices\.total_amount\s+- invoices\.credit_amount/);
  assert.match(dashboardRepository, /resident_status = 'active'/);
});
