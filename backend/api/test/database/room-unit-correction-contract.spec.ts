import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest.ts';
import { ROOM_BUILDING_SEEDS, ROOM_SEEDS } from '../../src/infrastructure/database/seeds/core-seed.data.ts';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

void test('Unit 13/14 correction is represented consistently in runtime seed and normalized master', () => {
  const unit13 = ROOM_BUILDING_SEEDS.find(
    ({ category, buildingCode }) => category === 'rukost' && buildingCode === '13',
  );
  const unit14 = ROOM_BUILDING_SEEDS.find(
    ({ category, buildingCode }) => category === 'rukost' && buildingCode === '14',
  );

  assert.deepEqual(
    {
      unit13: [unit13?.totalRooms, unit13?.genderPolicy],
      unit14: [unit14?.totalRooms, unit14?.genderPolicy],
    },
    { unit13: [6, 'male'], unit14: [11, 'female'] },
  );
  assert.equal(ROOM_SEEDS.filter(({ unitCode }) => unitCode === '13').length, 6);
  assert.equal(ROOM_SEEDS.filter(({ unitCode }) => unitCode === '14').length, 11);

  const normalized = source('docs/05-master-data/room-master/normalized/rooms_master_normalized.csv');
  const correctedRows = normalized
    .split(/\r?\n/)
    .filter((line) => line.startsWith('rukost,13,') || line.startsWith('rukost,14,'));
  assert.equal(correctedRows.filter((line) => line.startsWith('rukost,13,')).length, 6);
  assert.equal(correctedRows.filter((line) => line.startsWith('rukost,14,')).length, 11);
  assert.equal(correctedRows.filter((line) => line.startsWith('rukost,13,') && line.includes(',putra,')).length, 6);
  assert.equal(correctedRows.filter((line) => line.startsWith('rukost,14,') && line.includes(',putri,')).length, 11);
});

void test('Unit 13/14 correction migration is transactional, idempotent, and non-destructive', () => {
  const migration = source(
    'backend/api/src/infrastructure/database/migrations/068_correct_rukost_units_13_14.sql',
  );
  const manifestEntry = MIGRATION_MANIFEST.find(
    ({ version }) => version === '068_correct_rukost_units_13_14.sql',
  );

  assert.ok(manifestEntry);
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /Expected to move 5 rooms/);
  assert.match(migration, /Safe to re-run/);
  assert.doesNotMatch(migration, /\b(?:DELETE|TRUNCATE|DROP)\b/i);
  assert.equal(manifestEntry?.sentinels.length, 2);
  assert.match(manifestEntry?.sentinels[0] ?? '', /RK-13/);
  assert.match(manifestEntry?.sentinels[1] ?? '', /RK-14/);
});
