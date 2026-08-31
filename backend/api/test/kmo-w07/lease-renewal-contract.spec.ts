import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { LeaseRenewalScheduler } from '../../src/modules/lease/lease-renewal.scheduler';
import { LeaseRenewalService } from '../../src/modules/lease/lease-renewal.service';

const root = resolve(__dirname, '../..');
async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

test('W07C wiring exports renewal service and scheduler', () => {
  assert.equal(typeof LeaseRenewalService, 'function');
  assert.equal(typeof LeaseRenewalScheduler, 'function');
});

test('W07C migration creates distinct successor linkage and preserves occupancy authority', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/039_lease_renewal_w07c.sql',
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS renewed_from_lease_id/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_renewal_commands/);
  assert.match(migration, /state IN \('draft', 'approved', 'activated', 'cancelled', 'failed'\)/);
  // Canonical occupancy authority is preserved: the global occupancy uniqueness
  // constraint must NOT be dropped, because renewal keeps a distinct occupancy
  // record per lease term instead of sharing one row.
  assert.doesNotMatch(migration, /DROP CONSTRAINT IF EXISTS leases_unique_occupancy/);
  assert.match(migration, /leases_unique_occupancy remains/);
  assert.match(migration, /lease_renewal_commands_open_predecessor/);
  assert.match(migration, /lease_renewal_commands_financial_check/);
  assert.match(migration, /lease_renewal_commands_activation_authorization_check/);
  assert.doesNotMatch(migration, /UPDATE\s+payments/i);
  assert.doesNotMatch(migration, /UPDATE\s+payment_allocations/i);
  assert.doesNotMatch(migration, /UPDATE\s+lease_deposit_transactions/i);
  assert.doesNotMatch(migration, /property_owner_earnings/i);
});

test('W07C migration is registered with stable checksum and sentinels', () => {
  const entry = MIGRATION_MANIFEST.find((item) => item.version === '039_lease_renewal_w07c.sql');
  assert.ok(entry);
  assert.equal(entry.checksumSha256.length, 64);
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('lease_renewal_commands')));
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('renewed_from_lease_id')));
});

test('W07C controller uses Admin-only actor split and keeps owner read-only', async () => {
  const controller = await source('src/modules/lease/lease.controller.ts');
  for (const route of [
    "@Post(':leaseId/renewals')",
    "@Post(':leaseId/renewals/:commandId/approve')",
    "@Post(':leaseId/renewals/:commandId/cancel')",
  ]) {
    const region = controller.slice(controller.indexOf(route), controller.indexOf(route) + 350);
    assert.match(region, /@RequireRoles\('admin'\)/, route);
    assert.match(region, /@RequirePermissions\('lease.manage'\)/, route);
  }
  for (const route of [
    "@Post(':leaseId/renewals/:commandId/financials')",
    "@Post(':leaseId/renewals/:commandId/authorize-activation')",
  ]) {
    const region = controller.slice(controller.indexOf(route), controller.indexOf(route) + 420);
    assert.match(region, /@RequireRoles\('admin'\)/, route);
    assert.match(region, /@RequirePermissions\('lease.manage', 'billing.manage'\)/, route);
  }
});

test('W07C generic activation is explicitly denied for a renewal successor', async () => {
  const activation = await source('src/modules/lease/lease-activation.service.ts');
  assert.match(activation, /renewed_from_lease_id IS NOT NULL/);
  assert.match(activation, /RENEWAL_ACTIVATION_REQUIRES_W07C_COMMAND/);
  assert.ok(
    activation.indexOf('RENEWAL_ACTIVATION_REQUIRES_W07C_COMMAND') <
      activation.indexOf('JOIN onboarding_commitments'),
    'bypass denial must precede the W05-only onboarding join',
  );
});

test('W07C service keeps approval, W06-credit authorization, and cutover distinct', async () => {
  const renewal = await source('src/modules/lease/lease-renewal.service.ts');
  assert.match(renewal, /async createIntent\(/);
  assert.match(renewal, /async approve\(/);
  assert.match(renewal, /async prepareFinancials\(/);
  assert.match(renewal, /async authorizeActivation\(/);
  assert.match(renewal, /async executeAuthorizedRenewal\(/);
  assert.match(renewal, /payment\.payment_purpose IN \('dp','rent'\)/);
  assert.match(renewal, /payment\.payment_status='verified'/);
  assert.match(renewal, /Number\(row\.verified_credit\) <= 0/);
  assert.doesNotMatch(renewal, /minimumDpAmount/);
  const approval = renewal.slice(
    renewal.indexOf('async approve('),
    renewal.indexOf('async prepareFinancials('),
  );
  assert.doesNotMatch(approval, /INSERT INTO invoices/);
  const cutover = renewal.slice(renewal.indexOf('private async activateInTransaction'));
  assert.match(cutover, /SET lease_status='ended'/);
  assert.match(cutover, /SET lease_status='active',occupancy_id=\$2/);
  assert.match(cutover, /UPDATE lease_contract_settlements settlement/);
  assert.match(cutover, /final_checkpoint\.checkpoint_code='final_settlement'/);
  assert.match(cutover, /original_due_at=\$2/);
  assert.match(cutover, /RENEWAL_CONTRACT_SETTLEMENT_POLICY_INCOMPLETE/);
  assert.doesNotMatch(cutover, /UPDATE rooms SET room_status='vacant'/);
  // Distinct contiguous occupancy records: the predecessor occupancy is closed
  // and a new successor occupancy is opened in the same transaction.
  assert.match(cutover, /UPDATE occupancies\s+SET occupancy_status='ended'/);
  assert.match(cutover, /INSERT INTO occupancies\(/);
  assert.match(cutover, /'check_out'/);
  assert.match(cutover, /'check_in'/);
});

test('W07C process and property gates are independent and fail closed', async () => {
  const flags = await source('src/modules/lease/lease-feature.service.ts');
  const scheduler = await source('src/modules/lease/lease-renewal.scheduler.ts');
  const config = await source('src/infrastructure/config/configuration.ts');
  assert.match(flags, /assertRenewalEnabled/);
  assert.match(flags, /lease_renewal_scheduler/);
  assert.match(scheduler, /renewalSchedulerEnabledPropertyIds/);
  assert.match(scheduler, /financial_prepared_at IS NOT NULL/);
  assert.match(scheduler, /activation_authorized_at IS NOT NULL/);
  assert.match(config, /LEASE_RENEWAL_SCHEDULER_PROCESS_ENABLED/);
});
