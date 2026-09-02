import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const root = resolve(__dirname, '../..');
const repositoryRoot = resolve(root, '../..');
const source = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const repositorySource = (relative: string) =>
  readFileSync(resolve(repositoryRoot, relative), 'utf8');

void test('M10 migration inventory and every canonical checksum are release-ready', () => {
  const migrationDirectory = resolve(root, 'src/infrastructure/database/migrations');
  const files = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert.deepEqual(
    files,
    MIGRATION_MANIFEST.map((entry) => entry.version),
  );
  for (const entry of MIGRATION_MANIFEST) {
    const contents = readFileSync(resolve(migrationDirectory, entry.version));
    assert.equal(
      createHash('sha256').update(contents).digest('hex'),
      entry.checksumSha256,
      `${entry.version} checksum drift`,
    );
  }
});

void test('M10 rollout keeps historical settlements on legacy rules and snapshots new contracts', () => {
  const migration = source(
    'src/infrastructure/database/migrations/049_lease_settlement_policy_checkpoints.sql',
  );
  const issuance = source('src/modules/billing/services/contract-schedule-issuance.service.ts');
  const billing = source('src/modules/billing/services/w06-billing.service.ts');
  const activation = source('src/modules/lease/lease-activation.service.ts');
  const scheduler = source(
    'src/modules/billing/services/contract-settlement-lifecycle.scheduler.ts',
  );
  const renewal = source('src/modules/lease/lease-renewal.service.ts');

  assert.match(migration, /Existing leases deliberately receive no backfill/);
  assert.doesNotMatch(migration, /INSERT INTO lease_settlement_policy_snapshots[\s\S]*SELECT/i);
  assert.match(issuance, /SUPPORTED_LEASE_SETTLEMENT_TERMS/);
  assert.match(issuance, /INSERT INTO lease_settlement_policy_snapshots/);
  assert.match(issuance, /INSERT INTO lease_settlement_checkpoints/);
  assert.match(renewal, /contractScheduleIssuance\.issueScheduleInTransaction/);
  assert.match(billing, /policy_snapshot_id IS NULL[\s\S]*legacy_v1/);
  assert.match(billing, /Legacy rows[\s\S]*never silently upgraded/);
  assert.match(activation, /contractSettlement\.policy_snapshot_id[\s\S]*INTERVAL '2 months'/);
  assert.match(scheduler, /settlement\.policy_snapshot_id IS NOT NULL/);
});

void test('M10 Admin and Penghuni display the effective policy version while Owner stays read-only', () => {
  const adminParser = repositorySource('apps/admin/src/lib/admin-billing.ts');
  const adminUi = repositorySource(
    'apps/admin/src/components/residents/ResidentDetailWorkspace.tsx',
  );
  const residentParser = repositorySource('apps/penghuni/src/lib/penghuni-w06-billing.ts');
  const residentUi = repositorySource('apps/penghuni/src/routes/_app/billing.tsx');
  const ownerService = source(
    'src/modules/property-owner-management/property-owner-portal.service.ts',
  );

  for (const contract of [adminParser, residentParser]) {
    assert.match(contract, /policy_version/);
    assert.match(contract, /legacy_v1/);
    assert.match(contract, /lease_settlement_v2/);
  }
  assert.match(adminUi, /Kebijakan kontrak lama \(Legacy V1\)/);
  assert.match(residentUi, /Kebijakan kontrak lama \(Legacy V1\)/);
  assert.match(ownerService, /lease_settlement_v2_current_projection/);
  assert.doesNotMatch(ownerService, /bank_account|payment_proof.*content|password_hash/i);
});
