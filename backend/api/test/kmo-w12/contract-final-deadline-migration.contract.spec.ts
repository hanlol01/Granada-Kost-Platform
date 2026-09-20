import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const file = '091_contract_final_deadline_policy.sql';
const migrationPath = resolve(
  process.cwd(),
  `backend/api/src/infrastructure/database/migrations/${file}`,
);

void test('contract final-deadline correction is manifest-bound and preserves extensions', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const entry = MIGRATION_MANIFEST.find((item) => item.version === file);

  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /term_months BETWEEN 4 AND 120 AND final_settlement_offset_months = 3/i);
  assert.match(migration, /lease_settlement_deadline_policy_revisions/i);
  assert.match(migration, /NOT EXISTS[\s\S]*lease_settlement_extensions/i);
  assert.doesNotMatch(migration, /TRUNCATE|DELETE FROM leases|DROP TABLE/i);
});
