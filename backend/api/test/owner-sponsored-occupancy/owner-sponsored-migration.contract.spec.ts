import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const migrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/087_owner_sponsored_occupancy_authority.sql',
);
const optionalFeeMigrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/092_owner_sponsored_optional_management_fee.sql',
);
const permanentAssignmentMigrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/095_owner_sponsored_permanent_assignment_trigger.sql',
);

void test('owner-sponsored occupancy migration is explicit, additive, and manifest-bound', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '087_owner_sponsored_occupancy_authority.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /commercial_mode IN \('rent','owner_sponsored'\)/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS owner_sponsored_lease_terms/i);
  assert.match(migration, /projected_management_fee_amount BIGINT NOT NULL/i);
  assert.match(migration, /management_fee_payer IN \('resident','owner','other'\)/i);
  assert.match(migration, /payment_purpose.*management_fee/is);
  assert.match(migration, /owner_sponsored.*contract_rent_amount = 0/is);
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});

void test('optional management-fee migration keeps charged and waived authority explicit', () => {
  const migration = readFileSync(optionalFeeMigrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '092_owner_sponsored_optional_management_fee.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /management_fee_mode IN \('charged','waived'\)/i);
  assert.match(
    migration,
    /management_fee_mode='waived'[\s\S]*snapshot_monthly_management_fee = 0/i,
  );
  assert.match(migration, /WHEN term\.management_fee_mode='waived' THEN 'waived'/i);
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});

void test('permanent owner registration migration removes lease-date gates from sponsorship trigger', () => {
  const migration = readFileSync(permanentAssignmentMigrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '095_owner_sponsored_permanent_assignment_trigger.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /CREATE OR REPLACE FUNCTION validate_owner_sponsored_lease_term\(\)/i);
  assert.match(migration, /assignment\.assignment_status='active'/i);
  assert.doesNotMatch(migration, /effective_from|effective_until|scheduled/i);
});
