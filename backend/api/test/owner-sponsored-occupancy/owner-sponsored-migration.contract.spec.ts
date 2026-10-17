import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { join } from 'node:path';
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
const optionalDepositMigrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/099_owner_sponsored_optional_security_deposit.sql',
);
const contractDepositSnapshotMigrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/100_security_deposit_contract_snapshot.sql',
);
const negotiatedFeeMigrationPath = resolve(
  process.cwd(),
  'backend/api/src/infrastructure/database/migrations/130_owner_sponsored_negotiated_management_fee.sql',
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

void test('optional Owner-sponsored deposit keeps room rent at zero but permits refundable funding', () => {
  const migration = readFileSync(optionalDepositMigrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '099_owner_sponsored_optional_security_deposit.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(
    migration,
    /commercial_mode = 'owner_sponsored'[\s\S]*OR security_deposit_funded_amount <=/i,
  );
  assert.match(migration, /security_deposit_required_amount = 0/i);
  assert.doesNotMatch(migration, /security_deposit_funded_amount = 0/i);
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});

void test('contract deposit snapshot preserves the 1–2 month policy without changing rent obligations', () => {
  const migration = readFileSync(contractDepositSnapshotMigrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '100_security_deposit_contract_snapshot.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /2 \* contract_rent_amount\) \/ NULLIF\(term_months, 0\)/i);
  assert.match(
    migration,
    /WHEN lease\.commercial_mode = 'owner_sponsored'[\s\S]*snapshot_reference_monthly_price/i,
  );
  assert.match(migration, /ELSE lease\.snapshot_monthly_price/i);
  assert.match(migration, /security_deposit_months/i);
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});

void test('negotiated sponsored fee migration is additive, manifest-bound, and preserves legacy policy terms', () => {
  const migration = readFileSync(negotiatedFeeMigrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '130_owner_sponsored_negotiated_management_fee.sql',
  );

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS management_fee_source/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS management_fee_agreement_note/i);
  assert.match(migration, /SET management_fee_source='property_policy'/i);
  assert.match(migration, /management_fee_source IN \('property_policy','negotiated_snapshot'\)/i);
  assert.match(
    migration,
    /WHEN term\.management_fee_source='negotiated_snapshot'\s+THEN term\.projected_management_fee_amount/i,
  );
  assert.match(migration, /projected\.projected_amount-paid\.verified_paid_amount/i);
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});

void test(
  'negotiated sponsored fee migration applies and replays without repricing a negotiated term',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const dataDirectory = mkdtempSync(join(tmpdir(), 'kostation-owner-fee-pg-'));
    const executable = (name: string) => join(bin, process.platform === 'win32' ? `${name}.exe` : name);
    try {
      const initialized = spawnSync(
        executable('initdb'),
        ['-D', dataDirectory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(initialized.status, 0, 'disposable PostgreSQL initialization failed');

      const migration = readFileSync(negotiatedFeeMigrationPath, 'utf8');
      const proof = `
        CREATE TABLE leases (
          id uuid PRIMARY KEY,
          property_id uuid NOT NULL,
          start_date date NOT NULL,
          term_months integer NOT NULL
        );
        CREATE TABLE onboarding_commitments (
          id uuid PRIMARY KEY,
          commercial_mode text NOT NULL,
          management_fee_mode text NOT NULL
        );
        CREATE TABLE owner_sponsored_lease_terms (
          id uuid PRIMARY KEY,
          property_id uuid NOT NULL,
          lease_id uuid NOT NULL,
          management_fee_mode text NOT NULL,
          snapshot_monthly_management_fee bigint NOT NULL,
          projected_management_fee_amount bigint NOT NULL
        );
        CREATE TABLE property_management_fee_versions (
          id uuid PRIMARY KEY,
          property_id uuid NOT NULL,
          effective_date date NOT NULL,
          monthly_fee_amount bigint NOT NULL
        );
        CREATE TABLE payments (
          id uuid PRIMARY KEY,
          property_id uuid NOT NULL,
          lease_id uuid NOT NULL,
          payment_purpose text NOT NULL,
          payment_status text NOT NULL,
          amount bigint NOT NULL
        );
        CREATE TABLE lease_data_corrections (
          id uuid PRIMARY KEY,
          property_id uuid NOT NULL,
          lease_id uuid NOT NULL,
          created_by_user_id uuid NOT NULL,
          previous_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
          corrected_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
        );
        INSERT INTO leases(id,property_id,start_date,term_months)
        VALUES
          ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-08-01',2),
          ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','2026-08-01',2);
        INSERT INTO onboarding_commitments(id,commercial_mode,management_fee_mode)
        VALUES ('44444444-4444-4444-8444-444444444444','owner_sponsored','charged');
        INSERT INTO owner_sponsored_lease_terms(
          id,property_id,lease_id,management_fee_mode,
          snapshot_monthly_management_fee,projected_management_fee_amount
        ) VALUES (
          '55555555-5555-4555-8555-555555555555',
          '22222222-2222-4222-8222-222222222222',
          '11111111-1111-4111-8111-111111111111','charged',300000,600000
        );
        INSERT INTO property_management_fee_versions(id,property_id,effective_date,monthly_fee_amount)
        VALUES
          ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','2026-08-01',300000),
          ('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','2026-09-01',400000);
        ${migration}
        INSERT INTO onboarding_commitments(
          id,commercial_mode,management_fee_mode,management_fee_source,management_fee_agreement_note
        ) VALUES (
          '88888888-8888-4888-8888-888888888888','owner_sponsored','charged',
          'negotiated_snapshot','Negosiasi biaya untuk masa sewa ini.'
        );
        INSERT INTO owner_sponsored_lease_terms(
          id,property_id,lease_id,management_fee_mode,snapshot_monthly_management_fee,
          projected_management_fee_amount,management_fee_source,management_fee_agreement_note
        ) VALUES (
          '99999999-9999-4999-8999-999999999999',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333','charged',350000,700000,
          'negotiated_snapshot','Negosiasi biaya untuk masa sewa ini.'
        );
        INSERT INTO payments(id,property_id,lease_id,payment_purpose,payment_status,amount)
        VALUES
          ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','management_fee','verified',200000),
          ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','management_fee','pending_confirmation',100000);
        ${migration}
        DO $proof$
        BEGIN
          IF (SELECT management_fee_source FROM owner_sponsored_lease_terms
                WHERE id='55555555-5555-4555-8555-555555555555') <> 'property_policy' THEN
            RAISE EXCEPTION 'OWNER_FEE_LEGACY_SOURCE_NOT_PRESERVED';
          END IF;
          IF (SELECT current_projected_management_fee_amount
                FROM owner_sponsored_management_fee_progress
                WHERE id='55555555-5555-4555-8555-555555555555') <> 700000 THEN
            RAISE EXCEPTION 'OWNER_FEE_LEGACY_POLICY_PROJECTION_CHANGED';
          END IF;
          IF (SELECT current_projected_management_fee_amount
                FROM owner_sponsored_management_fee_progress
                WHERE id='99999999-9999-4999-8999-999999999999') <> 700000 THEN
            RAISE EXCEPTION 'OWNER_FEE_NEGOTIATED_PROJECTION_NOT_FROZEN';
          END IF;
          IF (SELECT verified_paid_amount FROM owner_sponsored_management_fee_progress
                WHERE id='99999999-9999-4999-8999-999999999999') <> 200000 THEN
            RAISE EXCEPTION 'OWNER_FEE_VERIFIED_AMOUNT_MISMATCH';
          END IF;
          IF (SELECT pending_amount FROM owner_sponsored_management_fee_progress
                WHERE id='99999999-9999-4999-8999-999999999999') <> 100000 THEN
            RAISE EXCEPTION 'OWNER_FEE_PENDING_AMOUNT_MISMATCH';
          END IF;
          IF (SELECT remaining_amount FROM owner_sponsored_management_fee_progress
                WHERE id='99999999-9999-4999-8999-999999999999') <> 500000 THEN
            RAISE EXCEPTION 'OWNER_FEE_REMAINING_MUST_EXCLUDE_PENDING';
          END IF;
        END
        $proof$;
      `;
      const executed = spawnSync(executable('postgres'), ['--single', '-D', dataDirectory, 'postgres'], {
        input: proof,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
      assert.equal(executed.status, 0, `disposable migration execution failed: ${executed.stderr}`);
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  },
);
