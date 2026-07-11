import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { nextJakartaBillingRun } from '../../src/modules/lease/lease-billing.scheduler';
import { nextBillingStart, previousDate } from '../../src/modules/lease/lease-date.helper';

const root = resolve(__dirname, '../..');

test('M6 scheduler targets 00:10 Asia/Jakarta and preserves anchor end-of-month rules', () => {
  assert.equal(nextBillingStart('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextBillingStart('2024-02-29', 'yearly', 29), '2025-02-28');
  assert.equal(previousDate('2024-03-01'), '2024-02-29');

  const beforeRun = nextJakartaBillingRun(new Date('2026-01-01T17:09:00.000Z'));
  assert.equal(beforeRun.toISOString(), '2026-01-01T17:10:00.000Z');
  const exactRun = nextJakartaBillingRun(new Date('2026-01-01T17:10:00.000Z'));
  assert.equal(exactRun.toISOString(), '2026-01-01T17:10:00.000Z');
  const afterRun = nextJakartaBillingRun(new Date('2026-01-01T17:11:00.000Z'));
  assert.equal(afterRun.toISOString(), '2026-01-02T17:10:00.000Z');
});

test('M6 migration is reentrant, deny-by-default, and has no legacy lifecycle backfill', async () => {
  const migration = await readFile(
    resolve(root, 'src/infrastructure/database/migrations/018_lease_m6_runtime.sql'),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS property_feature_flags/);
  assert.match(migration, /admin_ux_read BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /lease_transfer BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /lease_billing_scheduler BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /property_feature_flags_dependency_check/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+leases/i);
  assert.doesNotMatch(migration, /UPDATE\s+occupancies/i);
  assert.doesNotMatch(migration, /UPDATE\s+invoices/i);
});

test('M6 transfer preserves non-financial admin access while financial top-up stays owner/manager only', async () => {
  const controller = await readFile(resolve(root, 'src/modules/lease/lease.controller.ts'), 'utf8');
  const transfer = await readFile(
    resolve(root, 'src/modules/lease/lease-transfer.service.ts'),
    'utf8',
  );
  assert.match(controller, /@RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(
    controller,
    /@Post\(':leaseId\/transfer'\)[\s\S]*?@RequirePermissions\('lease.manage'\)/,
  );
  assert.doesNotMatch(
    controller,
    /@Post\(':leaseId\/transfer'\)[\s\S]{0,220}@RequirePermissions\('lease\.manage', 'billing\.manage'\)/,
  );
  assert.match(transfer, /if \(dto\.top_up\) this\.assertFinancialActor\(user\)/);
  assert.match(
    transfer,
    /Only an owner or manager with billing\.manage may perform a financial transfer top-up/,
  );
});

test('M6 transfer enforces half-open same-day transfer, ordered locks, append-only carry-forward, and safe output', async () => {
  const transfer = await readFile(
    resolve(root, 'src/modules/lease/lease-transfer.service.ts'),
    'utf8',
  );
  assert.match(transfer, /TRANSFER_EFFECTIVE_DATE_MUST_BE_TODAY/);
  assert.match(transfer, /occupancy_status = 'transferred', end_date = \$2::date/);
  assert.match(transfer, /lease_status = 'transferred', end_date = \$2::date/);
  assert.match(transfer, /const uniqueSortedIds = \[\.\.\.new Set\(roomIds\)\]\.sort\(\)/);
  assert.match(transfer, /FOR UPDATE/);
  assert.match(transfer, /transactionType: 'carry_forward',[\s\S]*?direction: 'debit'/);
  assert.match(transfer, /transactionType: 'carry_forward',[\s\S]*?direction: 'credit'/);
  assert.match(transfer, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(transfer, /lease\.transferred:/);
  assert.doesNotMatch(transfer, /ktp_number/);
  assert.doesNotMatch(transfer, /storage_path/);
});

test('M6 scheduler uses advisory lock, SKIP LOCKED, retry-safe invoices, bounded catch-up, and default-off process gate', async () => {
  const scheduler = await readFile(
    resolve(root, 'src/modules/lease/lease-billing.scheduler.ts'),
    'utf8',
  );
  const config = await readFile(
    resolve(root, 'src/infrastructure/config/configuration.ts'),
    'utf8',
  );
  assert.match(scheduler, /pg_try_advisory_lock\(hashtext\(\$1\)\)/);
  assert.match(scheduler, /FOR UPDATE SKIP LOCKED/);
  assert.match(
    scheduler,
    /ON CONFLICT \(lease_id, cycle_start_date\) WHERE lease_id IS NOT NULL DO NOTHING/,
  );
  assert.match(scheduler, /MAX_CATCH_UP_CYCLES = 12/);
  assert.match(scheduler, /lease\.billing_catchup_limit_reached/);
  assert.match(scheduler, /environment === 'staging' \|\| environment === 'production'/);
  assert.match(config, /LEASE_BILLING_SCHEDULER_PROCESS_ENABLED === 'true'/);
});
