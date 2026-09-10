import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest.ts';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const MIGRATION_PATH =
  'backend/api/src/infrastructure/database/migrations/071_permanent_property_ownership.sql';

void test('permanent ownership migration permits an immediate same-day release', () => {
  const migration = readFileSync(resolve(ROOT, MIGRATION_PATH));
  const sql = migration.toString('utf8');
  const manifestEntry = MIGRATION_MANIFEST.find(
    ({ version }) => version === '071_permanent_property_ownership.sql',
  );

  assert.ok(manifestEntry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifestEntry?.checksumSha256);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /effective_until IS NULL OR effective_until >= effective_from/g);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE)\b/i);
  assert.equal(manifestEntry?.sentinels.length, 2);
});
