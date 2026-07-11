import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  dueDateWithinCycle,
  nextBillingStart,
  previousDate,
} from '../../src/modules/lease/lease-date.helper';

const root = resolve(__dirname, '../..');

test('M5 billing date helper uses Jakarta business-date boundaries without future leases', () => {
  assert.equal(nextBillingStart('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextBillingStart('2024-02-29', 'yearly', 29), '2025-02-28');
  assert.equal(previousDate('2026-03-01'), '2026-02-28');
  assert.equal(dueDateWithinCycle('2026-07-20', '2026-08-19', 5), '2026-07-20');
});

test('M5 migration is additive, preserves legacy invoice nullability, and contains no lease backfill', async () => {
  const migration = await readFile(
    resolve(root, 'src/infrastructure/database/migrations/017_lease_system.sql'),
    'utf8',
  );
  for (const table of [
    'leases',
    'lease_history',
    'room_transfer_records',
    'lease_deposit_transactions',
    'idempotency_commands',
    'business_events',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /ALTER COLUMN billing_period_id DROP NOT NULL/);
  assert.match(migration, /lease_id UUID REFERENCES leases/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+leases[\s\S]*SELECT/i);
  assert.doesNotMatch(migration, /UPDATE\s+occupancies\s+SET[\s\S]*lease/i);
});

test('M5 controller keeps financial actions out of admin while retaining owner/manager/admin lease read', async () => {
  const controller = await readFile(resolve(root, 'src/modules/lease/lease.controller.ts'), 'utf8');
  assert.match(controller, /@RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(controller, /@RequirePermissions\('lease.read'\)/);
  assert.match(
    controller,
    /@RequireRoles\('owner', 'manager'\)[\s\S]*?@RequirePermissions\('lease.manage', 'billing.manage'\)[\s\S]*?collectDeposit/,
  );
  assert.match(
    controller,
    /@RequireRoles\('owner', 'manager'\)[\s\S]*?@RequirePermissions\('billing.manage'\)[\s\S]*?settleRefund/,
  );
});

test('M5 service stores only safe lease event and audit payloads', async () => {
  const service = await readFile(resolve(root, 'src/modules/lease/lease.service.ts'), 'utf8');
  assert.match(service, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(service, /IDEMPOTENCY_REQUEST_IN_PROGRESS/);
  assert.match(service, /Idempotency-Key/);
  assert.match(service, /full_name_masked/);
  assert.doesNotMatch(service, /storage_path/);
});
