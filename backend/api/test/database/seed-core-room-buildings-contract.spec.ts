import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  CORE_SEED_IDS,
  DEV_COMPLAINT_SEEDS,
  DEV_OCCUPANCY_SEEDS,
  DEV_VEHICLE_SEEDS,
  DEV_WORK_ORDER_SEEDS,
  ROOM_BUILDING_SEEDS,
  ROOM_SEEDS,
} from '../../src/infrastructure/database/seeds/core-seed.data';

const seedPath = resolve(__dirname, '../../src/infrastructure/database/scripts/seed-core.ts');
const buildingMasterPath = resolve(
  __dirname,
  '../../../../docs/05-master-data/room-master/normalized/room_buildings_master.csv',
);
const migrationPath = resolve(
  __dirname,
  '../../src/infrastructure/database/migrations/013_room_inventory.sql',
);

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function masterBuildings() {
  const [header, ...rows] = readFileSync(buildingMasterPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map(parseCsvLine);
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
}

function sourceRegion(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function roomInsertSql(source: string): { sql: string; conflictUpdate: string } {
  const layer5 = sourceRegion(
    source,
    'async function seedLayer5',
    'async function seedComplaintCategories',
  );
  const sql = sourceRegion(layer5, '`INSERT INTO rooms (', '`,\n      [');
  const conflictMarker = 'ON CONFLICT (property_id, number) DO UPDATE';
  const conflictStart = sql.indexOf(conflictMarker);
  assert.notEqual(conflictStart, -1, 'Missing room conflict update');
  return { sql, conflictUpdate: sql.slice(conflictStart) };
}

function assertNoRoomStatusAssignment(conflictUpdate: string): void {
  assert.doesNotMatch(conflictUpdate, /\broom_status\s*=/);
}

function developmentSeedRegion(source: string): string {
  return sourceRegion(
    source,
    'async function seedDevelopmentData',
    'async function seedDevelopmentNotification',
  );
}

function assertLegacyCleanupOrder(source: string): void {
  const developmentSeed = developmentSeedRegion(source);
  const occupancyLoop = developmentSeed.indexOf('for (const occupancy of DEV_OCCUPANCY_SEEDS) {');
  const cleanupNumber = developmentSeed.indexOf("AND number = 'RK-01-01'");
  const cleanupStart = developmentSeed.lastIndexOf('  await client.query(', cleanupNumber);
  const cleanupEnd = developmentSeed.indexOf(
    '\n\n  await seedDevelopmentBilling(client);',
    cleanupStart,
  );

  assert.notEqual(occupancyLoop, -1, 'Missing development occupancy loop');
  assert.notEqual(cleanupNumber, -1, 'Missing RK-01-01 cleanup');
  assert.ok(cleanupStart > occupancyLoop, 'RK-01-01 cleanup must follow occupancy move loop');
  assert.match(developmentSeed.slice(occupancyLoop, cleanupStart), /\n  }\s*$/);
  assert.match(
    developmentSeed.slice(cleanupStart, cleanupEnd),
    /NOT EXISTS \([\s\S]*?occupancy_status = 'active'[\s\S]*?end_date IS NULL/,
  );
}

function moveLegacyCleanupBeforeOccupancyLoop(source: string): string {
  const developmentSeed = developmentSeedRegion(source);
  const occupancyLoop = developmentSeed.indexOf('for (const occupancy of DEV_OCCUPANCY_SEEDS) {');
  const cleanupNumber = developmentSeed.indexOf("AND number = 'RK-01-01'");
  const cleanupStart = developmentSeed.lastIndexOf('  await client.query(', cleanupNumber);
  const cleanupEnd = developmentSeed.indexOf(
    '\n\n  await seedDevelopmentBilling(client);',
    cleanupStart,
  );
  const cleanup = developmentSeed.slice(cleanupStart, cleanupEnd);
  const withoutCleanup = `${developmentSeed.slice(0, cleanupStart)}${developmentSeed.slice(cleanupEnd)}`;
  const mutatedDevelopmentSeed = `${withoutCleanup.slice(0, occupancyLoop)}${cleanup}\n\n${withoutCleanup.slice(occupancyLoop)}`;
  return source.replace(developmentSeed, mutatedDevelopmentSeed);
}

function invoiceConflictUpdate(source: string): string {
  const billingSeed = sourceRegion(
    source,
    'async function seedDevelopmentBilling',
    'async function validateSeed',
  );
  return sourceRegion(
    billingSeed,
    'ON CONFLICT (billing_period_id, occupancy_id) DO UPDATE',
    'RETURNING id`',
  );
}

function assertInvoiceRoomConsistency(source: string): void {
  assert.match(invoiceConflictUpdate(source), /\broom_id\s*=\s*EXCLUDED\.room_id\b/);
  const validation = sourceRegion(
    source,
    'async function validateDevelopmentSeed',
    'async function main',
  );
  assert.match(
    validation,
    /'DEV-BILLING-06 invoice occupancy room mismatch'[\s\S]*?JOIN occupancies ON occupancies\.id = invoices\.occupancy_id[\s\S]*?billing_periods\.period_key = \$2[\s\S]*?invoices\.occupancy_id = ANY\(\$3::uuid\[\]\)[\s\S]*?invoices\.room_id <> occupancies\.room_id/,
  );
  assert.match(validation, /\['DEV-BILLING-06 invoice occupancy room mismatch', 0\]/);
}

test('building seed is the exact normalized 26-building master', () => {
  const expected = masterBuildings().map((row) => ({
    category: row.category,
    buildingCode: row.building_code,
    buildingName: row.building_name,
    genderPolicy: row.gender_policy === 'putra' ? 'male' : 'female',
    totalRooms: Number(row.total_rooms),
    floorACount: Number(row.floor_a_count),
    floorBCount: Number(row.floor_b_count),
    monthlyPrice: Number(row.monthly_price),
    yearlyPrice: Number(row.yearly_price),
    publicVisible: row.public_visible === 'true',
    notes: row.notes,
  }));

  assert.deepEqual(ROOM_BUILDING_SEEDS, expected);
  assert.equal(ROOM_BUILDING_SEEDS.length, 26);
  assert.equal(ROOM_BUILDING_SEEDS.filter(({ category }) => category === 'rukost').length, 16);
  assert.equal(ROOM_BUILDING_SEEDS.filter(({ category }) => category === 'apartkost').length, 10);
  assert.equal(
    ROOM_BUILDING_SEEDS.reduce((total, building) => total + building.totalRooms, 0),
    163,
  );
  assert.equal(
    ROOM_BUILDING_SEEDS.every(
      (building) => building.totalRooms === building.floorACount + building.floorBCount,
    ),
    true,
  );
});

test('room seeds derive category totals and normalized gender from buildings', () => {
  assert.equal(ROOM_SEEDS.length, 163);
  for (const building of ROOM_BUILDING_SEEDS) {
    const rooms = ROOM_SEEDS.filter(({ unitCode }) => unitCode === building.buildingCode);
    assert.equal(rooms.length, building.totalRooms, building.buildingCode);
    assert.equal(
      rooms.every(({ genderPolicy }) => genderPolicy === building.genderPolicy),
      true,
    );
  }
  assert.equal(
    ROOM_BUILDING_SEEDS.find(
      ({ category, buildingCode }) => category === 'rukost' && buildingCode === '01',
    )?.genderPolicy,
    'male',
  );
  assert.equal(
    ROOM_BUILDING_SEEDS.find(
      ({ category, buildingCode }) => category === 'rukost' && buildingCode === '16',
    )?.genderPolicy,
    'male',
  );
});

test('buildings are upserted before rooms without replacing existing IDs', () => {
  const source = readFileSync(seedPath, 'utf8');
  const buildingCall = source.indexOf('await seedRoomBuildings(client);');
  const roomCall = source.indexOf('await seedLayer5(client);');
  const buildingBlock = source.slice(
    source.indexOf('async function seedRoomBuildings'),
    source.indexOf('async function seedLayer5'),
  );

  assert.ok(buildingCall >= 0 && roomCall > buildingCall);
  assert.match(buildingBlock, /INSERT INTO room_buildings \(/);
  assert.match(buildingBlock, /ON CONFLICT \(property_id, category, building_code\) DO UPDATE/);
  assert.doesNotMatch(buildingBlock, /\bid\s*=\s*EXCLUDED\.id\b/);
});

test('room insert and conflict update align authoritative building fields without lifecycle reset', () => {
  const source = readFileSync(seedPath, 'utf8');
  const { sql: roomBlock, conflictUpdate } = roomInsertSql(source);

  assert.match(roomBlock, /INSERT INTO rooms \([\s\S]*?building_id/);
  assert.match(roomBlock, /INSERT INTO rooms \([\s\S]*?category/);
  assert.match(
    roomBlock,
    /JOIN room_buildings building[\s\S]*?building\.property_id = room_types\.property_id/,
  );
  assert.match(roomBlock, /building\.building_code = \$3/);
  assert.match(roomBlock, /building\.gender_policy = \$4/);
  assert.match(
    roomBlock,
    /ON CONFLICT \(property_id, number\) DO UPDATE[\s\S]*?building_id = EXCLUDED\.building_id[\s\S]*?category = EXCLUDED\.category[\s\S]*?gender_policy = EXCLUDED\.gender_policy/,
  );
  assertNoRoomStatusAssignment(conflictUpdate);
  assert.doesNotMatch(roomBlock, /import_source|occupancy_status/);

  const mutatedConflict = conflictUpdate.replace(
    'updated_by_user_id = EXCLUDED.updated_by_user_id',
    "room_status = 'vacant',\n           updated_by_user_id = EXCLUDED.updated_by_user_id",
  );
  assert.notEqual(mutatedConflict, conflictUpdate);
  assert.throws(() => assertNoRoomStatusAssignment(mutatedConflict));
});

test('built-in validation locks building linkage, totals, lifecycle, and gender invariants', () => {
  const source = readFileSync(seedPath, 'utf8');

  for (const contract of [
    "['POST-L5-18 room buildings', 26]",
    "['POST-L5-19 RuKost buildings', 16]",
    "['POST-L5-20 ApartKost buildings', 10]",
    "['POST-L5-21 building declared rooms', 163]",
    "['POST-L5-22 rooms with building', 163]",
    "['POST-L5-23 room building property/category/gender mismatches', 0]",
    "['POST-L5-24 building room total mismatches', 0]",
    "['DEV-03 occupancy count', 8]",
    "['DEV-06 occupied rooms', 8]",
    "['DEV-07 vacant rooms', 155]",
    "['DEV-09 active occupancy count', 8]",
    "['DEV-10 gender compatibility violations', 0]",
  ]) {
    assert.ok(source.includes(contract), contract);
  }
  assert.match(source, /building\.property_id IS DISTINCT FROM room\.property_id/);
  assert.match(source, /building\.category IS DISTINCT FROM room\.category/);
  assert.match(source, /building\.gender_policy IS DISTINCT FROM room\.gender_policy/);
  assert.match(source, /HAVING count\(room\.id\) <> building\.total_rooms/);
});

test('Charlie moves only to a deterministic female seed room', () => {
  const source = readFileSync(seedPath, 'utf8');
  const charlie = DEV_OCCUPANCY_SEEDS.find(
    ({ residentId }) => residentId === CORE_SEED_IDS.devResidents.charlie,
  );
  const room = ROOM_SEEDS.find(({ number }) => number === charlie?.roomNumber);

  assert.ok(charlie);
  assert.notEqual(charlie.roomNumber, 'RK-01-01');
  assert.equal(charlie.roomNumber, 'RK-03-02');
  assert.equal(room?.genderPolicy, 'female');
  assert.equal(DEV_OCCUPANCY_SEEDS.length, 8);
  assertLegacyCleanupOrder(source);
  assert.throws(() => assertLegacyCleanupOrder(moveLegacyCleanupBeforeOccupancyLoop(source)));
});

test('Charlie downstream fixtures follow the recovered occupancy room', () => {
  const occupancy = DEV_OCCUPANCY_SEEDS.find(
    ({ residentId }) => residentId === CORE_SEED_IDS.devResidents.charlie,
  );
  assert.ok(occupancy);

  const complaints = DEV_COMPLAINT_SEEDS.filter(
    ({ residentId, roomNumber }) =>
      residentId === CORE_SEED_IDS.devResidents.charlie && roomNumber !== undefined,
  );
  assert.equal(complaints.length, 2);
  assert.equal(
    complaints.every(({ roomNumber }) => roomNumber === occupancy.roomNumber),
    true,
  );

  const complaintIds = new Set(complaints.map(({ id }) => id));
  const workOrders = DEV_WORK_ORDER_SEEDS.filter(
    ({ complaintId }) => complaintId !== undefined && complaintIds.has(complaintId),
  );
  assert.equal(workOrders.length, 1);
  assert.equal(
    workOrders.every(({ roomNumber }) => roomNumber === occupancy.roomNumber),
    true,
  );

  const vehicles = DEV_VEHICLE_SEEDS.filter(
    ({ residentId }) => residentId === CORE_SEED_IDS.devResidents.charlie,
  );
  assert.equal(vehicles.length, 1);
  assert.equal(
    vehicles.every(({ roomNumber }) => roomNumber === occupancy.roomNumber),
    true,
  );
});

test('billing reruns keep invoice room aligned with moved occupancy', () => {
  const source = readFileSync(seedPath, 'utf8');
  assertInvoiceRoomConsistency(source);

  const withoutInvoiceRoomUpdate = source.replace(
    '       SET room_id = EXCLUDED.room_id,\n           invoice_code',
    '       SET invoice_code',
  );
  assert.notEqual(withoutInvoiceRoomUpdate, source);
  assert.throws(() => assertInvoiceRoomConsistency(withoutInvoiceRoomUpdate));

  const withoutMismatchValidation = source.replace(
    "'DEV-BILLING-06 invoice occupancy room mismatch'",
    "'DEV-BILLING-06 removed'",
  );
  assert.notEqual(withoutMismatchValidation, source);
  assert.throws(() => assertInvoiceRoomConsistency(withoutMismatchValidation));

  const nonzeroMismatchExpectation = source.replace(
    "['DEV-BILLING-06 invoice occupancy room mismatch', 0]",
    "['DEV-BILLING-06 invoice occupancy room mismatch', 1]",
  );
  assert.notEqual(nonzeroMismatchExpectation, source);
  assert.throws(() => assertInvoiceRoomConsistency(nonzeroMismatchExpectation));
});

test('seed repair does not invoke guarded import apply or change schema ownership', () => {
  const source = readFileSync(seedPath, 'utf8');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.doesNotMatch(
    source,
    /validate-room-inventory-import|--apply|ROOM_INVENTORY_IMPORT_CONFIRM/,
  );
  assert.doesNotMatch(source, /\b(?:ALTER|CREATE|DROP)\s+(?:TABLE|CONSTRAINT|INDEX)\b/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS room_buildings/);
  assert.match(migration, /FOREIGN KEY \(building_id\) REFERENCES room_buildings\(id\)/);
});
