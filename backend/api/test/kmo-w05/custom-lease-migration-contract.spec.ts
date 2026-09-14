import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const migrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/081_custom_lease_commercial_authority.sql',
);

void test('custom lease migration is additive, legacy-safe, and manifest-bound', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '081_custom_lease_commercial_authority.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS snapshot_reference_monthly_price/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS pricing_source/i);
  assert.match(migration, /'lease_settlement_v2'.*'lease_settlement_v3'/s);
  assert.match(migration, /term_months BETWEEN 1 AND 120/i);
  assert.match(migration, /pricing_source = 'standard'/i);
  assert.match(migration, /attach_contract_paid_commercial_snapshot/i);
  assert.match(migration, /'agreedMonthlyPrice'/i);
  assert.match(migration, /'pricingSource'/i);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS onboarding_commitments_rent_credit_limit_check[\s\S]*ADD CONSTRAINT onboarding_commitments_rent_credit_limit_check[\s\S]*NOT VALID/i,
  );
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS onboarding_commitments_security_deposit_limit_check[\s\S]*ADD CONSTRAINT onboarding_commitments_security_deposit_limit_check[\s\S]*NOT VALID/i,
  );
  assert.match(
    migration,
    /booking_lead_payment_commitments_custom_pricing_snapshot_check CHECK \(\s*contract_rent_amount IS NULL OR \(/i,
  );
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});
