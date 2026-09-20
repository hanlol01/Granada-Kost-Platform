import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest.ts';

const file = '094_settlement_command_and_correction_repair.sql';
const root = join(import.meta.dirname, '..', '..');
const migration = readFileSync(
  join(root, 'src', 'infrastructure', 'database', 'migrations', file),
  'utf8',
);

void test('settlement command and correction repair is manifest-bound and preserves version history', () => {
  const entry = MIGRATION_MANIFEST.find((candidate) => candidate.version === file);

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /CREATE OR REPLACE FUNCTION validate_lease_settlement_overdue_scope/);
  assert.match(migration, /IF TG_TABLE_NAME = 'lease_payment_promises' THEN/);
  assert.match(migration, /IF TG_TABLE_NAME = 'lease_settlement_notification_ledger' THEN/);
  assert.match(migration, /to_jsonb\(NEW\)->>'recipient_user_id'/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_lease_unique/,
  );
  assert.match(migration, /UNIQUE \(policy_snapshot_id, checkpoint_code\)/);
  assert.match(migration, /UNIQUE \(policy_snapshot_id, checkpoint_sequence\)/);
  assert.doesNotMatch(migration, /DELETE FROM lease_settlement_policy_snapshots/i);
});
