import { existsSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { explicitDatabaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
  override: false,
});

/**
 * Destructive, property-scoped reset for the final MASTER KAMAR KOSTATION
 * workbook. The source workbook itself is intentionally not parsed at runtime:
 * this immutable manifest makes the import reproducible and reviewable.
 */
const WORKBOOK_SHA256 = 'e1d8848fbf30d5197368b3e47881fde8dde36fc8af7b461607f695b553d0dad1';
const DEFAULT_PROPERTY_ID = '20000000-0000-4000-8000-000000000001';

type Category = 'rukost' | 'apartkost';
type Gender = 'male' | 'female';

type BuildingSource = {
  category: Category;
  unit: number;
  roomCount: number;
  gender: Gender;
};

const FINAL_BUILDINGS: readonly BuildingSource[] = [
  { category: 'rukost', unit: 1, roomCount: 11, gender: 'male' },
  { category: 'rukost', unit: 2, roomCount: 8, gender: 'male' },
  { category: 'rukost', unit: 3, roomCount: 8, gender: 'female' },
  { category: 'rukost', unit: 4, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 5, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 6, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 8, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 9, roomCount: 6, gender: 'male' },
  { category: 'rukost', unit: 10, roomCount: 8, gender: 'male' },
  { category: 'rukost', unit: 11, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 12, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 13, roomCount: 11, gender: 'female' },
  { category: 'rukost', unit: 14, roomCount: 6, gender: 'male' },
  { category: 'rukost', unit: 15, roomCount: 6, gender: 'female' },
  { category: 'rukost', unit: 16, roomCount: 7, gender: 'male' },
  { category: 'rukost', unit: 17, roomCount: 10, gender: 'female' },
  { category: 'apartkost', unit: 5, roomCount: 16, gender: 'female' },
  { category: 'apartkost', unit: 18, roomCount: 24, gender: 'male' },
];

type RoomSource = BuildingSource & {
  roomNumber: number;
  buildingCode: string;
  buildingName: string;
  roomCode: string;
};

function categoryPrefix(category: Category): 'RK' | 'AK' {
  return category === 'rukost' ? 'RK' : 'AK';
}

function categoryName(category: Category): 'Rumah Kost' | 'Apart Kost' {
  return category === 'rukost' ? 'Rumah Kost' : 'Apart Kost';
}

function buildRooms(): RoomSource[] {
  return FINAL_BUILDINGS.flatMap((building) => {
    const prefix = categoryPrefix(building.category);
    const paddedUnit = String(building.unit).padStart(2, '0');
    return Array.from({ length: building.roomCount }, (_, index) => {
      const roomNumber = index + 1;
      return {
        ...building,
        roomNumber,
        buildingCode: `${prefix}-${paddedUnit}`,
        buildingName: `${categoryName(building.category)} Unit ${paddedUnit}`,
        roomCode: `${prefix}-${paddedUnit}-${String(roomNumber).padStart(2, '0')}`,
      };
    });
  });
}

const FINAL_ROOMS = buildRooms();

function countWhere<T>(items: readonly T[], predicate: (value: T) => boolean): number {
  return items.filter(predicate).length;
}

const EXPECTED = {
  rooms: FINAL_ROOMS.length,
  buildings: FINAL_BUILDINGS.length,
  rukost: countWhere(FINAL_ROOMS, (room) => room.category === 'rukost'),
  apartkost: countWhere(FINAL_ROOMS, (room) => room.category === 'apartkost'),
  male: countWhere(FINAL_ROOMS, (room) => room.gender === 'male'),
  female: countWhere(FINAL_ROOMS, (room) => room.gender === 'female'),
} as const;

if (
  EXPECTED.rooms !== 163 ||
  EXPECTED.buildings !== 18 ||
  EXPECTED.rukost !== 123 ||
  EXPECTED.apartkost !== 40 ||
  EXPECTED.male !== 112 ||
  EXPECTED.female !== 51
) {
  throw new Error('Final room inventory manifest is internally inconsistent.');
}

type Counts = Record<string, number>;

type ResetReport = {
  mode: 'dry-run' | 'apply';
  timestamp: string;
  propertyId: string;
  workbookSha256: string;
  backupPath?: string;
  ledgerMaintenanceOverride?: boolean;
  before: Counts;
  after?: Counts;
  expected: typeof EXPECTED;
};

function parseArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
}

function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS exists',
    [`public.${table}`],
  );
  return result.rows[0]?.exists === true;
}

async function deleteIfPresent(
  client: PoolClient,
  table: string,
  where: string,
  values: unknown[],
): Promise<number> {
  if (!(await tableExists(client, table))) return 0;
  const result = await client.query(`DELETE FROM ${identifier(table)} WHERE ${where}`, values);
  return result.rowCount ?? 0;
}

async function tableCount(client: PoolClient, table: string, propertyId: string): Promise<number> {
  if (!(await tableExists(client, table))) return 0;
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${identifier(table)} WHERE property_id = $1`,
    [propertyId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function readCounts(client: PoolClient, propertyId: string): Promise<Counts> {
  const tables = [
    'booking_leads',
    'booking_lead_holds',
    'booking_lead_payment_commitments',
    'onboarding_commitments',
    'leases',
    'occupancies',
    'invoices',
    'payments',
    'residents',
    'rooms',
    'room_buildings',
  ];
  const counts: Counts = {};
  for (const table of tables) {
    counts[table] = await tableCount(client, table, propertyId);
  }
  return counts;
}

async function captureTargets(client: PoolClient, propertyId: string): Promise<void> {
  await client.query(
    `CREATE TEMP TABLE reset_target_rooms ON COMMIT DROP AS SELECT id FROM rooms WHERE property_id = $1`,
    [propertyId],
  );
  await client.query(
    `CREATE TEMP TABLE reset_target_residents ON COMMIT DROP AS SELECT id, user_id FROM residents WHERE property_id = $1`,
    [propertyId],
  );
  await client.query(
    `CREATE TEMP TABLE reset_target_leases ON COMMIT DROP AS SELECT id FROM leases WHERE property_id = $1`,
    [propertyId],
  );
  await client.query(
    `CREATE TEMP TABLE reset_target_occupancies ON COMMIT DROP AS SELECT id FROM occupancies WHERE property_id = $1`,
    [propertyId],
  );
  await client.query(
    `CREATE TEMP TABLE reset_target_invoices ON COMMIT DROP AS SELECT id FROM invoices WHERE property_id = $1`,
    [propertyId],
  );
  await client.query(
    `CREATE TEMP TABLE reset_target_payments ON COMMIT DROP AS SELECT id FROM payments WHERE property_id = $1`,
    [propertyId],
  );
  await client.query(
    `CREATE TEMP TABLE reset_target_proofs ON COMMIT DROP AS SELECT id FROM payment_proofs WHERE property_id = $1`,
    [propertyId],
  );
}

/**
 * W06 makes financial records append-only during normal operation. A final
 * inventory reset is an exceptional maintenance operation: it requires an
 * explicit flag, a verified pg_dump, and remains entirely in this transaction.
 * Foreign-key triggers remain enabled while the user triggers are disabled, so
 * referential integrity is still enforced. On any error, rollback restores the
 * original trigger state together with all data.
 */
const LEDGER_MAINTENANCE_TABLES = [
  'payment_reversal_allocations',
  'payment_reversals',
  'payment_receipts',
  'payment_evidence_files',
  'invoice_evidence_files',
  'payment_allocation_intents',
  'payment_allocations',
  'payments',
  'payment_proofs',
  'invoices',
  'lease_installments',
  'lease_deposit_transactions',
] as const;

async function setLedgerMaintenanceMode(client: PoolClient, enabled: boolean): Promise<void> {
  for (const table of LEDGER_MAINTENANCE_TABLES) {
    if (!(await tableExists(client, table))) continue;
    await client.query(
      `ALTER TABLE ${identifier(table)} ${enabled ? 'DISABLE' : 'ENABLE'} TRIGGER USER`,
    );
  }
}

async function deleteOperationalData(client: PoolClient, propertyId: string): Promise<void> {
  // Financial descendants must be removed before invoices, leases, residents, and rooms.
  await deleteIfPresent(client, 'payment_reversal_allocations', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'payment_reversals', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'payment_receipts', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'payment_evidence_files', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'invoice_evidence_files', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'payment_allocation_intents', 'property_id = $1', [propertyId]);
  await deleteIfPresent(
    client,
    'payment_allocations',
    'payment_id IN (SELECT id FROM reset_target_payments)',
    [],
  );
  await deleteIfPresent(
    client,
    'payment_proof_files',
    'payment_proof_id IN (SELECT id FROM reset_target_proofs)',
    [],
  );
  await deleteIfPresent(client, 'payment_proofs', 'property_id = $1', [propertyId]);
  await deleteIfPresent(
    client,
    'late_fee_assessments',
    'invoice_id IN (SELECT id FROM reset_target_invoices)',
    [],
  );
  await deleteIfPresent(client, 'payment_transactions', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'lease_deposit_transactions', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'payments', 'property_id = $1', [propertyId]);
  await deleteIfPresent(
    client,
    'invoice_line_items',
    'invoice_id IN (SELECT id FROM reset_target_invoices)',
    [],
  );
  await deleteIfPresent(client, 'invoices', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'lease_installments', 'property_id = $1', [propertyId]);

  // Operational records that carry room/resident references.
  await deleteIfPresent(client, 'smart_lock_access_logs', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'smart_lock_access_restrictions', 'property_id = $1', [propertyId]);
  await deleteIfPresent(
    client,
    'smart_lock_devices',
    'room_id IN (SELECT id FROM reset_target_rooms)',
    [],
  );
  await deleteIfPresent(client, 'maintenance_work_orders', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'complaint_status_history', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'complaints', 'property_id = $1', [propertyId]);
  await deleteIfPresent(
    client,
    'vehicles',
    'resident_id IN (SELECT id FROM reset_target_residents)',
    [],
  );
  await deleteIfPresent(
    client,
    'resident_emergency_contacts',
    'resident_id IN (SELECT id FROM reset_target_residents)',
    [],
  );
  await deleteIfPresent(client, 'check_out_requests', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'check_in_records', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'occupancy_history', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'room_transfer_records', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'lease_history', 'property_id = $1', [propertyId]);

  // Lead/commitment graph: a lead, hold, payment commitment, onboarding commitment,
  // lease, and occupancy are all separate authorities but all are reset together here.
  await deleteIfPresent(client, 'booking_lead_payment_commitments', 'property_id = $1', [
    propertyId,
  ]);
  await deleteIfPresent(client, 'onboarding_commitments', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'booking_lead_holds', 'property_id = $1', [propertyId]);
  await client.query(`UPDATE leases SET transferred_from_lease_id = NULL WHERE property_id = $1`, [
    propertyId,
  ]);
  await deleteIfPresent(client, 'leases', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'occupancies', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'booking_leads', 'property_id = $1', [propertyId]);

  // Remove residents and only their resident-only accounts. Admin, owner, manager,
  // property content, terms, gallery, commercial categories, and property settings remain.
  await deleteIfPresent(client, 'residents', 'property_id = $1', [propertyId]);
  await deleteIfPresent(
    client,
    'notifications',
    'recipient_user_id IN (SELECT user_id FROM reset_target_residents WHERE user_id IS NOT NULL)',
    [],
  );
  if (await tableExists(client, 'user_property_roles')) {
    await client.query(
      `DELETE FROM user_property_roles upr
       USING roles role, reset_target_residents target
       WHERE upr.user_id = target.user_id
         AND upr.role_id = role.id
         AND role.code = 'resident'`,
    );
  }
  if (await tableExists(client, 'users')) {
    await client.query(
      `DELETE FROM users account
       WHERE account.id IN (SELECT user_id FROM reset_target_residents WHERE user_id IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM user_property_roles upr WHERE upr.user_id = account.id)`,
    );
  }

  await deleteIfPresent(
    client,
    'room_facility_assignments',
    'room_id IN (SELECT id FROM reset_target_rooms)',
    [],
  );
  await deleteIfPresent(client, 'rooms', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'room_buildings', 'property_id = $1', [propertyId]);

  // These records only contain reset-domain correlations; they do not retain a new
  // lifecycle source after the explicit reset.
  await deleteIfPresent(client, 'idempotency_commands', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'business_events', 'property_id = $1', [propertyId]);
  await deleteIfPresent(client, 'audit_logs', 'property_id = $1', [propertyId]);
}

async function insertFinalInventory(client: PoolClient, propertyId: string): Promise<void> {
  const typeRows = await client.query<{
    category: Category;
    room_type_id: string;
    kost_type_id: string;
    monthly_price: number;
    yearly_price: number;
    deposit_amount: number;
  }>(
    `SELECT kost_types.category, room_types.id AS room_type_id, kost_types.id AS kost_type_id,
            kost_types.monthly_price, kost_types.yearly_price, kost_types.deposit_amount
     FROM kost_types
     JOIN room_types ON room_types.property_id = kost_types.property_id
       AND room_types.name = CASE kost_types.category
         WHEN 'rukost' THEN 'RuKost Standard'
         WHEN 'apartkost' THEN 'ApartKost Standard'
       END
     WHERE kost_types.property_id = $1
       AND kost_types.category IN ('rukost', 'apartkost')
       AND kost_types.status = 'active'
       AND kost_types.deleted_at IS NULL`,
    [propertyId],
  );
  if (typeRows.rowCount !== 2 || new Set(typeRows.rows.map((row) => row.category)).size !== 2) {
    throw new Error(
      'Exactly one active commercial + room type authority per category is required.',
    );
  }
  const types = new Map(typeRows.rows.map((row) => [row.category, row]));
  const buildings = new Map<string, string>();

  for (const building of FINAL_BUILDINGS) {
    const prefix = categoryPrefix(building.category);
    const paddedUnit = String(building.unit).padStart(2, '0');
    const type = types.get(building.category);
    if (!type) throw new Error(`Missing commercial authority for ${building.category}`);
    const result = await client.query<{ id: string }>(
      `INSERT INTO room_buildings (
         property_id, category, building_code, building_name, gender_policy, total_rooms,
         floor_a_count, floor_b_count, monthly_price, yearly_price, public_visible, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $6, 0, $7, $8, true, $9)
       RETURNING id`,
      [
        propertyId,
        building.category,
        `${prefix}-${paddedUnit}`,
        `${categoryName(building.category)} Unit ${paddedUnit}`,
        building.gender,
        building.roomCount,
        type.monthly_price,
        type.yearly_price,
        `MASTER KAMAR KOSTATION workbook ${WORKBOOK_SHA256.slice(0, 12)}`,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`Room building insert failed for ${prefix}-${paddedUnit}`);
    buildings.set(`${building.category}:${building.unit}`, id);
  }

  for (const room of FINAL_ROOMS) {
    const type = types.get(room.category);
    const buildingId = buildings.get(`${room.category}:${room.unit}`);
    if (!type || !buildingId) throw new Error(`Source mapping missing for ${room.roomCode}`);
    await client.query(
      `INSERT INTO rooms (
        property_id, room_type_id, category, kost_type_id, building_id, number, unit_code,
        room_code, floor_code, floor_label, gender_policy, monthly_price, yearly_price,
        deposit_amount, room_status, public_visible, import_source, import_source_row, import_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $6, 'A', $8, $9, $10, $11, $12, 'vacant', true, $13, $14, $15)`,
      [
        propertyId,
        type.room_type_id,
        room.category,
        type.kost_type_id,
        buildingId,
        room.roomCode,
        room.buildingCode,
        `Unit ${String(room.unit).padStart(2, '0')}`,
        room.gender,
        type.monthly_price,
        type.yearly_price,
        type.deposit_amount,
        'MASTER KAMAR KOSTATION.xlsx',
        room.roomNumber,
        `Workbook SHA-256 ${WORKBOOK_SHA256}`,
      ],
    );
  }
}

async function verifyFinalInventory(client: PoolClient, propertyId: string): Promise<Counts> {
  const result = await client.query<{
    rooms: string;
    buildings: string;
    rukost: string;
    apartkost: string;
    male: string;
    female: string;
    vacant: string;
    room_codes: string;
  }>(
    `SELECT
      count(*)::text AS rooms,
      (SELECT count(*)::text FROM room_buildings WHERE property_id = $1) AS buildings,
      count(*) FILTER (WHERE category = 'rukost')::text AS rukost,
      count(*) FILTER (WHERE category = 'apartkost')::text AS apartkost,
      count(*) FILTER (WHERE gender_policy = 'male')::text AS male,
      count(*) FILTER (WHERE gender_policy = 'female')::text AS female,
      count(*) FILTER (WHERE room_status = 'vacant')::text AS vacant,
      count(DISTINCT room_code)::text AS room_codes
     FROM rooms WHERE property_id = $1`,
    [propertyId],
  );
  const row = result.rows[0];
  const counts = Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [key, Number(value)]),
  );
  if (
    counts.rooms !== EXPECTED.rooms ||
    counts.buildings !== EXPECTED.buildings ||
    counts.rukost !== EXPECTED.rukost ||
    counts.apartkost !== EXPECTED.apartkost ||
    counts.male !== EXPECTED.male ||
    counts.female !== EXPECTED.female ||
    counts.vacant !== EXPECTED.rooms ||
    counts.room_codes !== EXPECTED.rooms
  ) {
    throw new Error(`Post-reset inventory verification failed: ${JSON.stringify(counts)}`);
  }
  return counts;
}

async function writeReport(report: ResetReport): Promise<void> {
  const path = resolve(
    process.cwd(),
    'artifacts/reset-backups',
    `room-reset-${report.mode}-${Date.now()}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Report written: ${path}`);
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const allowLedgerReset = process.argv.includes('--allow-ledger-reset');
  const propertyId = parseArgument('property-id') ?? DEFAULT_PROPERTY_ID;
  const backupPath = parseArgument('backup');
  assertUuid(propertyId, 'property-id');

  if (apply && !backupPath)
    throw new Error('Refusing reset: provide --backup=<verified pg_dump path>.');
  if (apply && !allowLedgerReset)
    throw new Error(
      'Refusing reset: provide --allow-ledger-reset for the explicit W06 maintenance step.',
    );
  if (apply && backupPath) await access(resolve(backupPath));

  const pool = new Pool({
    ...explicitDatabaseConfigFromEnv(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('kostation:final-room-reset:' || $1))`,
      [propertyId],
    );
    const property = await client.query<{ id: string }>(
      'SELECT id FROM properties WHERE id = $1 FOR UPDATE',
      [propertyId],
    );
    if (property.rowCount !== 1) throw new Error('Target property does not exist.');
    const before = await readCounts(client, propertyId);

    if (!apply) {
      await client.query('ROLLBACK');
      await writeReport({
        mode: 'dry-run',
        timestamp: new Date().toISOString(),
        propertyId,
        workbookSha256: WORKBOOK_SHA256,
        before,
        expected: EXPECTED,
      });
      console.log(JSON.stringify({ mode: 'dry-run', before, expected: EXPECTED }, null, 2));
      return;
    }

    await captureTargets(client, propertyId);
    await setLedgerMaintenanceMode(client, true);
    await deleteOperationalData(client, propertyId);
    await setLedgerMaintenanceMode(client, false);
    await insertFinalInventory(client, propertyId);
    const after = await verifyFinalInventory(client, propertyId);
    await client.query('COMMIT');
    await writeReport({
      mode: 'apply',
      timestamp: new Date().toISOString(),
      propertyId,
      workbookSha256: WORKBOOK_SHA256,
      backupPath,
      ledgerMaintenanceOverride: true,
      before,
      after,
      expected: EXPECTED,
    });
    console.log(JSON.stringify({ mode: 'apply', before, after, expected: EXPECTED }, null, 2));
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
