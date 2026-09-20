import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const file = '093_editable_contract_settlement_deadline.sql';
const root = join(import.meta.dirname, '..', '..');
const migration = readFileSync(join(root, 'src', 'infrastructure', 'database', 'migrations', file), 'utf8');

void test('editable settlement deadline migration is manifest-bound and auditable', () => {
  const entry = MIGRATION_MANIFEST.find((candidate) => candidate.version === file);
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.match(migration, /lease_settlement_deadline_alignment_history/);
  assert.match(migration, /lease_settlement_extension_edit_history/);
  assert.match(migration, /LEAST\(snapshot\.term_months, 3\)/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON lease_settlement_extensions/);
  assert.match(migration, /BEFORE DELETE ON lease_settlement_extensions/);
  assert.doesNotMatch(migration, /extension_due_at > original_due_at/);
  assert.doesNotMatch(migration, /extension_due_at <= original_due_at/);
});
