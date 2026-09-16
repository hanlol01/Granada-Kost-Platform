import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const servicePath = new URL(
  '../../src/modules/lease/lease-data-correction.service.ts',
  import.meta.url,
);
const controllerPath = new URL('../../src/modules/lease/lease.controller.ts', import.meta.url);
const residentRepositoryPath = new URL(
  '../../src/modules/resident/repositories/resident.repository.ts',
  import.meta.url,
);
const migrationPath = new URL(
  '../../src/infrastructure/database/migrations/086_lease_data_correction_authority.sql',
  import.meta.url,
);

test('lease correction is Admin-only, previewable, and committed with idempotency', async () => {
  const [controller, service] = await Promise.all([
    readFile(controllerPath, 'utf8'),
    readFile(servicePath, 'utf8'),
  ]);
  assert.match(controller, /@Post\(':leaseId\/data-correction\/preview'\)/);
  assert.match(controller, /@Get\(':leaseId\/data-corrections'\)/);
  assert.match(controller, /@Post\(':leaseId\/data-correction'\)/);
  assert.match(controller, /@RequireRoles\('admin'\)/);
  assert.match(controller, /@RequirePermissions\('lease\.manage'\)/);
  assert.match(service, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(service, /request_fingerprint/);
});

test('a check-in-only correction preserves the commercial snapshot', async () => {
  const service = await readFile(servicePath, 'utf8');
  assert.match(service, /if \(!periodChanged && !pricingChanged\)/);
  assert.match(service, /corrected = \{ \.\.\.previous, checkedInDate \}/);
  assert.match(service, /must not silently re-price the contract/);
  assert.match(
    service,
    /snapshot_monthly_price=CASE WHEN \$13 THEN \$5 ELSE snapshot_monthly_price END/,
  );
  assert.match(service, /pricing_agreed_at=CASE WHEN \$13 THEN now\(\) ELSE pricing_agreed_at END/);
});

test('legacy check-in display falls back to history then occupancy, never the current date', async () => {
  const repository = await readFile(residentRepositoryPath, 'utf8');
  assert.match(
    repository,
    /lifecycle\.checked_in_at[\s\S]*?check_in_history\.event_date[\s\S]*?occupancy\.start_date/,
  );
  const projection = repository.match(/COALESCE\([\s\S]{0,700}?\) AS checked_in_at/)?.[0] ?? '';
  assert.ok(projection);
  assert.doesNotMatch(projection, /now\(\)/);
  assert.match(repository, /AS checked_in_source/);
});

test('migration keeps correction and invoice-credit evidence append-only', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_data_corrections/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_data_correction_invoice_credits/);
  assert.match(migration, /LEASE_DATA_CORRECTION_APPEND_ONLY/);
  assert.match(migration, /invalidated_by_lease_correction_id/);
});
