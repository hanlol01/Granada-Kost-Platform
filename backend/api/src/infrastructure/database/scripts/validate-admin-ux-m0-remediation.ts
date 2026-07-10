import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPLY_REFUSAL = 'M0 preflight is read-only; no staging write executor exists yet.';

type JsonRecord = Record<string, unknown>;
type ActionKind =
  | 'sync_active_occupancy'
  | 'close_stale_occupancy'
  | 'create_legacy_occupancy'
  | 'clear_room_without_occupancy';

type FacilityBatch = {
  propertyId: string;
  roomIds: string[];
  facilityIds: string[];
};

type RemediationAction = {
  id: string;
  kind: ActionKind;
  propertyId: string;
  roomId: string;
  actorUserId: string;
  reason: string;
  occupancyId?: string;
  residentId?: string;
  businessDate?: string;
};

type Manifest = {
  runId: string;
  correlationId: string;
  propertyId: string;
  backupId: string;
  restoreVerified: boolean;
  businessApproval: boolean;
  releaseApproval: boolean;
  facilityBatch?: FacilityBatch;
  actions: RemediationAction[];
};

type CliOptions = {
  help: boolean;
  apply: boolean;
  manifestPath?: string;
};

type Check = {
  key: string;
  passed: boolean;
  detail: string;
};

type CountRow = {
  total: string;
};

type FacilityCheckRow = {
  target_rooms: string;
  valid_rooms: string;
  target_facilities: string;
  valid_facilities: string;
  assignment_hash: string;
};

function usage(): string {
  return [
    'Usage:',
    '  npm --workspace @granada-kost/api run admin-ux:m0:preflight -- --manifest=path/to/manifest.json',
    '',
    'The command uses REPEATABLE READ, READ ONLY and always refuses --apply.',
  ].join('\n');
}

function parseOptions(args: string[]): CliOptions {
  const manifest = args.find((arg) => arg.startsWith('--manifest='));
  return {
    help: args.includes('--help') || args.includes('-h'),
    apply: args.includes('--apply'),
    manifestPath: manifest?.slice('--manifest='.length),
  };
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(label + ' must be a non-empty string');
  }
  return value.trim();
}

function asUuid(value: unknown, label: string): string {
  const result = asString(value, label);
  if (!UUID_PATTERN.test(result)) {
    throw new Error(label + ' must be a UUID');
  }
  return result;
}

function asDate(value: unknown, label: string): string {
  const result = asString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error(label + ' must be YYYY-MM-DD');
  }
  return result;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(label + ' must be an array');
  }
  return value;
}

function requireUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(label + ' contains duplicates');
  }
}

function approved(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const record = asRecord(value, 'approval');
  return ['reference', 'approved_by', 'approved_at'].every((key) => {
    const candidate = record[key];
    return typeof candidate === 'string' && candidate.trim() !== '';
  });
}

function parseFacilityBatch(value: unknown, propertyId: string): FacilityBatch | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = asRecord(value, 'facility_batch');
  const batchPropertyId = asUuid(record.property_id, 'facility_batch.property_id');
  if (batchPropertyId !== propertyId) {
    throw new Error('facility_batch.property_id must equal property_id');
  }
  const roomIds = asArray(record.room_ids, 'facility_batch.room_ids').map((item, index) =>
    asUuid(item, 'facility_batch.room_ids[' + index + ']'),
  );
  const facilityIds = asArray(record.facility_ids, 'facility_batch.facility_ids').map(
    (item, index) => asUuid(item, 'facility_batch.facility_ids[' + index + ']'),
  );
  if (roomIds.length === 0 || facilityIds.length === 0) {
    throw new Error('facility_batch must include room_ids and facility_ids');
  }
  requireUnique(roomIds, 'facility_batch.room_ids');
  requireUnique(facilityIds, 'facility_batch.facility_ids');
  return { propertyId: batchPropertyId, roomIds, facilityIds };
}

function parseAction(value: unknown, index: number, propertyId: string): RemediationAction {
  const record = asRecord(value, 'occupancy_actions[' + index + ']');
  const kind = asString(record.kind, 'occupancy_actions[' + index + '].kind') as ActionKind;
  if (
    ![
      'sync_active_occupancy',
      'close_stale_occupancy',
      'create_legacy_occupancy',
      'clear_room_without_occupancy',
    ].includes(kind)
  ) {
    throw new Error('occupancy_actions[' + index + '].kind is not supported');
  }

  const actionPropertyId = asUuid(
    record.property_id,
    'occupancy_actions[' + index + '].property_id',
  );
  if (actionPropertyId !== propertyId) {
    throw new Error('occupancy_actions[' + index + '].property_id must equal property_id');
  }

  const action: RemediationAction = {
    id: asString(record.id, 'occupancy_actions[' + index + '].id'),
    kind,
    propertyId: actionPropertyId,
    roomId: asUuid(record.room_id, 'occupancy_actions[' + index + '].room_id'),
    actorUserId: asUuid(record.actor_user_id, 'occupancy_actions[' + index + '].actor_user_id'),
    reason: asString(record.reason, 'occupancy_actions[' + index + '].reason'),
  };

  if (kind === 'sync_active_occupancy') {
    action.occupancyId = asUuid(
      record.occupancy_id,
      'occupancy_actions[' + index + '].occupancy_id',
    );
    action.businessDate = asDate(record.event_date, 'occupancy_actions[' + index + '].event_date');
  }
  if (kind === 'close_stale_occupancy') {
    action.occupancyId = asUuid(
      record.occupancy_id,
      'occupancy_actions[' + index + '].occupancy_id',
    );
    action.businessDate = asDate(record.end_date, 'occupancy_actions[' + index + '].end_date');
    const status = asString(
      record.room_status_after,
      'occupancy_actions[' + index + '].room_status_after',
    );
    if (status !== 'vacant' && status !== 'maintenance') {
      throw new Error('close_stale_occupancy room_status_after must be vacant or maintenance');
    }
  }
  if (kind === 'create_legacy_occupancy') {
    action.residentId = asUuid(record.resident_id, 'occupancy_actions[' + index + '].resident_id');
    action.businessDate = asDate(record.start_date, 'occupancy_actions[' + index + '].start_date');
  }
  if (kind === 'clear_room_without_occupancy') {
    const status = asString(
      record.room_status_after,
      'occupancy_actions[' + index + '].room_status_after',
    );
    if (status !== 'vacant' && status !== 'maintenance') {
      throw new Error(
        'clear_room_without_occupancy room_status_after must be vacant or maintenance',
      );
    }
  }

  return action;
}

function parseManifest(value: unknown): Manifest {
  const record = asRecord(value, 'manifest');
  if (record.version !== 1 || record.target_environment !== 'staging') {
    throw new Error('manifest requires version=1 and target_environment=staging');
  }

  const propertyId = asUuid(record.property_id, 'property_id');
  const actions = asArray(record.occupancy_actions ?? [], 'occupancy_actions').map((item, index) =>
    parseAction(item, index, propertyId),
  );
  requireUnique(
    actions.map((action) => action.id),
    'occupancy_actions ids',
  );

  const approvals = asRecord(record.approvals ?? {}, 'approvals');
  return {
    runId: asString(record.run_id, 'run_id'),
    correlationId: asString(record.correlation_id, 'correlation_id'),
    propertyId,
    backupId: asString(record.backup_id, 'backup_id'),
    restoreVerified: record.restore_verified === true,
    businessApproval: approved(approvals.business),
    releaseApproval: approved(approvals.release_db),
    facilityBatch: parseFacilityBatch(record.facility_batch, propertyId),
    actions,
  };
}

async function loadManifest(path: string): Promise<{ manifest: Manifest; sha256: string }> {
  const raw = await readFile(path, 'utf8');
  return {
    manifest: parseManifest(JSON.parse(raw) as unknown),
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}

function countCheck(key: string, actual: number, expected: number, detail: string): Check {
  return {
    key,
    passed: actual === expected,
    detail: detail + ': expected=' + expected + ', actual=' + actual,
  };
}

async function checkFacilityBatch(client: PoolClient, batch: FacilityBatch): Promise<Check[]> {
  const result = await client.query<FacilityCheckRow>(
    [
      'WITH target_rooms AS (SELECT unnest($2::uuid[]) AS room_id), target_facilities AS (SELECT unnest($3::uuid[]) AS facility_id)',
      'SELECT',
      '  (SELECT count(*) FROM rooms r JOIN target_rooms t ON t.room_id = r.id) AS target_rooms,',
      "  (SELECT count(*) FROM rooms r JOIN target_rooms t ON t.room_id = r.id LEFT JOIN room_buildings b ON b.id = r.building_id WHERE r.property_id = $1::uuid AND r.category = 'apartkost' AND b.property_id = r.property_id AND b.category = r.category) AS valid_rooms,",
      '  (SELECT count(*) FROM room_facilities f JOIN target_facilities t ON t.facility_id = f.id) AS target_facilities,',
      "  (SELECT count(*) FROM room_facilities f JOIN target_facilities t ON t.facility_id = f.id WHERE f.property_id = $1::uuid AND f.status = 'active') AS valid_facilities,",
      "  (SELECT md5(COALESCE(string_agg(a.room_id::text || ':' || a.facility_id::text, ',' ORDER BY a.room_id, a.facility_id), '')) FROM room_facility_assignments a JOIN target_rooms t ON t.room_id = a.room_id) AS assignment_hash",
    ].join('\n'),
    [batch.propertyId, batch.roomIds, batch.facilityIds],
  );
  const row = result.rows[0];
  return [
    countCheck(
      'facility_target_rooms',
      Number(row?.target_rooms ?? 0),
      batch.roomIds.length,
      'rooms found',
    ),
    countCheck(
      'facility_target_room_scope',
      Number(row?.valid_rooms ?? 0),
      batch.roomIds.length,
      'Apart Kost room/building scope',
    ),
    countCheck(
      'facility_target_facilities',
      Number(row?.target_facilities ?? 0),
      batch.facilityIds.length,
      'facilities found',
    ),
    countCheck(
      'facility_target_facility_scope',
      Number(row?.valid_facilities ?? 0),
      batch.facilityIds.length,
      'active property-scoped facilities',
    ),
    {
      key: 'facility_before_hash',
      passed: Boolean(row?.assignment_hash),
      detail: 'assignment hash=' + (row?.assignment_hash ?? 'missing'),
    },
  ];
}

async function checkAction(client: PoolClient, action: RemediationAction): Promise<Check> {
  let query: string;
  let values: unknown[];

  if (action.kind === 'sync_active_occupancy') {
    query = [
      'SELECT count(*) AS total FROM occupancies o JOIN rooms r ON r.id = o.room_id JOIN residents rs ON rs.id = o.resident_id',
      "WHERE o.id = $2::uuid AND r.id = $3::uuid AND o.property_id = $1::uuid AND r.property_id = $1::uuid AND rs.property_id = $1::uuid AND o.occupancy_status = 'active' AND r.room_status = 'vacant'",
    ].join('\n');
    values = [action.propertyId, action.occupancyId, action.roomId];
  } else if (action.kind === 'close_stale_occupancy') {
    query = [
      'SELECT count(*) AS total FROM occupancies o JOIN rooms r ON r.id = o.room_id JOIN residents rs ON rs.id = o.resident_id',
      "WHERE o.id = $2::uuid AND r.id = $3::uuid AND o.property_id = $1::uuid AND r.property_id = $1::uuid AND rs.property_id = $1::uuid AND o.occupancy_status = 'active' AND r.room_status = 'vacant' AND o.start_date <= $4::date",
      "  AND NOT EXISTS (SELECT 1 FROM check_out_requests q WHERE q.occupancy_id = o.id AND q.check_out_status IN ('requested', 'approved'))",
    ].join('\n');
    values = [action.propertyId, action.occupancyId, action.roomId, action.businessDate];
  } else if (action.kind === 'create_legacy_occupancy') {
    query = [
      'SELECT count(*) AS total FROM rooms r JOIN residents rs ON rs.id = $3::uuid',
      "WHERE r.id = $2::uuid AND r.property_id = $1::uuid AND rs.property_id = $1::uuid AND r.room_status = 'occupied' AND rs.resident_status = 'active'",
      "  AND NOT EXISTS (SELECT 1 FROM occupancies o WHERE o.room_id = r.id AND o.occupancy_status = 'active')",
      "  AND NOT EXISTS (SELECT 1 FROM occupancies o WHERE o.resident_id = rs.id AND o.occupancy_status = 'active')",
    ].join('\n');
    values = [action.propertyId, action.roomId, action.residentId];
  } else {
    query = [
      'SELECT count(*) AS total FROM rooms r',
      "WHERE r.id = $2::uuid AND r.property_id = $1::uuid AND r.room_status = 'occupied'",
      "  AND NOT EXISTS (SELECT 1 FROM occupancies o WHERE o.room_id = r.id AND o.occupancy_status = 'active')",
    ].join('\n');
    values = [action.propertyId, action.roomId];
  }

  const result = await client.query<CountRow>(query, values);
  return countCheck(
    'action_' + action.id,
    Number(result.rows[0]?.total ?? 0),
    1,
    action.kind + ' precondition',
  );
}

async function runPreflight(manifest: Manifest): Promise<Check[]> {
  if (process.env.NODE_ENV !== 'staging') {
    throw new Error('M0 preflight only permits NODE_ENV=staging');
  }

  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const property = await client.query<CountRow>(
      "SELECT count(*) AS total FROM properties WHERE id = $1::uuid AND status = 'active'",
      [manifest.propertyId],
    );

    const checks: Check[] = [
      countCheck('active_property', Number(property.rows[0]?.total ?? 0), 1, 'target property'),
      {
        key: 'restore_verified',
        passed: manifest.restoreVerified,
        detail: manifest.restoreVerified ? 'recorded' : 'required before write',
      },
      {
        key: 'business_approval',
        passed: manifest.businessApproval,
        detail: manifest.businessApproval ? 'recorded' : 'required before write',
      },
      {
        key: 'release_db_approval',
        passed: manifest.releaseApproval,
        detail: manifest.releaseApproval ? 'recorded' : 'required before write',
      },
      {
        key: 'actions_complete',
        passed: manifest.actions.length === 10,
        detail: 'expected 10 actions, actual=' + manifest.actions.length,
      },
    ];

    if (manifest.facilityBatch) {
      checks.push({
        key: 'facility_target_cardinality',
        passed: manifest.facilityBatch.roomIds.length === 40,
        detail: 'expected 40 Apart Kost rooms, actual=' + manifest.facilityBatch.roomIds.length,
      });
      checks.push(...(await checkFacilityBatch(client, manifest.facilityBatch)));
    } else {
      checks.push({
        key: 'facility_batch_present',
        passed: false,
        detail: 'required before M0 can pass',
      });
    }

    for (const action of manifest.actions) {
      checks.push(await checkAction(client, action));
    }

    await client.query('COMMIT');
    return checks;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.manifestPath) {
    throw new Error('--manifest=path is required\n\n' + usage());
  }

  const { manifest, sha256 } = await loadManifest(options.manifestPath);
  const checks = await runPreflight(manifest);
  const passed = checks.every((check) => check.passed);
  console.log(
    JSON.stringify(
      {
        command: 'admin-ux:m0:preflight',
        mode: options.apply ? 'apply-refused' : 'dry-run',
        manifest_sha256: sha256,
        checks,
        summary: {
          passed: checks.filter((check) => check.passed).length,
          failed: checks.filter((check) => !check.passed).length,
          ready_for_future_apply: passed,
        },
        apply: { permitted: false, reason: APPLY_REFUSAL },
      },
      null,
      2,
    ),
  );

  if (!passed) process.exitCode = 1;
  if (options.apply) process.exitCode = 2;
}

void main().catch((error: unknown) => {
  console.error(
    'ADMIN_UX_M0_PREFLIGHT_FAILED: ' + (error instanceof Error ? error.message : 'Unknown error'),
  );
  process.exitCode = 1;
});
