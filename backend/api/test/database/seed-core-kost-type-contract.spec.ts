import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const seedPath = resolve(__dirname, '../../src/infrastructure/database/scripts/seed-core.ts');
const roomInventoryMigrationPath = resolve(
  __dirname,
  '../../src/infrastructure/database/migrations/013_room_inventory.sql',
);
const kostTypeMigrationPath = resolve(
  __dirname,
  '../../src/infrastructure/database/migrations/016_kost_type_revision.sql',
);

test('fresh seed creates exact active kost types before inserting rooms', async () => {
  const source = await readFile(seedPath, 'utf8');

  assert.match(
    source,
    /roomTypeName: 'RuKost Standard',[\s\S]*?category: 'rukost',[\s\S]*?name: 'Rumah Kost',[\s\S]*?slug: 'rukost'/,
  );
  assert.match(
    source,
    /roomTypeName: 'ApartKost Standard',[\s\S]*?category: 'apartkost',[\s\S]*?name: 'Apart Kost',[\s\S]*?slug: 'apartkost'/,
  );
  assert.match(
    source,
    /INSERT INTO kost_types \([\s\S]*?VALUES \(\$1, \$2, \$3, \$4, 1800000, 0, 0, 'active', true, \$5, \$5\)[\s\S]*?ON CONFLICT \(property_id, slug\) DO UPDATE[\s\S]*?deleted_at = NULL/,
  );

  const kostTypeCall = source.indexOf('await seedKostTypes(client);');
  const roomCall = source.indexOf('await seedLayer5(client);');
  assert.ok(kostTypeCall >= 0 && roomCall > kostTypeCall);
});

test('room insert and conflict update preserve room type, category, and kost type alignment', async () => {
  const source = await readFile(seedPath, 'utf8');

  assert.match(
    source,
    /INSERT INTO rooms \([\s\S]*?property_id, room_type_id, category, kost_type_id,[\s\S]*?monthly_price, yearly_price, deposit_amount/,
  );
  assert.match(
    source,
    /JOIN kost_types[\s\S]*?kost_types\.property_id = room_types\.property_id[\s\S]*?kost_types\.category = \$7[\s\S]*?kost_types\.slug = \$7[\s\S]*?kost_types\.status = 'active'[\s\S]*?kost_types\.deleted_at IS NULL/,
  );
  assert.match(
    source,
    /ON CONFLICT \(property_id, number\) DO UPDATE[\s\S]*?room_type_id = EXCLUDED\.room_type_id,[\s\S]*?category = EXCLUDED\.category,[\s\S]*?kost_type_id = EXCLUDED\.kost_type_id/,
  );
});

test('built-in seed validation rejects missing and cross-property/category kost types', async () => {
  const source = await readFile(seedPath, 'utf8');

  assert.match(source, /\['POST-L5-01 total rooms', 163\]/);
  assert.match(
    source,
    /'POST-L5-15 active seed kost types',[\s\S]*?\['POST-L5-15 active seed kost types', 2\]/,
  );
  assert.match(
    source,
    /'POST-L5-16 non-inactive rooms without kost type',[\s\S]*?room_status <> 'inactive'[\s\S]*?kost_type_id IS NULL/,
  );
  assert.match(
    source,
    /'POST-L5-17 room kost type property\/category mismatches',[\s\S]*?kost_type\.property_id IS DISTINCT FROM room\.property_id[\s\S]*?kost_type\.category IS DISTINCT FROM room\.category/,
  );
  assert.match(source, /\['POST-L5-16 non-inactive rooms without kost type', 0\]/);
  assert.match(source, /\['POST-L5-17 room kost type property\/category mismatches', 0\]/);
});

test('repair remains seed-only and relies on the existing migration contracts', async () => {
  const [source, roomInventoryMigration, kostTypeMigration] = await Promise.all([
    readFile(seedPath, 'utf8'),
    readFile(roomInventoryMigrationPath, 'utf8'),
    readFile(kostTypeMigrationPath, 'utf8'),
  ]);

  assert.doesNotMatch(source, /\b(?:ALTER|CREATE|DROP)\s+(?:TABLE|CONSTRAINT|INDEX)\b/i);
  assert.match(roomInventoryMigration, /ADD COLUMN IF NOT EXISTS category TEXT/);
  assert.match(kostTypeMigration, /CREATE TABLE IF NOT EXISTS kost_types/);
  assert.match(kostTypeMigration, /CHECK \(room_status = 'inactive' OR kost_type_id IS NOT NULL\)/);
});
