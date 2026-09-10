import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest.ts';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const MIGRATION_PATH =
  'backend/api/src/infrastructure/database/migrations/070_optional_property_owner_assignment_notes.sql';

void test('property owner assignment notes migration is optional and non-destructive', () => {
  const migration = readFileSync(resolve(ROOT, MIGRATION_PATH));
  const sql = migration.toString('utf8');
  const manifestEntry = MIGRATION_MANIFEST.find(
    ({ version }) => version === '070_optional_property_owner_assignment_notes.sql',
  );

  assert.ok(manifestEntry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifestEntry?.checksumSha256);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /building_owner_assignments[\s\S]*ALTER COLUMN reason DROP NOT NULL/);
  assert.match(sql, /room_owner_assignments[\s\S]*ALTER COLUMN reason DROP NOT NULL/);
  assert.match(sql, /reason IS NULL OR length\(btrim\(reason\)\) BETWEEN 3 AND 500/);
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE)\b/i);
  assert.equal(manifestEntry?.sentinels.length, 4);
});
