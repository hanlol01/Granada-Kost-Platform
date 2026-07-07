import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { databaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

type Category = 'rukost' | 'apartkost';
type CsvGender = 'putra' | 'putri';
type DbGender = 'male' | 'female';
type FloorCode = 'A' | 'B';
type CsvRoomStatus = 'vacant' | 'occupied' | 'booked' | 'maintenance' | 'requires_review';
type DbRoomStatus = 'vacant' | 'reserved' | 'occupied' | 'maintenance' | 'inactive' | 'requires_review';
type Verdict = 'PASS' | 'FAIL' | 'PARTIAL' | 'APPLY_REFUSED';
type RunMode = 'dry-run' | 'apply-refused' | 'apply';
type MatchKind = 'exact' | 'inferred_legacy' | 'ambiguous' | 'missing';

type Issue = {
  severity: 'blocking' | 'warning';
  file: string;
  row?: number;
  field?: string;
  message: string;
};

type PiiFinding = {
  file: string;
  row: number;
  field: string;
  reason: string;
};

type ParsedCsv = {
  fileName: string;
  headers: string[];
  rows: Array<{
    lineNumber: number;
    values: Record<string, string>;
  }>;
};

type BuildingCsvRecord = {
  lineNumber: number;
  category: Category;
  buildingCode: string;
  buildingName: string;
  genderPolicy: CsvGender;
  dbGenderPolicy: DbGender;
  totalRooms: number;
  floorACount: number;
  floorBCount: number;
  monthlyPrice: number;
  yearlyPrice: number;
  publicVisible: boolean;
  notes: string;
};

type RoomCsvRecord = {
  lineNumber: number;
  category: Category;
  buildingCode: string;
  roomNumber: number;
  roomCode: string;
  floorCode: FloorCode;
  floorLabel: string;
  genderPolicy: CsvGender;
  dbGenderPolicy: DbGender;
  roomType: string;
  status: CsvRoomStatus;
  dbStatus: DbRoomStatus;
  monthlyPrice: number;
  yearlyPrice: number;
  publicVisible: boolean;
  sourceRow: number | null;
  notes: string;
};

type OccupancyCsvRecord = {
  lineNumber: number;
  category: Category;
  buildingCode: string;
  roomCode: string;
  roomNumber: number;
  floorCode: FloorCode;
  genderPolicy: CsvGender;
  occupancyStatus: CsvRoomStatus;
  dbStatus: DbRoomStatus;
  tenantNameMasked: string;
  tenantGender: CsvGender | null;
  rentalPeriodYears: number | null;
  yearlyRate: number | null;
  downPayment: number | null;
  checkIn: string;
  checkOut: string;
  sourceRow: number | null;
  notes: string;
};

type CsvValidationResult = {
  buildings: BuildingCsvRecord[];
  rooms: RoomCsvRecord[];
  occupancy: OccupancyCsvRecord[];
  issues: Issue[];
  piiFindings: PiiFinding[];
  summary: {
    buildingRows: number;
    roomRows: number;
    occupancyRows: number;
    roomCodeDuplicates: number;
    totalRoomsFromBuildings: number;
    roomsByCategory: Record<Category, number>;
    roomsByGender: Record<CsvGender, number>;
    roomsByCategoryGender: Record<string, number>;
    statuses: Record<string, number>;
  };
};

type DbRoomRow = {
  id: string;
  property_id: string;
  number: string;
  unit_code: string | null;
  gender_policy: string;
  floor: string | null;
  monthly_price: number;
  room_status: DbRoomStatus;
  room_code: string | null;
  category: Category | null;
  floor_code: FloorCode | null;
  floor_label: string | null;
  public_visible: boolean;
  yearly_price: number | null;
  building_id: string | null;
  import_source: string | null;
  import_source_row: number | null;
  import_notes: string | null;
};

type DbBuildingRow = {
  id: string;
  property_id: string;
  category: Category;
  building_code: string;
  building_name: string;
  gender_policy: DbGender;
  total_rooms: number;
  floor_a_count: number;
  floor_b_count: number;
  monthly_price: number;
  yearly_price: number;
  public_visible: boolean;
  notes: string | null;
};

type PropertyRow = {
  id: string;
  name: string;
  room_count: number;
};

type ActiveOccupancyRow = {
  room_id: string;
  resident_gender: DbGender | null;
};

type LegacyKey = {
  category: Category;
  buildingCode: string;
  roomNumber: number;
  floorCode: FloorCode | null;
  source: 'legacy_number' | 'canonical_room_code';
};

type RoomMatch = {
  csv: RoomCsvRecord;
  kind: MatchKind;
  dbRoom?: DbRoomRow;
  candidateCount: number;
  reasons: string[];
};

type ProposedChange = {
  roomCode: string;
  dbRoomNumber?: string;
  fields: string[];
};

type MatchedRoomForApply = {
  roomCode: string;
  dbRoomId: string;
  dbRoomNumber: string;
};

type ManualReviewItem = {
  roomCode?: string;
  dbRoomNumber?: string;
  reason: string;
};

type DbDryRunResult = {
  available: boolean;
  error?: string;
  targetProperty?: {
    id: string;
    name: string;
    reason: string;
  };
  beforeCounts: {
    roomCount: number;
    roomBuildingCount: number;
    roomsWithRoomCode: number;
  };
  afterCounts: {
    roomCount: number;
    roomBuildingCount: number;
    roomsWithRoomCode: number;
  };
  schemaReady: boolean;
  duplicateRoomCodes: number;
  backfillState: 'pre_backfill' | 'partially_backfilled' | 'backfilled_or_mixed' | 'unknown';
  matchSummary: {
    exactMatches: number;
    inferredLegacyMatches: number;
    ambiguousMatches: number;
    missingMatches: number;
    extraDbRows: number;
  };
  proposed: {
    roomBuildingInserts: number;
    roomBuildingUpdates: number;
    roomUpdates: number;
    statusChanges: number;
    genderCorrections: number;
    visibilityChanges: number;
  };
  unmatchedCsvRooms: string[];
  unmatchedDbRooms: string[];
  proposedBuildingInserts: string[];
  matchedRooms: MatchedRoomForApply[];
  roomBuildingConflicts: string[];
  roomConflicts: string[];
  proposedChanges: ProposedChange[];
  manualReview: ManualReviewItem[];
};

type ApplyEligibilityCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

type ApplyResult = {
  attempted: boolean;
  executed: boolean;
  refusedReason?: string;
  actual: {
    roomBuildingInserts: number;
    roomBuildingUpdates: number;
    roomUpdates: number;
  };
  postCounts?: {
    roomCount: number;
    roomBuildingCount: number;
    roomsWithRoomCode: number;
    distinctRoomCodes: number;
  };
};

type CliOptions = {
  apply: boolean;
};

type ReportContext = {
  mode: RunMode;
  runTimestamp: string;
  reportPath: string;
  gitBranch: string;
  gitCommit: string;
  csv: CsvValidationResult;
  db: DbDryRunResult;
  applyEligibility: ApplyEligibilityCheck[];
  applyResult: ApplyResult;
  verdict: Verdict;
};

const repoRoot = existsSync(resolve(process.cwd(), '../../docs')) ? resolve(process.cwd(), '../..') : process.cwd();
const roomMasterDir = resolve(repoRoot, 'docs/05-master-data/room-master/normalized');
const reportsDir = resolve(repoRoot, 'docs/16-room-inventory-booking/reports');

const buildingColumns = [
  'category',
  'building_code',
  'building_name',
  'gender_policy',
  'total_rooms',
  'floor_a_count',
  'floor_b_count',
  'monthly_price',
  'yearly_price',
  'public_visible',
  'notes',
] as const;

const roomColumns = [
  'category',
  'building_code',
  'room_number',
  'room_code',
  'floor_code',
  'floor_label',
  'gender_policy',
  'room_type',
  'status',
  'monthly_price',
  'yearly_price',
  'public_visible',
  'source_row',
  'notes',
] as const;

const occupancyColumns = [
  'category',
  'building_code',
  'room_code',
  'room_number',
  'floor_code',
  'gender_policy',
  'occupancy_status',
  'tenant_name_masked',
  'tenant_gender',
  'rental_period_years',
  'yearly_rate',
  'down_payment',
  'check_in',
  'check_out',
  'source_row',
  'notes',
] as const;

const expectedTotals = {
  buildingRows: 26,
  roomRows: 163,
  occupancyRows: 2,
  rukostBuildings: 16,
  apartkostBuildings: 10,
  totalRooms: 163,
  rukostRooms: 123,
  apartkostRooms: 40,
  putraRooms: 99,
  putriRooms: 64,
  rukostPutra: 75,
  rukostPutri: 48,
  apartkostPutra: 24,
  apartkostPutri: 16,
  monthlyPrice: 1800000,
  yearlyPrice: 21600000,
} as const;

const validCategories = new Set<string>(['rukost', 'apartkost']);
const validCsvGenders = new Set<string>(['putra', 'putri']);
const validFloorCodes = new Set<string>(['A', 'B']);
const validRoomStatuses = new Set<string>(['vacant', 'occupied', 'booked', 'maintenance', 'requires_review']);
const importSource = 'm16-room-master-normalized';
const applyConfirmationValue = 'APPLY_M16_ROOM_INVENTORY';

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const runTimestamp = jakartaTimestamp();
  const csv = await validateCsvFiles();
  const db = await runDbDryRun(csv);
  const applyEligibility = buildApplyEligibility(csv, db);
  const applyResult = await maybeRunApply(options, csv, db, applyEligibility);
  const mode: RunMode = options.apply ? (applyResult.executed || applyResult.attempted ? 'apply' : 'apply-refused') : 'dry-run';
  const verdict = determineVerdict(csv, db, mode, applyResult);
  const reportPath = resolve(reportsDir, reportFileName(mode, runTimestamp.file));
  const context: ReportContext = {
    mode,
    runTimestamp: runTimestamp.display,
    reportPath,
    gitBranch: gitValue(['branch', '--show-current']),
    gitCommit: gitValue(['rev-parse', '--short', 'HEAD']),
    csv,
    db,
    applyEligibility,
    applyResult,
    verdict,
  };

  await writeReport(context);
  printSummary(context);

  if (verdict === 'FAIL' || verdict === 'APPLY_REFUSED') {
    process.exitCode = 1;
  }
}

async function validateCsvFiles(): Promise<CsvValidationResult> {
  const issues: Issue[] = [];
  const piiFindings: PiiFinding[] = [];

  const buildingCsv = await readCsvFile(
    'room_buildings_master.csv',
    resolve(roomMasterDir, 'room_buildings_master.csv'),
    [...buildingColumns],
    issues,
  );
  const roomCsv = await readCsvFile(
    'rooms_master_normalized.csv',
    resolve(roomMasterDir, 'rooms_master_normalized.csv'),
    [...roomColumns],
    issues,
  );
  const occupancyCsv = await readCsvFile(
    'room_occupancy_seed_sanitized.csv',
    resolve(roomMasterDir, 'room_occupancy_seed_sanitized.csv'),
    [...occupancyColumns],
    issues,
  );

  scanPii(buildingCsv, piiFindings);
  scanPii(roomCsv, piiFindings);
  scanPii(occupancyCsv, piiFindings);

  for (const finding of piiFindings) {
    issues.push({
      severity: 'blocking',
      file: finding.file,
      row: finding.row,
      field: finding.field,
      message: `PII scan finding: ${finding.reason}`,
    });
  }

  const buildings = validateBuildings(buildingCsv, issues);
  const rooms = validateRooms(roomCsv, buildings, issues);
  const occupancy = validateOccupancy(occupancyCsv, rooms, buildings, issues);

  return {
    buildings,
    rooms,
    occupancy,
    issues,
    piiFindings,
    summary: buildCsvSummary(buildings, rooms, occupancy),
  };
}

async function readCsvFile(
  fileName: string,
  path: string,
  expectedColumns: string[],
  issues: Issue[],
): Promise<ParsedCsv> {
  const text = await readFile(path, 'utf8');
  const rows = parseCsv(text);
  const [headers = [], ...dataRows] = rows;
  const calendarHeaders = headers.filter((header) => {
    const value = Number(header);
    return Number.isInteger(value) && value >= 1 && value <= 31;
  });

  if (calendarHeaders.length > 0) {
    issues.push({
      severity: 'blocking',
      file: fileName,
      message: `Raw calendar columns are present (${calendarHeaders.length} headers)`,
    });
  }

  const missing = expectedColumns.filter((column) => !headers.includes(column));
  const unexpected = headers.filter((header) => !expectedColumns.includes(header));
  if (missing.length > 0) {
    issues.push({ severity: 'blocking', file: fileName, message: `Missing columns: ${missing.join(', ')}` });
  }
  if (unexpected.length > 0) {
    issues.push({ severity: 'blocking', file: fileName, message: `Unexpected columns: ${unexpected.join(', ')}` });
  }

  return {
    fileName,
    headers,
    rows: dataRows
      .filter((row) => row.some((field) => field.trim() !== ''))
      .map((row, index) => ({
        lineNumber: index + 2,
        values: Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ''])),
      })),
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function validateBuildings(csv: ParsedCsv, issues: Issue[]): BuildingCsvRecord[] {
  const records: BuildingCsvRecord[] = [];
  const seenKeys = new Set<string>();

  if (csv.rows.length !== expectedTotals.buildingRows) {
    addIssue(issues, csv.fileName, `Expected ${expectedTotals.buildingRows} rows, got ${csv.rows.length}`);
  }

  for (const row of csv.rows) {
    const category = enumValue<Category>(row.values.category, validCategories, csv.fileName, row.lineNumber, 'category', issues);
    const genderPolicy = enumValue<CsvGender>(
      row.values.gender_policy,
      validCsvGenders,
      csv.fileName,
      row.lineNumber,
      'gender_policy',
      issues,
    );
    const totalRooms = positiveInteger(row.values.total_rooms, csv.fileName, row.lineNumber, 'total_rooms', issues);
    const floorACount = nonNegativeInteger(row.values.floor_a_count, csv.fileName, row.lineNumber, 'floor_a_count', issues);
    const floorBCount = nonNegativeInteger(row.values.floor_b_count, csv.fileName, row.lineNumber, 'floor_b_count', issues);
    const monthlyPrice = positiveInteger(row.values.monthly_price, csv.fileName, row.lineNumber, 'monthly_price', issues);
    const yearlyPrice = positiveInteger(row.values.yearly_price, csv.fileName, row.lineNumber, 'yearly_price', issues);
    const publicVisible = booleanValue(row.values.public_visible, csv.fileName, row.lineNumber, 'public_visible', issues);
    const buildingCode = row.values.building_code.trim();
    const buildingName = row.values.building_name.trim();

    if (!buildingCode) addIssue(issues, csv.fileName, 'building_code is required', row.lineNumber, 'building_code');
    if (!buildingName) addIssue(issues, csv.fileName, 'building_name is required', row.lineNumber, 'building_name');
    if (totalRooms !== floorACount + floorBCount) {
      addIssue(issues, csv.fileName, 'floor_a_count + floor_b_count must equal total_rooms', row.lineNumber);
    }
    if (monthlyPrice > 0 && monthlyPrice !== expectedTotals.monthlyPrice) {
      addIssue(
        issues,
        csv.fileName,
        `monthly_price differs from expected ${expectedTotals.monthlyPrice}; verify pricing tier documentation`,
        row.lineNumber,
        'monthly_price',
        'warning',
      );
    }
    if (yearlyPrice > 0 && yearlyPrice !== expectedTotals.yearlyPrice) {
      addIssue(
        issues,
        csv.fileName,
        `yearly_price differs from expected ${expectedTotals.yearlyPrice}; verify pricing tier documentation`,
        row.lineNumber,
        'yearly_price',
        'warning',
      );
    }

    if (category && buildingCode) {
      const key = buildingKey(category, buildingCode);
      if (seenKeys.has(key)) {
        addIssue(issues, csv.fileName, `Duplicate category + building_code: ${key}`, row.lineNumber);
      }
      seenKeys.add(key);
    }

    if (isSummaryRow(row.values)) {
      addIssue(issues, csv.fileName, 'Summary/aggregation row detected', row.lineNumber);
    }

    if (category && genderPolicy && totalRooms >= 0 && monthlyPrice >= 0 && yearlyPrice >= 0) {
      records.push({
        lineNumber: row.lineNumber,
        category,
        buildingCode,
        buildingName,
        genderPolicy,
        dbGenderPolicy: mapGender(genderPolicy),
        totalRooms,
        floorACount,
        floorBCount,
        monthlyPrice,
        yearlyPrice,
        publicVisible,
        notes: row.values.notes.trim(),
      });
    }
  }

  const rukostCount = records.filter((record) => record.category === 'rukost').length;
  const apartkostCount = records.filter((record) => record.category === 'apartkost').length;
  const totalRooms = sum(records, (record) => record.totalRooms);
  const rukostRooms = sum(records.filter((record) => record.category === 'rukost'), (record) => record.totalRooms);
  const apartkostRooms = sum(records.filter((record) => record.category === 'apartkost'), (record) => record.totalRooms);

  expectNumber(issues, csv.fileName, 'rukost building count', rukostCount, expectedTotals.rukostBuildings);
  expectNumber(issues, csv.fileName, 'apartkost building count', apartkostCount, expectedTotals.apartkostBuildings);
  expectNumber(issues, csv.fileName, 'sum total_rooms', totalRooms, expectedTotals.totalRooms);
  expectNumber(issues, csv.fileName, 'rukost total_rooms', rukostRooms, expectedTotals.rukostRooms);
  expectNumber(issues, csv.fileName, 'apartkost total_rooms', apartkostRooms, expectedTotals.apartkostRooms);

  return records;
}

function validateRooms(csv: ParsedCsv, buildings: BuildingCsvRecord[], issues: Issue[]): RoomCsvRecord[] {
  const records: RoomCsvRecord[] = [];
  const seenRoomCodes = new Set<string>();
  const buildingsByKey = new Map(buildings.map((building) => [buildingKey(building.category, building.buildingCode), building]));

  if (csv.rows.length !== expectedTotals.roomRows) {
    addIssue(issues, csv.fileName, `Expected ${expectedTotals.roomRows} rows, got ${csv.rows.length}`);
  }

  for (const row of csv.rows) {
    const category = enumValue<Category>(row.values.category, validCategories, csv.fileName, row.lineNumber, 'category', issues);
    const floorCode = enumValue<FloorCode>(row.values.floor_code, validFloorCodes, csv.fileName, row.lineNumber, 'floor_code', issues);
    const genderPolicy = enumValue<CsvGender>(
      row.values.gender_policy,
      validCsvGenders,
      csv.fileName,
      row.lineNumber,
      'gender_policy',
      issues,
    );
    const status = enumValue<CsvRoomStatus>(row.values.status, validRoomStatuses, csv.fileName, row.lineNumber, 'status', issues);
    const roomNumber = positiveInteger(row.values.room_number, csv.fileName, row.lineNumber, 'room_number', issues);
    const monthlyPrice = positiveInteger(row.values.monthly_price, csv.fileName, row.lineNumber, 'monthly_price', issues);
    const yearlyPrice = positiveInteger(row.values.yearly_price, csv.fileName, row.lineNumber, 'yearly_price', issues);
    const publicVisible = booleanValue(row.values.public_visible, csv.fileName, row.lineNumber, 'public_visible', issues);
    const sourceRow = optionalPositiveInteger(row.values.source_row, csv.fileName, row.lineNumber, 'source_row', issues);
    const buildingCode = row.values.building_code.trim();
    const roomCode = row.values.room_code.trim();
    const floorLabel = row.values.floor_label.trim();
    const roomType = row.values.room_type.trim();
    const notes = row.values.notes.trim();

    if (!buildingCode) addIssue(issues, csv.fileName, 'building_code is required', row.lineNumber, 'building_code');
    if (!roomCode) addIssue(issues, csv.fileName, 'room_code is required', row.lineNumber, 'room_code');
    if (!floorLabel) addIssue(issues, csv.fileName, 'floor_label is required', row.lineNumber, 'floor_label');
    if (roomType !== 'standard') {
      addIssue(issues, csv.fileName, `Unexpected room_type "${roomType || '(empty)'}"`, row.lineNumber, 'room_type', 'warning');
    }
    if (roomCode && !/^(RK|AK)-[0-9]{2}[A-Z]?-[AB]-[0-9]{3}$/.test(roomCode)) {
      addIssue(issues, csv.fileName, 'room_code format is invalid', row.lineNumber, 'room_code');
    }
    if (seenRoomCodes.has(roomCode)) {
      addIssue(issues, csv.fileName, `Duplicate room_code detected: ${roomCode}`, row.lineNumber, 'room_code');
    }
    if (roomCode) seenRoomCodes.add(roomCode);
    if (monthlyPrice > 0 && monthlyPrice !== expectedTotals.monthlyPrice) {
      addIssue(issues, csv.fileName, 'monthly_price differs from expected default', row.lineNumber, 'monthly_price', 'warning');
    }
    if (yearlyPrice > 0 && yearlyPrice !== expectedTotals.yearlyPrice) {
      addIssue(issues, csv.fileName, 'yearly_price differs from expected default', row.lineNumber, 'yearly_price', 'warning');
    }
    if (yearlyPrice > 0 && monthlyPrice > 0 && yearlyPrice !== monthlyPrice * 12) {
      addIssue(issues, csv.fileName, 'yearly_price must equal monthly_price * 12', row.lineNumber, 'yearly_price', 'warning');
    }
    if (status && status !== 'vacant' && publicVisible && !notes.toLowerCase().includes('public_visible')) {
      addIssue(issues, csv.fileName, 'Non-vacant room should not be public_visible=true', row.lineNumber, 'public_visible');
    }
    if (isSummaryRow(row.values)) {
      addIssue(issues, csv.fileName, 'Summary/aggregation row detected', row.lineNumber);
    }

    const building = category && buildingCode ? buildingsByKey.get(buildingKey(category, buildingCode)) : undefined;
    if (!building) {
      addIssue(issues, csv.fileName, 'Room references missing building row', row.lineNumber, 'building_code');
    } else if (genderPolicy && building.genderPolicy !== genderPolicy) {
      addIssue(issues, csv.fileName, 'Room gender_policy does not match building gender_policy', row.lineNumber, 'gender_policy');
    }

    if (category && floorCode && genderPolicy && status && roomNumber > 0 && roomCode) {
      records.push({
        lineNumber: row.lineNumber,
        category,
        buildingCode,
        roomNumber,
        roomCode,
        floorCode,
        floorLabel,
        genderPolicy,
        dbGenderPolicy: mapGender(genderPolicy),
        roomType,
        status,
        dbStatus: mapStatus(status),
        monthlyPrice,
        yearlyPrice,
        publicVisible,
        sourceRow,
        notes,
      });
    }
  }

  validateRoomTotals(csv.fileName, records, buildings, issues);
  return records;
}

function validateOccupancy(
  csv: ParsedCsv,
  rooms: RoomCsvRecord[],
  buildings: BuildingCsvRecord[],
  issues: Issue[],
): OccupancyCsvRecord[] {
  const records: OccupancyCsvRecord[] = [];
  const roomsByCode = new Map(rooms.map((room) => [room.roomCode, room]));
  const buildingsByKey = new Map(buildings.map((building) => [buildingKey(building.category, building.buildingCode), building]));

  if (csv.rows.length !== expectedTotals.occupancyRows) {
    addIssue(issues, csv.fileName, `Expected ${expectedTotals.occupancyRows} rows, got ${csv.rows.length}`);
  }

  for (const row of csv.rows) {
    const category = enumValue<Category>(row.values.category, validCategories, csv.fileName, row.lineNumber, 'category', issues);
    const floorCode = enumValue<FloorCode>(row.values.floor_code, validFloorCodes, csv.fileName, row.lineNumber, 'floor_code', issues);
    const genderPolicy = enumValue<CsvGender>(
      row.values.gender_policy,
      validCsvGenders,
      csv.fileName,
      row.lineNumber,
      'gender_policy',
      issues,
    );
    const occupancyStatus = enumValue<CsvRoomStatus>(
      row.values.occupancy_status,
      validRoomStatuses,
      csv.fileName,
      row.lineNumber,
      'occupancy_status',
      issues,
    );
    const tenantGender = row.values.tenant_gender.trim()
      ? enumValue<CsvGender>(row.values.tenant_gender, validCsvGenders, csv.fileName, row.lineNumber, 'tenant_gender', issues)
      : null;
    const roomNumber = positiveInteger(row.values.room_number, csv.fileName, row.lineNumber, 'room_number', issues);
    const rentalPeriodYears = optionalPositiveInteger(
      row.values.rental_period_years,
      csv.fileName,
      row.lineNumber,
      'rental_period_years',
      issues,
    );
    const yearlyRate = optionalPositiveInteger(row.values.yearly_rate, csv.fileName, row.lineNumber, 'yearly_rate', issues);
    const downPayment = optionalNonNegativeInteger(row.values.down_payment, csv.fileName, row.lineNumber, 'down_payment', issues);
    const sourceRow = optionalPositiveInteger(row.values.source_row, csv.fileName, row.lineNumber, 'source_row', issues);
    const buildingCode = row.values.building_code.trim();
    const roomCode = row.values.room_code.trim();
    const tenantNameMasked = row.values.tenant_name_masked.trim();

    if (tenantNameMasked && tenantNameMasked !== '<masked>') {
      addIssue(issues, csv.fileName, 'tenant_name_masked must be empty or exactly <masked>', row.lineNumber, 'tenant_name_masked');
    }

    const room = roomsByCode.get(roomCode);
    if (!room) {
      addIssue(issues, csv.fileName, 'Occupancy row references missing room_code', row.lineNumber, 'room_code');
    } else {
      if (category && room.category !== category) addIssue(issues, csv.fileName, 'category does not match room master', row.lineNumber, 'category');
      if (room.buildingCode !== buildingCode) {
        addIssue(issues, csv.fileName, 'building_code does not match room master', row.lineNumber, 'building_code');
      }
      if (floorCode && room.floorCode !== floorCode) addIssue(issues, csv.fileName, 'floor_code does not match room master', row.lineNumber, 'floor_code');
      if (genderPolicy && room.genderPolicy !== genderPolicy) {
        addIssue(issues, csv.fileName, 'gender_policy does not match room master', row.lineNumber, 'gender_policy');
      }
      if (tenantGender && room.genderPolicy !== tenantGender) {
        addIssue(issues, csv.fileName, 'tenant_gender does not match room/building gender', row.lineNumber, 'tenant_gender');
      }
    }

    if (category && buildingCode && !buildingsByKey.has(buildingKey(category, buildingCode))) {
      addIssue(issues, csv.fileName, 'Occupancy row references missing building row', row.lineNumber, 'building_code');
    }

    if (category && floorCode && genderPolicy && occupancyStatus && roomNumber > 0 && roomCode) {
      records.push({
        lineNumber: row.lineNumber,
        category,
        buildingCode,
        roomCode,
        roomNumber,
        floorCode,
        genderPolicy,
        occupancyStatus,
        dbStatus: mapStatus(occupancyStatus),
        tenantNameMasked,
        tenantGender,
        rentalPeriodYears,
        yearlyRate,
        downPayment,
        checkIn: row.values.check_in.trim(),
        checkOut: row.values.check_out.trim(),
        sourceRow,
        notes: row.values.notes.trim(),
      });
    }
  }

  return records;
}

function validateRoomTotals(fileName: string, rooms: RoomCsvRecord[], buildings: BuildingCsvRecord[], issues: Issue[]): void {
  const byCategory = countBy(rooms, (room) => room.category);
  const byGender = countBy(rooms, (room) => room.genderPolicy);
  const byCategoryGender = countBy(rooms, (room) => `${room.category}:${room.genderPolicy}`);

  expectNumber(issues, fileName, 'room count', rooms.length, expectedTotals.roomRows);
  expectNumber(issues, fileName, 'rukost room count', byCategory.rukost ?? 0, expectedTotals.rukostRooms);
  expectNumber(issues, fileName, 'apartkost room count', byCategory.apartkost ?? 0, expectedTotals.apartkostRooms);
  expectNumber(issues, fileName, 'putra room count', byGender.putra ?? 0, expectedTotals.putraRooms);
  expectNumber(issues, fileName, 'putri room count', byGender.putri ?? 0, expectedTotals.putriRooms);
  expectNumber(issues, fileName, 'rukost putra room count', byCategoryGender['rukost:putra'] ?? 0, expectedTotals.rukostPutra);
  expectNumber(issues, fileName, 'rukost putri room count', byCategoryGender['rukost:putri'] ?? 0, expectedTotals.rukostPutri);
  expectNumber(issues, fileName, 'apartkost putra room count', byCategoryGender['apartkost:putra'] ?? 0, expectedTotals.apartkostPutra);
  expectNumber(issues, fileName, 'apartkost putri room count', byCategoryGender['apartkost:putri'] ?? 0, expectedTotals.apartkostPutri);

  for (const building of buildings) {
    const buildingRooms = rooms.filter(
      (room) => room.category === building.category && room.buildingCode === building.buildingCode,
    );
    const floorA = buildingRooms.filter((room) => room.floorCode === 'A').length;
    const floorB = buildingRooms.filter((room) => room.floorCode === 'B').length;
    const prefix = `${building.category}:${building.buildingCode}`;
    expectNumber(issues, fileName, `${prefix} total_rooms`, buildingRooms.length, building.totalRooms);
    expectNumber(issues, fileName, `${prefix} floor_a_count`, floorA, building.floorACount);
    expectNumber(issues, fileName, `${prefix} floor_b_count`, floorB, building.floorBCount);
  }
}

function scanPii(csv: ParsedCsv, findings: PiiFinding[]): void {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phonePattern = /(?:\+?62|0)8[\d\s().-]{7,16}/;
  const nikPattern = /\b\d{16}\b/;

  for (const row of csv.rows) {
    for (const [field, rawValue] of Object.entries(row.values)) {
      const value = rawValue.trim();
      if (!value) continue;
      if (emailPattern.test(value)) findings.push({ file: csv.fileName, row: row.lineNumber, field, reason: 'email-like value' });
      if (phonePattern.test(value)) findings.push({ file: csv.fileName, row: row.lineNumber, field, reason: 'phone-like value' });
      if (nikPattern.test(value)) findings.push({ file: csv.fileName, row: row.lineNumber, field, reason: 'NIK-like 16-digit value' });

      if (isTenantNameField(field) && value !== '<masked>') {
        findings.push({ file: csv.fileName, row: row.lineNumber, field, reason: 'unmasked tenant/name field' });
      }

      if (field === 'notes' && mentionsTenantContext(value) && hasPersonalNameLikePhrase(value)) {
        findings.push({ file: csv.fileName, row: row.lineNumber, field, reason: 'tenant note contains name-like text' });
      }

      if (
        csv.fileName === 'room_occupancy_seed_sanitized.csv' &&
        isFreeTextField(field) &&
        hasPersonalNameLikePhrase(value)
      ) {
        findings.push({ file: csv.fileName, row: row.lineNumber, field, reason: 'occupancy free-text contains name-like text' });
      }
    }

    const tenantNameMasked = row.values.tenant_name_masked?.trim();
    if (tenantNameMasked && tenantNameMasked !== '<masked>') {
      findings.push({ file: csv.fileName, row: row.lineNumber, field: 'tenant_name_masked', reason: 'unmasked tenant value' });
    }
  }
}

async function runDbDryRun(csv: CsvValidationResult): Promise<DbDryRunResult> {
  const initial: DbDryRunResult = {
    available: false,
    beforeCounts: { roomCount: 0, roomBuildingCount: 0, roomsWithRoomCode: 0 },
    afterCounts: { roomCount: 0, roomBuildingCount: 0, roomsWithRoomCode: 0 },
    schemaReady: false,
    duplicateRoomCodes: 0,
    backfillState: 'unknown',
    matchSummary: {
      exactMatches: 0,
      inferredLegacyMatches: 0,
      ambiguousMatches: 0,
      missingMatches: 0,
      extraDbRows: 0,
    },
    proposed: {
      roomBuildingInserts: 0,
      roomBuildingUpdates: 0,
      roomUpdates: 0,
      statusChanges: 0,
      genderCorrections: 0,
      visibilityChanges: 0,
    },
    unmatchedCsvRooms: [],
    unmatchedDbRooms: [],
    proposedBuildingInserts: [],
    matchedRooms: [],
    roomBuildingConflicts: [],
    roomConflicts: [],
    proposedChanges: [],
    manualReview: [],
  };

  const pool = new Pool(databaseConfigFromEnv());
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    const schemaReady = await hasRoomInventorySchema(client);
    const beforeCounts = await readCounts(client);
    const properties = await readPropertyCandidates(client);
    const targetProperty = inferTargetProperty(properties);

    if (!schemaReady) {
      return {
        ...initial,
        available: true,
        schemaReady,
        beforeCounts,
        afterCounts: await readCounts(client),
        error: 'M16B-3A room inventory schema is not available.',
      };
    }

    if (!targetProperty) {
      return {
        ...initial,
        available: true,
        schemaReady,
        beforeCounts,
        afterCounts: await readCounts(client),
        error: 'Target property could not be inferred from properties/rooms.',
      };
    }

    const rooms = await readRooms(client, targetProperty.id);
    const buildings = await readBuildings(client, targetProperty.id);
    const activeOccupancies = await readActiveOccupancies(client, targetProperty.id);
    const duplicateRoomCodes = await readDuplicateRoomCodeCount(client, targetProperty.id);
    const dryRun = compareDbState(csv, rooms, buildings, activeOccupancies);
    const afterCounts = await readCounts(client);

    return {
      ...dryRun,
      available: true,
      schemaReady,
      targetProperty,
      beforeCounts,
      afterCounts,
      duplicateRoomCodes,
      backfillState: classifyBackfillState(beforeCounts, csv),
    };
  } catch (error) {
    return {
      ...initial,
      error: error instanceof Error ? error.message : 'Unknown DB dry-run error',
    };
  } finally {
    client?.release();
    await pool.end();
  }
}

async function hasRoomInventorySchema(client: PoolClient): Promise<boolean> {
  const requiredRoomColumns = [
    'building_id',
    'category',
    'room_code',
    'floor_code',
    'floor_label',
    'public_visible',
    'yearly_price',
    'import_source',
    'import_source_row',
    'import_notes',
  ];
  const tableResult = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('public.room_buildings') IS NOT NULL AS exists`,
  );
  const columnResult = await client.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'rooms'
       AND column_name = ANY($1::text[])`,
    [requiredRoomColumns],
  );
  const foundColumns = new Set(columnResult.rows.map((row) => row.column_name));
  return Boolean(tableResult.rows[0]?.exists) && requiredRoomColumns.every((column) => foundColumns.has(column));
}

async function readCounts(client: PoolClient): Promise<DbDryRunResult['beforeCounts']> {
  const result = await client.query<{
    room_count: string;
    room_building_count: string;
    rooms_with_room_code: string;
  }>(
    `SELECT
       (SELECT count(*) FROM rooms) AS room_count,
       (SELECT count(*) FROM room_buildings) AS room_building_count,
       (SELECT count(*) FROM rooms WHERE room_code IS NOT NULL) AS rooms_with_room_code`,
  );
  const row = result.rows[0];
  return {
    roomCount: Number(row?.room_count ?? 0),
    roomBuildingCount: Number(row?.room_building_count ?? 0),
    roomsWithRoomCode: Number(row?.rooms_with_room_code ?? 0),
  };
}

async function readPropertyCandidates(client: PoolClient): Promise<PropertyRow[]> {
  const result = await client.query<PropertyRow>(
    `SELECT properties.id,
            properties.name,
            count(rooms.id)::int AS room_count
     FROM properties
     LEFT JOIN rooms ON rooms.property_id = properties.id
     GROUP BY properties.id, properties.name
     ORDER BY count(rooms.id) DESC, properties.created_at ASC`,
  );
  return result.rows;
}

function inferTargetProperty(properties: PropertyRow[]): DbDryRunResult['targetProperty'] | undefined {
  if (properties.length === 1) {
    return { id: properties[0].id, name: properties[0].name, reason: 'single property in DB' };
  }
  const withExpectedRoomCount = properties.filter((property) => property.room_count === expectedTotals.roomRows);
  if (withExpectedRoomCount.length === 1) {
    return { id: withExpectedRoomCount[0].id, name: withExpectedRoomCount[0].name, reason: 'only property with 163 rooms' };
  }
  return undefined;
}

async function readRooms(client: PoolClient, propertyId: string): Promise<DbRoomRow[]> {
  const result = await client.query<DbRoomRow>(
    `SELECT id,
            property_id,
            number,
            unit_code,
            gender_policy,
            floor,
            monthly_price,
            room_status,
            room_code,
            category,
            floor_code,
            floor_label,
            public_visible,
            yearly_price,
            building_id,
            import_source,
            import_source_row,
            import_notes
     FROM rooms
     WHERE property_id = $1
     ORDER BY number`,
    [propertyId],
  );
  return result.rows;
}

async function readBuildings(client: PoolClient, propertyId: string): Promise<DbBuildingRow[]> {
  const result = await client.query<DbBuildingRow>(
    `SELECT id,
            property_id,
            category,
            building_code,
            building_name,
            gender_policy,
            total_rooms,
            floor_a_count,
            floor_b_count,
            monthly_price,
            yearly_price,
            public_visible,
            notes
     FROM room_buildings
     WHERE property_id = $1
     ORDER BY category, building_code`,
    [propertyId],
  );
  return result.rows;
}

async function readActiveOccupancies(client: PoolClient, propertyId: string): Promise<ActiveOccupancyRow[]> {
  const result = await client.query<ActiveOccupancyRow>(
    `SELECT occupancies.room_id,
            residents.gender AS resident_gender
     FROM occupancies
     LEFT JOIN residents ON residents.id = occupancies.resident_id
     WHERE occupancies.property_id = $1
       AND occupancies.occupancy_status = 'active'`,
    [propertyId],
  );
  return result.rows;
}

async function readDuplicateRoomCodeCount(client: PoolClient, propertyId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*) AS count
     FROM (
       SELECT room_code
       FROM rooms
       WHERE property_id = $1
         AND room_code IS NOT NULL
       GROUP BY room_code
       HAVING count(*) > 1
     ) duplicate_room_codes`,
    [propertyId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

function compareDbState(
  csv: CsvValidationResult,
  dbRooms: DbRoomRow[],
  dbBuildings: DbBuildingRow[],
  activeOccupancies: ActiveOccupancyRow[],
): Omit<
  DbDryRunResult,
  'available' | 'error' | 'targetProperty' | 'beforeCounts' | 'afterCounts' | 'schemaReady' | 'duplicateRoomCodes' | 'backfillState'
> {
  const buildingByKey = new Map(dbBuildings.map((building) => [buildingKey(building.category, building.building_code), building]));
  const activeByRoomId = new Map(activeOccupancies.map((occupancy) => [occupancy.room_id, occupancy]));
  const apartkostOrdinals = apartkostLocalOrdinals(csv.rooms);
  const matchedDbIds = new Set<string>();
  const matches: RoomMatch[] = [];
  const proposedChanges: ProposedChange[] = [];
  const manualReview: ManualReviewItem[] = [];
  const matchedRooms: MatchedRoomForApply[] = [];
  const roomBuildingConflicts: string[] = [];
  const roomConflicts: string[] = [];

  for (const room of csv.rooms) {
    const match = matchRoom(room, dbRooms, matchedDbIds, apartkostOrdinals);
    matches.push(match);

    if (match.kind === 'exact' || match.kind === 'inferred_legacy') {
      const dbRoom = match.dbRoom;
      if (!dbRoom) continue;
      matchedDbIds.add(dbRoom.id);
      matchedRooms.push({ roomCode: room.roomCode, dbRoomId: dbRoom.id, dbRoomNumber: dbRoom.number });
      const dbBuilding = buildingByKey.get(buildingKey(room.category, room.buildingCode));
      const fields = changedFields(room, dbRoom, dbBuilding);
      if (fields.length > 0) {
        proposedChanges.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, fields });
      }
      appendManualReviewItems(room, dbRoom, activeByRoomId.get(dbRoom.id), manualReview);
    } else {
      manualReview.push({
        roomCode: room.roomCode,
        reason: match.kind === 'ambiguous' ? `Ambiguous DB match (${match.candidateCount} candidates)` : 'No DB match found',
      });
    }
  }

  const unmatchedDbRooms = dbRooms.filter((room) => !matchedDbIds.has(room.id));
  for (const dbRoom of unmatchedDbRooms) {
    manualReview.push({ dbRoomNumber: dbRoom.number, reason: 'Extra DB room not matched by normalized CSV' });
  }

  const csvBuildingKeys = new Set(csv.buildings.map((building) => buildingKey(building.category, building.buildingCode)));
  const csvRoomCodes = new Set(csv.rooms.map((room) => room.roomCode));
  for (const dbBuilding of dbBuildings) {
    const key = buildingKey(dbBuilding.category, dbBuilding.building_code);
    if (!csvBuildingKeys.has(key)) {
      roomBuildingConflicts.push('Existing room_buildings row is not present in normalized CSV: ' + key);
    }
  }
  for (const dbRoom of dbRooms) {
    if (dbRoom.room_code && !csvRoomCodes.has(dbRoom.room_code)) {
      roomConflicts.push('Existing DB room_code is not present in normalized CSV: ' + dbRoom.room_code);
    }
  }

  const proposedBuildingInsertRecords = csv.buildings.filter(
    (building) => !buildingByKey.has(buildingKey(building.category, building.buildingCode)),
  );
  const proposedBuildingInserts = proposedBuildingInsertRecords.length;
  const proposedBuildingUpdates = csv.buildings.length - proposedBuildingInserts;
  const statusChanges = proposedChanges.filter((change) => change.fields.includes('room_status')).length;
  const genderCorrections = proposedChanges.filter((change) => change.fields.includes('gender_policy')).length;
  const visibilityChanges = proposedChanges.filter((change) => change.fields.includes('public_visible')).length;

  return {
    matchSummary: {
      exactMatches: matches.filter((match) => match.kind === 'exact').length,
      inferredLegacyMatches: matches.filter((match) => match.kind === 'inferred_legacy').length,
      ambiguousMatches: matches.filter((match) => match.kind === 'ambiguous').length,
      missingMatches: matches.filter((match) => match.kind === 'missing').length,
      extraDbRows: unmatchedDbRooms.length,
    },
    proposed: {
      roomBuildingInserts: proposedBuildingInserts,
      roomBuildingUpdates: proposedBuildingUpdates,
      roomUpdates: proposedChanges.length,
      statusChanges,
      genderCorrections,
      visibilityChanges,
    },
    unmatchedCsvRooms: matches
      .filter((match) => match.kind === 'missing' || match.kind === 'ambiguous')
      .map((match) => match.csv.roomCode),
    unmatchedDbRooms: unmatchedDbRooms.map((room) => room.number),
    proposedBuildingInserts: proposedBuildingInsertRecords.map((building) => buildingKey(building.category, building.buildingCode)),
    matchedRooms,
    roomBuildingConflicts,
    roomConflicts,
    proposedChanges,
    manualReview,
  };
}

function matchRoom(
  room: RoomCsvRecord,
  dbRooms: DbRoomRow[],
  usedDbIds: Set<string>,
  apartkostOrdinals: Map<string, number>,
): RoomMatch {
  const exactCandidates = dbRooms.filter((dbRoom) => dbRoom.room_code === room.roomCode && !usedDbIds.has(dbRoom.id));
  if (exactCandidates.length === 1) {
    return { csv: room, kind: 'exact', dbRoom: exactCandidates[0], candidateCount: 1, reasons: ['room_code exact match'] };
  }
  if (exactCandidates.length > 1) {
    return { csv: room, kind: 'ambiguous', candidateCount: exactCandidates.length, reasons: ['multiple room_code matches'] };
  }

  const legacyCandidates = dbRooms.filter((dbRoom) => {
    if (usedDbIds.has(dbRoom.id)) return false;
    const key = legacyKeyForDbRoom(dbRoom);
    if (!key) return false;
    const roomNumberMatches =
      key.roomNumber === room.roomNumber ||
      (room.category === 'apartkost' && key.roomNumber === (apartkostOrdinals.get(room.roomCode) ?? -1));
    return (
      key.category === room.category &&
      key.buildingCode === room.buildingCode &&
      roomNumberMatches &&
      (key.floorCode === null || key.floorCode === room.floorCode)
    );
  });

  const ordinalCandidates = legacyCandidates.length
    ? legacyCandidates
    : dbRooms.filter((dbRoom) => {
        if (usedDbIds.has(dbRoom.id) || room.category !== 'apartkost') return false;
        const key = legacyKeyForDbRoom(dbRoom);
        if (!key) return false;
        return (
          key.category === room.category &&
          key.buildingCode === room.buildingCode &&
          key.roomNumber === (apartkostOrdinals.get(room.roomCode) ?? -1)
        );
      });

  if (ordinalCandidates.length === 1) {
    return {
      csv: room,
      kind: 'inferred_legacy',
      dbRoom: ordinalCandidates[0],
      candidateCount: 1,
      reasons: ['legacy number/category/building/room_number match'],
    };
  }

  if (ordinalCandidates.length > 1) {
    return {
      csv: room,
      kind: 'ambiguous',
      candidateCount: ordinalCandidates.length,
      reasons: ['multiple legacy matches'],
    };
  }

  return { csv: room, kind: 'missing', candidateCount: 0, reasons: ['no exact or deterministic legacy match'] };
}

function apartkostLocalOrdinals(rooms: RoomCsvRecord[]): Map<string, number> {
  const ordinals = new Map<string, number>();
  const grouped = new Map<string, RoomCsvRecord[]>();

  for (const room of rooms) {
    if (room.category !== 'apartkost') continue;
    const key = buildingKey(room.category, room.buildingCode);
    const list = grouped.get(key) ?? [];
    list.push(room);
    grouped.set(key, list);
  }

  for (const list of grouped.values()) {
    list
      .sort((left, right) => left.roomNumber - right.roomNumber)
      .forEach((room, index) => ordinals.set(room.roomCode, index + 1));
  }

  return ordinals;
}

function legacyKeyForDbRoom(room: DbRoomRow): LegacyKey | null {
  const canonicalMatch = /^(RK|AK)-([0-9]{2}[A-Z]?)-([AB])-([0-9]{3})$/.exec(room.number);
  if (canonicalMatch) {
    return {
      category: canonicalMatch[1] === 'RK' ? 'rukost' : 'apartkost',
      buildingCode: canonicalMatch[2],
      floorCode: canonicalMatch[3] as FloorCode,
      roomNumber: Number(canonicalMatch[4]),
      source: 'canonical_room_code',
    };
  }

  const rukostMatch = /^RK-([0-9]{2})-([0-9]{1,3})$/.exec(room.number);
  if (rukostMatch) {
    return {
      category: 'rukost',
      buildingCode: room.unit_code ?? rukostMatch[1],
      roomNumber: Number(rukostMatch[2]),
      floorCode: null,
      source: 'legacy_number',
    };
  }

  const apartkostMatch = /^AK-([0-9]{2}[A-Z])-([0-9]{1,3})([AB])$/.exec(room.number);
  if (apartkostMatch) {
    return {
      category: 'apartkost',
      buildingCode: room.unit_code ?? apartkostMatch[1],
      roomNumber: Number(apartkostMatch[2]),
      floorCode: apartkostMatch[3] as FloorCode,
      source: 'legacy_number',
    };
  }

  return null;
}

function changedFields(room: RoomCsvRecord, dbRoom: DbRoomRow, dbBuilding: DbBuildingRow | undefined): string[] {
  const fields: string[] = [];
  if (dbRoom.room_code !== room.roomCode) fields.push('room_code');
  if (dbRoom.category !== room.category) fields.push('category');
  if (dbRoom.floor_code !== room.floorCode) fields.push('floor_code');
  if (dbRoom.floor_label !== room.floorLabel) fields.push('floor_label');
  if (dbRoom.gender_policy !== room.dbGenderPolicy) fields.push('gender_policy');
  if (dbRoom.monthly_price !== room.monthlyPrice) fields.push('monthly_price');
  if (dbRoom.yearly_price !== room.yearlyPrice) fields.push('yearly_price');
  if (dbRoom.public_visible !== room.publicVisible) fields.push('public_visible');
  if (dbRoom.room_status !== room.dbStatus) fields.push('room_status');
  if (!dbBuilding || dbRoom.building_id !== dbBuilding.id) fields.push('building_id');
  if (dbRoom.import_source === null) fields.push('import_source');
  if (dbRoom.import_source_row !== room.sourceRow) fields.push('import_source_row');
  return fields;
}

function appendManualReviewItems(
  room: RoomCsvRecord,
  dbRoom: DbRoomRow,
  activeOccupancy: ActiveOccupancyRow | undefined,
  manualReview: ManualReviewItem[],
): void {
  const key = legacyKeyForDbRoom(dbRoom);
  if (!key) {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'DB room number is not parseable' });
  } else if (key.floorCode !== null && key.floorCode !== room.floorCode) {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'Legacy floor suffix mismatches CSV floor_code' });
  }

  if (dbRoom.category && dbRoom.category !== room.category) {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'Existing DB category conflicts with CSV category' });
  }
  if (dbRoom.unit_code && dbRoom.unit_code !== room.buildingCode) {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'Existing DB unit_code conflicts with CSV building_code' });
  }
  if (dbRoom.room_status === 'occupied' && room.dbStatus !== 'occupied') {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'DB room is occupied but CSV target status is not occupied' });
  }
  if (activeOccupancy && room.dbStatus !== 'occupied') {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'Active occupancy exists but CSV target status is not occupied' });
  }
  if (activeOccupancy?.resident_gender && activeOccupancy.resident_gender !== room.dbGenderPolicy) {
    manualReview.push({ roomCode: room.roomCode, dbRoomNumber: dbRoom.number, reason: 'Active occupancy resident gender conflicts with CSV room gender' });
  }
}

function classifyBackfillState(counts: DbDryRunResult['beforeCounts'], csv: CsvValidationResult): DbDryRunResult['backfillState'] {
  if (counts.roomBuildingCount === 0 && counts.roomsWithRoomCode === 0) return 'pre_backfill';
  if (counts.roomBuildingCount < csv.buildings.length || counts.roomsWithRoomCode < csv.rooms.length) return 'partially_backfilled';
  return 'backfilled_or_mixed';
}

function buildCsvSummary(
  buildings: BuildingCsvRecord[],
  rooms: RoomCsvRecord[],
  occupancy: OccupancyCsvRecord[],
): CsvValidationResult['summary'] {
  const roomCodeCounts = countBy(rooms, (room) => room.roomCode);
  return {
    buildingRows: buildings.length,
    roomRows: rooms.length,
    occupancyRows: occupancy.length,
    roomCodeDuplicates: Object.values(roomCodeCounts).filter((count) => count > 1).length,
    totalRoomsFromBuildings: sum(buildings, (building) => building.totalRooms),
    roomsByCategory: {
      rukost: rooms.filter((room) => room.category === 'rukost').length,
      apartkost: rooms.filter((room) => room.category === 'apartkost').length,
    },
    roomsByGender: {
      putra: rooms.filter((room) => room.genderPolicy === 'putra').length,
      putri: rooms.filter((room) => room.genderPolicy === 'putri').length,
    },
    roomsByCategoryGender: countBy(rooms, (room) => `${room.category}:${room.genderPolicy}`),
    statuses: countBy(rooms, (room) => room.status),
  };
}

function parseCliOptions(args: string[]): CliOptions {
  return { apply: args.includes("--apply") };
}

function reportFileName(mode: RunMode, timestamp: string): string {
  if (mode === "apply") return "ROOM_INVENTORY_APPLY_REPORT_" + timestamp + ".md";
  if (mode === "apply-refused") return "ROOM_INVENTORY_APPLY_REFUSED_REPORT_" + timestamp + ".md";
  return "ROOM_INVENTORY_DRY_RUN_REPORT_" + timestamp + ".md";
}

function emptyApplyResult(refusedReason?: string): ApplyResult {
  return {
    attempted: false,
    executed: false,
    refusedReason,
    actual: { roomBuildingInserts: 0, roomBuildingUpdates: 0, roomUpdates: 0 },
  };
}

async function maybeRunApply(
  options: CliOptions,
  csv: CsvValidationResult,
  db: DbDryRunResult,
  eligibility: ApplyEligibilityCheck[],
): Promise<ApplyResult> {
  if (!options.apply) return emptyApplyResult();

  const failed = eligibility.filter((check) => !check.passed);
  if (failed.length > 0) {
    return emptyApplyResult("Apply refused: " + failed.map((check) => check.label).join(", "));
  }

  return runApplyImport(csv, db);
}

function buildApplyEligibility(csv: CsvValidationResult, db: DbDryRunResult): ApplyEligibilityCheck[] {
  const csvBlocking = csv.issues.filter((issue) => issue.severity === "blocking").length;
  const normalizedTotalsPass =
    csv.summary.buildingRows === expectedTotals.buildingRows &&
    csv.summary.roomRows === expectedTotals.roomRows &&
    csv.summary.roomsByGender.putra === expectedTotals.putraRooms &&
    csv.summary.roomsByGender.putri === expectedTotals.putriRooms &&
    csv.summary.roomsByCategory.rukost === expectedTotals.rukostRooms &&
    csv.summary.roomsByCategory.apartkost === expectedTotals.apartkostRooms;
  const deterministicMatches = db.matchSummary.exactMatches + db.matchSummary.inferredLegacyMatches;
  const safeBackfillState = db.backfillState === "pre_backfill" || db.backfillState === "partially_backfilled";

  return [
    applyCheck("--apply flag present", process.argv.slice(2).includes("--apply"), "required for write mode"),
    applyCheck("CSV validation PASS", csvBlocking === 0, csvBlocking + " blocking issue(s)"),
    applyCheck(
      "DB dry-run matching PASS",
      db.available &&
        db.schemaReady &&
        !db.error &&
        deterministicMatches === expectedTotals.roomRows &&
        db.matchSummary.ambiguousMatches === 0 &&
        db.matchSummary.missingMatches === 0 &&
        db.matchSummary.extraDbRows === 0 &&
        db.matchedRooms.length === expectedTotals.roomRows,
      deterministicMatches + " deterministic match(es), " + db.matchSummary.ambiguousMatches + " ambiguous, " + db.matchSummary.missingMatches + " missing, " + db.matchSummary.extraDbRows + " extra",
    ),
    applyCheck("No PII findings", csv.piiFindings.length === 0, csv.piiFindings.length + " finding(s)"),
    applyCheck("No unmatched CSV rooms", db.unmatchedCsvRooms.length === 0, db.unmatchedCsvRooms.length + " unmatched CSV room(s)"),
    applyCheck("No unmatched DB rooms", db.unmatchedDbRooms.length === 0, db.unmatchedDbRooms.length + " unmatched DB room(s)"),
    applyCheck("No ambiguous matches", db.matchSummary.ambiguousMatches === 0, db.matchSummary.ambiguousMatches + " ambiguous match(es)"),
    applyCheck("Safe backfill state", safeBackfillState, db.backfillState),
    applyCheck("room_buildings conflict check", db.roomBuildingConflicts.length === 0, db.roomBuildingConflicts.length + " conflict(s)"),
    applyCheck("rooms conflict check", db.roomConflicts.length === 0, db.roomConflicts.length + " conflict(s)"),
    applyCheck("No duplicate room_code", csv.summary.roomCodeDuplicates === 0 && db.duplicateRoomCodes === 0, "csv=" + csv.summary.roomCodeDuplicates + ", db=" + db.duplicateRoomCodes),
    applyCheck("Normalized totals match", normalizedTotalsPass, "buildings=" + csv.summary.buildingRows + ", rooms=" + csv.summary.roomRows + ", putra=" + csv.summary.roomsByGender.putra + ", putri=" + csv.summary.roomsByGender.putri),
    applyCheck("Migration schema ready", db.schemaReady, db.schemaReady ? "schema ready" : "schema missing"),
    applyCheck("Explicit import confirmation", process.env.ROOM_INVENTORY_IMPORT_CONFIRM === applyConfirmationValue, "ROOM_INVENTORY_IMPORT_CONFIRM must equal " + applyConfirmationValue),
    applyCheck("Backup confirmation", process.env.ROOM_INVENTORY_BACKUP_CONFIRMED === "true", "ROOM_INVENTORY_BACKUP_CONFIRMED must equal true"),
  ];
}

function applyCheck(label: string, passed: boolean, detail: string): ApplyEligibilityCheck {
  return { label, passed, detail };
}

function applyVisibility(room: RoomCsvRecord): boolean {
  return room.dbStatus === "vacant" ? room.publicVisible : false;
}

async function runApplyImport(csv: CsvValidationResult, db: DbDryRunResult): Promise<ApplyResult> {
  if (!db.targetProperty) return emptyApplyResult("Apply refused: target property is unavailable");

  const pool = new Pool(databaseConfigFromEnv());
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const schemaReady = await hasRoomInventorySchema(client);
    if (!schemaReady) throw new Error("M16 room inventory schema is not ready inside apply transaction");

    const beforeCounts = await readCounts(client);
    if (beforeCounts.roomCount !== expectedTotals.roomRows) {
      throw new Error("Expected 163 rooms before apply, got " + beforeCounts.roomCount);
    }

    const propertyId = db.targetProperty.id;
    const buildingResult = await upsertRoomBuildings(client, propertyId, csv.buildings);
    const roomUpdates = await updateMatchedRooms(client, propertyId, csv.rooms, db.matchedRooms, buildingResult.buildingIds);
    const postCounts = await readPostApplyCounts(client);

    if (postCounts.roomCount !== expectedTotals.roomRows) throw new Error("rooms count changed during apply");
    if (postCounts.roomBuildingCount !== expectedTotals.buildingRows) throw new Error("room_buildings count verification failed");
    if (postCounts.roomsWithRoomCode !== expectedTotals.roomRows) throw new Error("rooms_with_room_code verification failed");
    if (postCounts.distinctRoomCodes !== expectedTotals.roomRows) throw new Error("distinct room_code verification failed");

    await client.query("COMMIT");
    return {
      attempted: true,
      executed: true,
      actual: {
        roomBuildingInserts: buildingResult.inserts,
        roomBuildingUpdates: buildingResult.updates,
        roomUpdates,
      },
      postCounts,
    };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    return { ...emptyApplyResult("Apply failed and was rolled back: " + (error instanceof Error ? error.message : "unknown error")), attempted: true };
  } finally {
    client?.release();
    await pool.end();
  }
}

async function upsertRoomBuildings(
  client: PoolClient,
  propertyId: string,
  buildings: BuildingCsvRecord[],
): Promise<{ buildingIds: Map<string, string>; inserts: number; updates: number }> {
  const buildingIds = new Map<string, string>();
  let inserts = 0;
  let updates = 0;

  for (const building of buildings) {
    const result = await client.query<{ id: string; category: Category; building_code: string; inserted: boolean }>(
      `INSERT INTO room_buildings (
        property_id, category, building_code, building_name, gender_policy, total_rooms,
        floor_a_count, floor_b_count, monthly_price, yearly_price, public_visible, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      ON CONFLICT (property_id, category, building_code) DO UPDATE SET
        building_name = EXCLUDED.building_name,
        gender_policy = EXCLUDED.gender_policy,
        total_rooms = EXCLUDED.total_rooms,
        floor_a_count = EXCLUDED.floor_a_count,
        floor_b_count = EXCLUDED.floor_b_count,
        monthly_price = EXCLUDED.monthly_price,
        yearly_price = EXCLUDED.yearly_price,
        public_visible = EXCLUDED.public_visible,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id, category, building_code, (xmax = 0) AS inserted`,
      [
        propertyId,
        building.category,
        building.buildingCode,
        building.buildingName,
        building.dbGenderPolicy,
        building.totalRooms,
        building.floorACount,
        building.floorBCount,
        building.monthlyPrice,
        building.yearlyPrice,
        building.publicVisible,
        building.notes || null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("room_buildings upsert returned no row for " + buildingKey(building.category, building.buildingCode));
    buildingIds.set(buildingKey(row.category, row.building_code), row.id);
    if (row.inserted) inserts += 1;
    else updates += 1;
  }

  return { buildingIds, inserts, updates };
}

async function updateMatchedRooms(
  client: PoolClient,
  propertyId: string,
  rooms: RoomCsvRecord[],
  matchedRooms: MatchedRoomForApply[],
  buildingIds: Map<string, string>,
): Promise<number> {
  const matchedByRoomCode = new Map(matchedRooms.map((match) => [match.roomCode, match]));
  let updates = 0;

  for (const room of rooms) {
    const match = matchedByRoomCode.get(room.roomCode);
    if (!match) throw new Error("No deterministic DB match for " + room.roomCode);
    const buildingId = buildingIds.get(buildingKey(room.category, room.buildingCode));
    if (!buildingId) throw new Error("No room_buildings id for " + buildingKey(room.category, room.buildingCode));

    const result = await client.query<{ id: string }>(
      `UPDATE rooms
       SET building_id = $3,
           category = $4,
           room_code = $5,
           floor_code = $6,
           floor_label = $7,
           gender_policy = $8,
           public_visible = $9,
           yearly_price = $10,
           monthly_price = $11,
           room_status = $12,
           import_source = $13,
           import_source_row = $14,
           import_notes = $15,
           updated_at = now()
       WHERE id = $1
         AND property_id = $2
       RETURNING id`,
      [
        match.dbRoomId,
        propertyId,
        buildingId,
        room.category,
        room.roomCode,
        room.floorCode,
        room.floorLabel,
        room.dbGenderPolicy,
        applyVisibility(room),
        room.yearlyPrice,
        room.monthlyPrice,
        room.dbStatus,
        importSource,
        room.sourceRow,
        room.notes || null,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Room update did not affect exactly one row for " + room.roomCode);
    updates += 1;
  }

  return updates;
}

async function readPostApplyCounts(client: PoolClient): Promise<NonNullable<ApplyResult["postCounts"]>> {
  const result = await client.query<{
    room_count: string;
    room_building_count: string;
    rooms_with_room_code: string;
    distinct_room_codes: string;
  }>(
    `SELECT
       (SELECT count(*) FROM rooms) AS room_count,
       (SELECT count(*) FROM room_buildings) AS room_building_count,
       (SELECT count(*) FROM rooms WHERE room_code IS NOT NULL) AS rooms_with_room_code,
       (SELECT count(DISTINCT room_code) FROM rooms WHERE room_code IS NOT NULL) AS distinct_room_codes`,
  );
  const row = result.rows[0];
  return {
    roomCount: Number(row?.room_count ?? 0),
    roomBuildingCount: Number(row?.room_building_count ?? 0),
    roomsWithRoomCode: Number(row?.rooms_with_room_code ?? 0),
    distinctRoomCodes: Number(row?.distinct_room_codes ?? 0),
  };
}

async function writeReport(context: ReportContext): Promise<void> {
  await mkdir(dirname(context.reportPath), { recursive: true });
  await writeFile(context.reportPath, renderReport(context), 'utf8');
}

function renderReport(context: ReportContext): string {
  const blocking = context.csv.issues.filter((issue) => issue.severity === 'blocking');
  const warnings = context.csv.issues.filter((issue) => issue.severity === 'warning');
  const db = context.db;
  const targetProperty = db.targetProperty
    ? `${db.targetProperty.name} (${db.targetProperty.id}) — ${db.targetProperty.reason}`
    : 'Not inferable';

  return `# Room Inventory Import Apply Guard Report

> **Run timestamp**: ${context.runTimestamp}
> **Mode**: ${context.mode}
> **Git branch**: ${context.gitBranch || 'unknown'}
> **Git commit**: ${context.gitCommit || 'unknown'}
> **Verdict**: ${context.verdict}

---

## CSV Validation Summary

| Check | Actual | Expected |
|---|---:|---:|
| Building rows | ${context.csv.summary.buildingRows} | ${expectedTotals.buildingRows} |
| Room rows | ${context.csv.summary.roomRows} | ${expectedTotals.roomRows} |
| Occupancy seed rows | ${context.csv.summary.occupancyRows} | ${expectedTotals.occupancyRows} |
| Duplicate room_code count | ${context.csv.summary.roomCodeDuplicates} | 0 |
| Building total_rooms sum | ${context.csv.summary.totalRoomsFromBuildings} | ${expectedTotals.totalRooms} |
| RuKost rooms | ${context.csv.summary.roomsByCategory.rukost} | ${expectedTotals.rukostRooms} |
| ApartKost rooms | ${context.csv.summary.roomsByCategory.apartkost} | ${expectedTotals.apartkostRooms} |
| Putra rooms | ${context.csv.summary.roomsByGender.putra} | ${expectedTotals.putraRooms} |
| Putri rooms | ${context.csv.summary.roomsByGender.putri} | ${expectedTotals.putriRooms} |

Statuses: ${formatRecord(context.csv.summary.statuses)}

---

## DB Dry-run Summary

| Check | Result |
|---|---|
| DB dry-run available | ${db.available ? 'yes' : 'no'} |
| Schema ready | ${db.schemaReady ? 'yes' : 'no'} |
| Target property | ${targetProperty} |
| Current DB room count | ${db.beforeCounts.roomCount} |
| Current room_buildings count | ${db.beforeCounts.roomBuildingCount} |
| Current rooms_with_room_code count | ${db.beforeCounts.roomsWithRoomCode} |
| Existing duplicate room_code count | ${db.duplicateRoomCodes} |
| Backfill state | ${db.backfillState} |
| Counts unchanged after dry-run | ${sameCounts(db.beforeCounts, db.afterCounts) ? 'yes' : 'no'} |

${db.error ? `DB dry-run note: ${db.error}\n` : ''}

### Match Summary

| Type | Count |
|---|---:|
| Exact room_code matches | ${db.matchSummary.exactMatches} |
| Inferred legacy matches | ${db.matchSummary.inferredLegacyMatches} |
| Ambiguous matches | ${db.matchSummary.ambiguousMatches} |
| Missing CSV room matches | ${db.matchSummary.missingMatches} |
| Extra DB rows | ${db.matchSummary.extraDbRows} |

### Proposed Future Write Summary

These are proposed by the dry-run comparison. Actual writes are shown separately and only occur in confirmed apply mode.

| Proposed future action | Count |
|---|---:|
| room_buildings inserts | ${db.proposed.roomBuildingInserts} |
| room_buildings updates | ${db.proposed.roomBuildingUpdates} |
| rooms updates | ${db.proposed.roomUpdates} |
| status changes | ${db.proposed.statusChanges} |
| gender corrections | ${db.proposed.genderCorrections} |
| visibility changes | ${db.proposed.visibilityChanges} |

### Proposed Future room_buildings Inserts

${renderStringList(db.proposedBuildingInserts)}

### Proposed Future Room Updates

${renderProposedChanges(db.proposedChanges)}

### Unmatched CSV Rooms

${renderStringList(db.unmatchedCsvRooms)}

### Unmatched DB Rooms

${renderStringList(db.unmatchedDbRooms)}

---

## Apply Eligibility Checklist

${renderApplyEligibility(context.applyEligibility)}

Backup confirmation status: ${process.env.ROOM_INVENTORY_BACKUP_CONFIRMED === "true" ? "confirmed" : "not confirmed"}

${context.applyResult.refusedReason ? "Apply refusal/failure note: " + context.applyResult.refusedReason + "\n" : ""}

## Actual Writes Summary

${renderActualWrites(context.applyResult)}

---

## Blocking Failures

${renderIssues(blocking)}

## Warnings

${renderIssues(warnings)}

---

## Manual Review Rows

${renderManualReview(db.manualReview)}

---

## PII Scan Summary

| Finding count | Result |
|---|---:|
| PII findings | ${context.csv.piiFindings.length} |

${context.csv.piiFindings.length > 0 ? renderPiiFindings(context.csv.piiFindings) : 'No PII findings in normalized CSV files.'}

---

## Safety Confirmation

${renderSafetyConfirmation(context)}

---

## Final Verdict

### ${context.verdict}
`;
}

function renderApplyEligibility(checks: ApplyEligibilityCheck[]): string {
  return checks.map((check) => "- " + (check.passed ? "PASS" : "FAIL") + " - " + check.label + ": " + check.detail).join("\n");
}

function renderActualWrites(result: ApplyResult): string {
  const lines = [
    "| Write metric | Count |",
    "|---|---:|",
    "| room_buildings inserted | " + result.actual.roomBuildingInserts + " |",
    "| room_buildings updated | " + result.actual.roomBuildingUpdates + " |",
    "| rooms updated | " + result.actual.roomUpdates + " |",
  ];
  if (result.postCounts) {
    lines.push("| post-apply room count | " + result.postCounts.roomCount + " |");
    lines.push("| post-apply room_buildings count | " + result.postCounts.roomBuildingCount + " |");
    lines.push("| post-apply rooms_with_room_code | " + result.postCounts.roomsWithRoomCode + " |");
    lines.push("| post-apply distinct room_code | " + result.postCounts.distinctRoomCodes + " |");
  }
  if (!result.executed) lines.push("\nNo apply writes executed.");
  return lines.join("\n");
}

function renderSafetyConfirmation(context: ReportContext): string {
  if (context.mode === "apply" && context.applyResult.executed) {
    return [
      "- Apply mode executed only after --apply, import confirmation, and backup confirmation passed.",
      "- No DELETE statements executed.",
      "- No room rows inserted or recreated.",
      "- Existing room IDs were preserved.",
      "- No residents or occupancies created.",
      "- No tenant PII printed.",
      "- No public listing opened.",
      "- No Payment Gateway behavior changed.",
      "- No Smart Lock behavior changed.",
      "- Public booking remains not production-ready.",
    ].join("\n");
  }

  return [
    "- No INSERT statements executed.",
    "- No UPDATE statements executed.",
    "- No DELETE statements executed.",
    "- No room backfill executed.",
    "- No room_buildings rows inserted.",
    "- No rooms updated.",
    "- No room_code values backfilled.",
    "- No tenant PII printed.",
    "- No public listing opened.",
    "- No Payment Gateway behavior changed.",
    "- No Smart Lock behavior changed.",
    "- Public booking remains not production-ready.",
  ].join("\n");
}

function renderIssues(issues: Issue[]): string {
  if (issues.length === 0) return 'None.';
  return issues
    .map((issue) => {
      const location = [issue.file, issue.row ? `row ${issue.row}` : undefined, issue.field].filter(Boolean).join(' / ');
      return `- ${location}: ${issue.message}`;
    })
    .join('\n');
}

function renderManualReview(items: ManualReviewItem[]): string {
  if (items.length === 0) return 'None.';
  const visible = items.slice(0, 80);
  const body = visible
    .map((item) => `- ${item.roomCode ?? '(no CSV room)'} / ${item.dbRoomNumber ?? '(no DB room)'}: ${item.reason}`)
    .join('\n');
  const remaining = items.length - visible.length;
  return remaining > 0 ? `${body}\n- ... ${remaining} more manual review item(s) omitted from this report section.` : body;
}

function renderPiiFindings(findings: PiiFinding[]): string {
  return findings.map((finding) => `- ${finding.file} / row ${finding.row} / ${finding.field}: ${finding.reason}`).join('\n');
}

function renderStringList(items: string[]): string {
  if (items.length === 0) return "None.";
  return items.map((item) => "- " + item).join("\n");
}

function renderProposedChanges(changes: ProposedChange[]): string {
  if (changes.length === 0) return "None.";
  return changes
    .map((change) => "- " + change.roomCode + " / " + (change.dbRoomNumber ?? "(no DB room)") + ": " + change.fields.join(", "))
    .join("\n");
}

function printSummary(context: ReportContext): void {
  console.log(`Room inventory validator verdict: ${context.verdict}`);
  console.log(`Mode: ${context.mode}`);
  console.log(`Report: ${context.reportPath}`);
  console.log(`CSV blocking failures: ${context.csv.issues.filter((issue) => issue.severity === 'blocking').length}`);
  console.log(`CSV warnings: ${context.csv.issues.filter((issue) => issue.severity === 'warning').length}`);
  console.log(`PII findings: ${context.csv.piiFindings.length}`);
  console.log(
    `DB dry-run: ${context.db.available ? context.db.backfillState : 'unavailable'}; inferred matches ${context.db.matchSummary.inferredLegacyMatches}; proposed room updates ${context.db.proposed.roomUpdates}`,
  );
  if (context.applyResult.refusedReason) console.log(`Apply note: ${context.applyResult.refusedReason}`);
}

function determineVerdict(csv: CsvValidationResult, db: DbDryRunResult, mode: RunMode, applyResult: ApplyResult): Verdict {
  if (csv.issues.some((issue) => issue.severity === "blocking")) return "FAIL";
  if (mode === "apply-refused") return "APPLY_REFUSED";
  if (!db.available || !db.schemaReady || db.error) return "PARTIAL";
  if (mode === "apply" && !applyResult.executed) return "FAIL";
  if (mode !== "apply" && !sameCounts(db.beforeCounts, db.afterCounts)) return "FAIL";
  return "PASS";
}

function sameCounts(left: DbDryRunResult['beforeCounts'], right: DbDryRunResult['afterCounts']): boolean {
  return (
    left.roomCount === right.roomCount &&
    left.roomBuildingCount === right.roomBuildingCount &&
    left.roomsWithRoomCode === right.roomsWithRoomCode
  );
}

function enumValue<T extends string>(
  rawValue: string,
  validValues: Set<string>,
  file: string,
  row: number,
  field: string,
  issues: Issue[],
): T | null {
  const value = rawValue.trim();
  if (!validValues.has(value)) {
    addIssue(issues, file, `Invalid ${field}: expected one of ${Array.from(validValues).join(', ')}`, row, field);
    return null;
  }
  return value as T;
}

function booleanValue(rawValue: string, file: string, row: number, field: string, issues: Issue[]): boolean {
  const value = rawValue.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  addIssue(issues, file, `${field} must be true or false`, row, field);
  return false;
}

function positiveInteger(
  rawValue: string,
  file: string,
  row: number,
  field: string,
  issues: Issue[],
  allowZero = false,
): number {
  const value = Number(rawValue.trim());
  const valid = Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    addIssue(issues, file, `${field} must be a ${allowZero ? 'non-negative' : 'positive'} integer`, row, field);
    return -1;
  }
  return value;
}

function nonNegativeInteger(rawValue: string, file: string, row: number, field: string, issues: Issue[]): number {
  return positiveInteger(rawValue, file, row, field, issues, true);
}

function optionalPositiveInteger(rawValue: string, file: string, row: number, field: string, issues: Issue[]): number | null {
  if (!rawValue.trim()) return null;
  return positiveInteger(rawValue, file, row, field, issues);
}

function optionalNonNegativeInteger(rawValue: string, file: string, row: number, field: string, issues: Issue[]): number | null {
  if (!rawValue.trim()) return null;
  return nonNegativeInteger(rawValue, file, row, field, issues);
}

function addIssue(
  issues: Issue[],
  file: string,
  message: string,
  row?: number,
  field?: string,
  severity: Issue['severity'] = 'blocking',
): void {
  issues.push({ severity, file, row, field, message });
}

function expectNumber(issues: Issue[], file: string, label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    addIssue(issues, file, `${label} expected ${expected}, got ${actual}`);
  }
}

function isSummaryRow(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => /(total|summary|subtotal|grand total|jumlah|rekap)/i.test(value.trim()));
}

function isTenantNameField(field: string): boolean {
  const normalized = field.toLowerCase();
  return (
    normalized === "tenant_name" ||
    normalized === "tenant_full_name" ||
    normalized === "tenant_nama" ||
    normalized === "resident_name" ||
    normalized === "resident_full_name" ||
    normalized === "resident_nama" ||
    normalized === "penghuni_name" ||
    normalized === "penghuni_full_name" ||
    normalized === "penghuni_nama" ||
    normalized === "nama_tenant" ||
    normalized === "name_tenant" ||
    normalized === "nama_resident" ||
    normalized === "name_resident" ||
    normalized === "nama_penghuni" ||
    normalized === "name_penghuni"
  );
}

function isFreeTextField(field: string): boolean {
  return field === "notes" || field.endsWith("_name") || field.endsWith("_masked");
}

function mentionsTenantContext(value: string): boolean {
  return /(tenant|resident|penghuni|nama)/i.test(value);
}

function hasPersonalNameLikePhrase(value: string): boolean {
  const withoutMaskedToken = value.replace(/<masked>/gi, String.fromCharCode(32));
  return (
    /[A-Z][a-z]{2,}(?:[ ][A-Z][a-z]{2,}){1,3}/.test(withoutMaskedToken) ||
    /[A-Z]{3,}(?:[ ][A-Z]{3,}){1,3}/.test(withoutMaskedToken)
  );
}

function mapGender(gender: CsvGender): DbGender {
  return gender === 'putra' ? 'male' : 'female';
}

function mapStatus(status: CsvRoomStatus): DbRoomStatus {
  if (status === 'booked') return 'reserved';
  return status;
}

function buildingKey(category: Category, buildingCode: string): string {
  return `${category}:${buildingCode}`;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function sum<T>(items: T[], valueFn: (item: T) => number): number {
  return items.reduce((total, item) => total + valueFn(item), 0);
}

function formatRecord(record: Record<string, number>): string {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

function gitValue(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function jakartaTimestamp(): { file: string; display: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const file = `${value('year')}${value('month')}${value('day')}_${value('hour')}${value('minute')}${value('second')}`;
  const display = `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} Asia/Jakarta`;
  return { file, display };
}

void main();
