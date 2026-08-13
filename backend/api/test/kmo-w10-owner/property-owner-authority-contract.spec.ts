import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DatabaseService } from '../../src/infrastructure/database/database.service';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import {
  AssignOwnerBuildingDto,
  AssignOwnerRoomsDto,
  CreatePropertyOwnerDto,
} from '../../src/modules/property-owner-management/dto/property-owner-management.dto';
import {
  MyPropertyOwnerController,
  PropertyOwnerManagementController,
} from '../../src/modules/property-owner-management/property-owner-management.controller';
import { PropertyOwnerManagementService } from '../../src/modules/property-owner-management/property-owner-management.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const root = resolve(__dirname, '../..');
const migrationPath = 'src/infrastructure/database/migrations/035_property_owner_management.sql';
const hardeningMigrationPath =
  'src/infrastructure/database/migrations/036_property_owner_authority_hardening.sql';
const a3MigrationPath =
  'src/infrastructure/database/migrations/037_property_owner_service_coverage_authority.sql';
const propertyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';

function actor(propertyIds = [propertyId]): UserAccessContext {
  return {
    id: actorId,
    email: 'admin@kostation.test',
    phone: null,
    displayName: 'Admin',
    roles: ['admin'],
    permissions: ['property_owner.manage'],
    propertyIds,
    sessionId: 'session-w10-owner',
  };
}

function exceptionBody(error: unknown): unknown {
  assert.ok(error instanceof HttpException);
  return error.getResponse();
}

function databaseServiceWithClient(client: {
  query: (sql: string, params?: unknown[]) => unknown;
  release: () => void;
}): DatabaseService {
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(database, 'pool', {
    value: { connect: () => Promise.resolve(client) },
  });
  return database;
}

void test('controllers freeze separate Admin mutation and exact property_owner read-only authority', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PropertyOwnerManagementController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, PropertyOwnerManagementController), [
    'property_owner.manage',
  ]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, MyPropertyOwnerController), ['property_owner']);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, MyPropertyOwnerController), [
    'property_owner.finance.read',
  ]);
  assert.equal(
    (PropertyOwnerManagementController.prototype as unknown as Record<string, unknown>).workspace,
    undefined,
  );
  assert.equal(
    (MyPropertyOwnerController.prototype as unknown as Record<string, unknown>).create,
    undefined,
  );
});

void test('DTOs reject unknown fields, malformed dates, and empty Apart Kost selections', async () => {
  const valid = plainToInstance(CreatePropertyOwnerDto, {
    property_id: propertyId,
    full_name: 'Owner Demo',
    email: 'owner@example.test',
    initial_password: 'Kostation2026',
  });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const unknown = plainToInstance(CreatePropertyOwnerDto, {
    property_id: propertyId,
    full_name: 'Owner Demo',
    phone: '628111111111',
    initial_password: 'Kostation2026',
    resident_id: '33333333-3333-4333-8333-333333333333',
  });
  assert.ok((await validate(unknown, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const emptyRooms = plainToInstance(AssignOwnerRoomsDto, {
    property_id: propertyId,
    room_ids: [],
    effective_from: '2026-08-11',
    reason: 'Initial assignment',
  });
  assert.ok((await validate(emptyRooms)).some((error) => error.property === 'room_ids'));

  const invalidPeriod = plainToInstance(AssignOwnerBuildingDto, {
    property_id: propertyId,
    building_id: '44444444-4444-4444-8444-444444444444',
    effective_from: 'not-a-date',
    reason: 'Initial assignment',
  });
  assert.ok((await validate(invalidPeriod)).some((error) => error.property === 'effective_from'));

  const timestampPeriod = plainToInstance(AssignOwnerBuildingDto, {
    property_id: propertyId,
    building_id: '44444444-4444-4444-8444-444444444444',
    effective_from: '2026-08-11T00:00:00Z',
    reason: 'Initial assignment',
  });
  assert.ok((await validate(timestampPeriod)).some((error) => error.property === 'effective_from'));
});

void test('empty or foreign property scope fails before query, transaction, or password hashing', async () => {
  let databaseCalls = 0;
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: () => {
          databaseCalls += 1;
          return { rows: [], rowCount: 0 };
        },
      },
      transaction: () => {
        databaseCalls += 1;
        throw new Error('transaction must not start');
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    service.list(actor([]), { property_id: propertyId, offset: 0, limit: 20 }),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'Authenticated account is not authorized for this property',
      });
      return true;
    },
  );
  await assert.rejects(
    service.create(
      actor([]),
      {
        property_id: propertyId,
        full_name: 'Owner Demo',
        email: 'owner@example.test',
        initial_password: 'Kostation2026',
      },
      'owner-idempotency-key-0001',
      {},
    ),
  );
  assert.equal(databaseCalls, 0);
});

void test('owner workspace derives scope only from authenticated account and empty scope stays empty', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return { rows: [], rowCount: 0 };
        },
      },
    } as never,
    {} as never,
  );
  const result = await service.myWorkspace({
    ...actor([]),
    roles: ['property_owner'],
    permissions: ['property_owner.asset.read'],
  });
  assert.deepEqual(result, {
    owner: null,
    assets: { rumah_kost_buildings: [], apart_kost_rooms: [] },
    financial_summary: { recognized_owner_amount: 0, pending_settlement_amount: 0 },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [actorId]);
  assert.match(calls[0].sql, /profiles\.user_id = \$1/);
  assert.match(calls[0].sql, /users\.user_status = 'active'/);
  assert.doesNotMatch(calls[0].sql, /property_id = \$1/);
});

void test('owner workspace keeps a released assignment visible until its effective end date', async () => {
  const ownerProfileId = '55555555-5555-4555-8555-555555555555';
  const calls: string[] = [];
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: (sql: string) => {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          calls.push(normalized);
          if (normalized.includes('FROM property_owner_profiles profiles')) {
            return {
              rows: [
                {
                  id: ownerProfileId,
                  property_id: propertyId,
                  user_id: actorId,
                  full_name: 'Owner Demo',
                  profile_status: 'active',
                  user_status: 'active',
                },
              ],
              rowCount: 1,
            };
          }
          if (normalized.includes('FROM building_owner_assignments assignments')) {
            return {
              rows: [
                {
                  id: '66666666-6666-4666-8666-666666666666',
                  building_code: 'RK-01',
                  building_name: 'Rumah Kost 01',
                  gender_policy: 'female',
                  room_count: 11,
                  occupied_room_count: 8,
                },
              ],
              rowCount: 1,
            };
          }
          if (normalized.includes('FROM room_owner_assignments assignments')) {
            return { rows: [], rowCount: 0 };
          }
          if (normalized.includes('FROM property_owner_earnings earnings')) {
            return {
              rows: [{ recognized_owner_amount: '0', pending_settlement_amount: '0' }],
              rowCount: 1,
            };
          }
          throw new Error(`Unexpected owner workspace query: ${normalized}`);
        },
      },
    } as never,
    {} as never,
  );

  const result = await service.myWorkspace({
    ...actor([]),
    roles: ['property_owner'],
    permissions: ['property_owner.asset.read'],
  });
  assert.equal(result.assets.rumah_kost_buildings.length, 1);
  assert.equal(result.assets.rumah_kost_buildings[0].building_code, 'RK-01');

  const buildingProjection = calls.find((sql) =>
    sql.includes('FROM building_owner_assignments assignments'),
  );
  assert.ok(buildingProjection);
  assert.doesNotMatch(buildingProjection, /assignment_status\s*=\s*'active'/);
  assert.match(buildingProjection, /effective_until IS NULL/);
  assert.match(buildingProjection, /date < assignments\.effective_until/);
});

void test('ambiguous authenticated owner profile fails closed before asset projection', async () => {
  let calls = 0;
  const profile = {
    id: '55555555-5555-4555-8555-555555555555',
    property_id: propertyId,
    user_id: actorId,
    full_name: 'Owner Demo',
    phone: null,
    email: 'owner@example.test',
    address: null,
    profile_status: 'active',
    user_status: 'active',
    created_at: new Date(),
  };
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: () => {
          calls += 1;
          return {
            rows: [profile, { ...profile, id: '66666666-6666-4666-8666-666666666666' }],
            rowCount: 2,
          };
        },
      },
    } as never,
    {} as never,
  );
  await assert.rejects(
    service.myWorkspace({ ...actor([]), roles: ['property_owner'] }),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'PROPERTY_OWNER_PROFILE_AMBIGUOUS',
        message: 'Authenticated owner profile is ambiguous',
      });
      return true;
    },
  );
  assert.equal(calls, 1);
});

void test('building assignment keeps one transaction client and rolls back before outbox or completion when audit fails', async () => {
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const buildingId = '77777777-7777-4777-8777-777777777777';
  const assignmentId = '88888888-8888-4888-8888-888888888888';
  const events: string[] = [];
  let released = 0;
  const sentinel = {
    query: (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'BEGIN' || normalized === 'ROLLBACK' || normalized === 'COMMIT') {
        events.push(normalized.toLowerCase());
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('INSERT INTO idempotency_commands')) {
        events.push('claim');
        return { rows: [{ id: 'command-w10-owner' }], rowCount: 1 };
      }
      if (normalized.includes('FROM property_owner_profiles profiles JOIN users')) {
        events.push('owner-lock');
        return {
          rows: [
            {
              id: ownerId,
              property_id: propertyId,
              user_id: '33333333-3333-4333-8333-333333333333',
              full_name: 'Owner Demo',
              phone: null,
              email: 'owner@example.test',
              address: null,
              profile_status: 'active',
              user_status: 'active',
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('FROM room_buildings buildings')) {
        events.push('building-lock');
        return { rows: [{ id: buildingId, building_code: 'RK-01' }], rowCount: 1 };
      }
      if (normalized.includes('COUNT(*)::text AS room_count')) {
        events.push('room-count');
        return { rows: [{ room_count: '11' }], rowCount: 1 };
      }
      if (normalized.includes('INSERT INTO building_owner_assignments')) {
        events.push('assignment-insert');
        return {
          rows: [{ id: assignmentId, assignment_status: 'active' }],
          rowCount: 1,
        };
      }
      if (normalized.includes('INSERT INTO business_events')) {
        events.push('outbox');
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("SET command_status = 'succeeded'")) {
        events.push('complete');
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected W10 owner SQL: ${normalized}`);
    },
    release: () => {
      released += 1;
      events.push('release');
    },
  };
  const auditFailure = new Error('W10_OWNER_AUDIT_FAILURE');
  const auditClients: unknown[] = [];
  const service = new PropertyOwnerManagementService(databaseServiceWithClient(sentinel), {
    write: (_entry: unknown, client: unknown) => {
      auditClients.push(client);
      events.push('audit');
      throw auditFailure;
    },
  } as never);

  await assert.rejects(
    service.assignBuilding(
      actor(),
      ownerId,
      {
        property_id: propertyId,
        building_id: buildingId,
        effective_from: '2026-08-11',
        reason: 'Initial owner assignment',
      },
      'owner-building-key-0001',
      { correlationId: 'w10-owner-audit-rollback' },
    ),
    (error) => error === auditFailure,
  );

  assert.deepEqual(auditClients, [sentinel]);
  assert.deepEqual(events, [
    'begin',
    'claim',
    'owner-lock',
    'building-lock',
    'room-count',
    'assignment-insert',
    'audit',
    'rollback',
    'release',
  ]);
  assert.equal(released, 1);
  assert.equal(events.includes('outbox'), false);
  assert.equal(events.includes('complete'), false);
  assert.equal(events.includes('commit'), false);
});

void test('releasing ownership shortens its protected period and rejects a non-shortening release', async () => {
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const assignmentId = '88888888-8888-4888-8888-888888888888';
  const events: string[] = [];
  let releases = 0;
  const sentinel = {
    query: (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'BEGIN' || normalized === 'ROLLBACK' || normalized === 'COMMIT') {
        events.push(normalized.toLowerCase());
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('FROM property_owner_profiles profiles JOIN users')) {
        events.push('owner-lock');
        return {
          rows: [
            {
              id: ownerId,
              property_id: propertyId,
              user_id: '33333333-3333-4333-8333-333333333333',
              full_name: 'Owner Demo',
              phone: null,
              email: 'owner@example.test',
              address: null,
              profile_status: 'active',
              user_status: 'active',
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        };
      }
      if (
        normalized.startsWith(
          'SELECT id, effective_from, effective_until, assignment_status FROM room_owner_assignments',
        )
      ) {
        events.push('assignment-lock');
        return {
          rows: [
            {
              id: assignmentId,
              effective_from: '2026-08-01',
              effective_until: '2026-10-01',
              assignment_status: 'active',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('INSERT INTO idempotency_commands')) {
        events.push('claim');
        return {
          rows: [{ id: '44444444-4444-4444-8444-444444444444' }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('UPDATE room_owner_assignments')) {
        events.push('assignment-shorten');
        assert.match(normalized, /assignment_status = 'released'/);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('INSERT INTO business_events')) {
        events.push('outbox');
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('UPDATE idempotency_commands')) {
        events.push('complete');
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected W10 owner SQL: ${normalized}`);
    },
    release: () => {
      releases += 1;
      events.push('release');
    },
  };
  const auditClients: unknown[] = [];
  const service = new PropertyOwnerManagementService(databaseServiceWithClient(sentinel), {
    write: (_entry: unknown, client: unknown) => {
      auditClients.push(client);
      events.push('audit');
    },
  } as never);

  const released = await service.releaseAssignment(
    actor(),
    ownerId,
    'room',
    assignmentId,
    {
      property_id: propertyId,
      effective_until: '2026-09-01',
      reason: 'Transfer to the new owner',
    },
    'w10-owner-release-key-0001',
    { correlationId: 'w10-owner-release-shortening' },
  );
  assert.deepEqual(released, {
    assignment_id: assignmentId,
    ownership_kind: 'room',
    status: 'released',
  });
  assert.deepEqual(auditClients, [sentinel]);
  assert.deepEqual(events, [
    'begin',
    'claim',
    'owner-lock',
    'assignment-lock',
    'assignment-shorten',
    'audit',
    'outbox',
    'complete',
    'commit',
    'release',
  ]);

  await assert.rejects(
    service.releaseAssignment(
      actor(),
      ownerId,
      'room',
      assignmentId,
      {
        property_id: propertyId,
        effective_until: '2026-10-01',
        reason: 'Must not remove overlap protection',
      },
      'w10-owner-release-key-0002',
      { correlationId: 'w10-owner-release-not-shortening' },
    ),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'PROPERTY_OWNER_ASSIGNMENT_RELEASE_NOT_SHORTENING',
        message: 'Ownership release must shorten the current effective period',
      });
      return true;
    },
  );
  assert.deepEqual(events.slice(-6), [
    'begin',
    'claim',
    'owner-lock',
    'assignment-lock',
    'rollback',
    'release',
  ]);
  assert.equal(releases, 2);
});

void test('migration checksum, authority vocabulary, permissions, and module wiring are frozen', () => {
  const migration = readFileSync(resolve(root, migrationPath), 'utf8');
  const hardeningMigration = readFileSync(resolve(root, hardeningMigrationPath), 'utf8');
  const a3Migration = readFileSync(resolve(root, a3MigrationPath), 'utf8');
  const manifest = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '035_property_owner_management.sql',
  );
  assert.ok(manifest);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifest.checksumSha256);
  const hardeningManifest = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '036_property_owner_authority_hardening.sql',
  );
  assert.ok(hardeningManifest);
  assert.equal(
    createHash('sha256').update(hardeningMigration).digest('hex'),
    hardeningManifest.checksumSha256,
  );
  const a3Manifest = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '037_property_owner_service_coverage_authority.sql',
  );
  assert.ok(a3Manifest);
  assert.equal(createHash('sha256').update(a3Migration).digest('hex'), a3Manifest.checksumSha256);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS property_owner_profiles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS building_owner_assignments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS room_owner_assignments/);
  assert.match(migration, /building_owner_assignments_no_overlap/);
  assert.match(migration, /room_owner_assignments_no_overlap/);
  assert.match(migration, /assignment_status IN \('scheduled', 'active', 'released'\)/);
  assert.match(migration, /assignment_status <> 'released' OR effective_until IS NOT NULL/);
  assert.match(migration, /asset_category <> 'rukost'/);
  assert.match(migration, /asset_category <> 'apartkost'/);
  assert.match(migration, /'property_owner\.report\.view'/);
  assert.match(migration, /1800000, 1500000, 300000/);
  assert.match(migration, /'collected_and_earned', 5, 1/);
  assert.match(migration, /length\(btrim\(email\)\) > 0/);
  assert.match(migration, /payment_id UUID NOT NULL REFERENCES payments/);
  assert.match(
    migration,
    /settlement_status IN \('draft', 'ready_for_review', 'approved', 'paid', 'void'\)/,
  );
  assert.match(
    migration,
    /permissions\.code IN \('property\.read', 'room\.read', 'resident\.read', 'billing\.read'\)/,
  );
  assert.match(hardeningMigration, /PROPERTY_OWNER_EARNING_SCOPE_MISMATCH/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_EARNING_POLICY_UNAVAILABLE/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_EARNING_ASSIGNMENT_MISMATCH/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_EARNING_APPEND_ONLY/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_SETTLEMENT_IMMUTABLE/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_SETTLEMENT_LINE_APPEND_ONLY/);
  assert.match(hardeningMigration, /CREATE TABLE IF NOT EXISTS property_owner_earning_adjustments/);
  assert.match(hardeningMigration, /effective_month DATE NOT NULL/);
  assert.match(
    hardeningMigration,
    /CREATE TABLE IF NOT EXISTS property_owner_payout_destination_snapshots/,
  );
  assert.match(hardeningMigration, /CREATE TABLE IF NOT EXISTS property_owner_payouts/);
  assert.match(
    hardeningMigration,
    /payout_destination_snapshot_id UUID NOT NULL REFERENCES property_owner_payout_destination_snapshots/,
  );
  assert.match(hardeningMigration, /PROPERTY_OWNER_PAYOUT_SETTLEMENT_UNAVAILABLE/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_PAYOUT_REMAINDER_EXCEEDED/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_PAYOUT_DESTINATION_SCOPE_MISMATCH/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_SETTLEMENT_LINE_PERIOD_MISMATCH/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_ADJUSTMENT_PERIOD_MISMATCH/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_SETTLEMENT_PAYOUT_RECONCILIATION_MISMATCH/);
  assert.match(hardeningMigration, /FOR UPDATE/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_SETTLEMENT_RECONCILIATION_MISMATCH/);
  assert.match(hardeningMigration, /property_owner_settlements_owner_period_unique/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_ADJUSTMENT_APPEND_ONLY/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_PAYOUT_APPEND_ONLY/);
  assert.match(hardeningMigration, /PROPERTY_OWNER_PAYOUT_DESTINATION_SNAPSHOT_IMMUTABLE/);
  assert.match(a3Migration, /service_from DATE/);
  assert.match(a3Migration, /service_until DATE/);
  assert.match(a3Migration, /payment_allocation_id UUID REFERENCES payment_allocations/);
  assert.match(a3Migration, /property_owner_earnings_service_coverage_no_overlap/);
  assert.match(a3Migration, /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_REQUIRED/);
  assert.match(a3Migration, /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE/);
  assert.match(a3Migration, /PROPERTY_OWNER_EARNING_SERVICE_LIFECYCLE_MISMATCH/);
  assert.match(a3Migration, /PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_GAP/);
  assert.match(a3Migration, /PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_RECONCILIATION_MISMATCH/);
  assert.match(a3Migration, /PROPERTY_OWNER_SETTLEMENT_LINE_SERVICE_COVERAGE_REQUIRED/);
  assert.match(a3Migration, /PROPERTY_OWNER_ADJUSTMENT_SERVICE_COVERAGE_REQUIRED/);

  const appModule = readFileSync(resolve(root, 'src/app.module.ts'), 'utf8');
  assert.match(appModule, /PropertyOwnerManagementModule/);
  for (const modulePath of [
    'src/modules/property/property.module.ts',
    'src/modules/room/room.module.ts',
    'src/modules/resident/resident.module.ts',
    'src/modules/occupancy/occupancy.module.ts',
    'src/modules/billing/billing.module.ts',
    'src/modules/complaint/complaint.module.ts',
    'src/modules/vehicle/vehicle.module.ts',
  ]) {
    assert.doesNotMatch(
      readFileSync(resolve(root, modulePath), 'utf8'),
      /PropertyOwner[A-Za-z]+Controller/,
    );
  }
});

void test(
  'migration 036 applies, replays, enforces financial authority, and rolls back on a disposable PostgreSQL cluster',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const migration035 = readFileSync(resolve(root, migrationPath), 'utf8');
    const migration036 = readFileSync(resolve(root, hardeningMigrationPath), 'utf8');
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w10-owner-036-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w10-owner-036-rollback-'));
    const executable = (name: string) =>
      join(bin, process.platform === 'win32' ? `${name}.exe` : name);
    const init = (directory: string) => {
      const result = spawnSync(
        executable('initdb'),
        ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(
        result.status,
        0,
        `disposable PostgreSQL initialization failed: ${result.stderr}`,
      );
    };
    const startServer = async (directory: string, port: number) => {
      const start = spawn(
        executable('pg_ctl'),
        ['-D', directory, '-o', `-h 127.0.0.1 -p ${port}`, '-W', 'start'],
        { detached: true, stdio: 'ignore', windowsHide: true },
      );
      start.unref();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const readiness = spawnSync(
          executable('pg_isready'),
          ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres'],
          { encoding: 'utf8', windowsHide: true },
        );
        if (readiness.status === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail('disposable 036 server did not become ready');
    };
    const stopServer = async (directory: string, port: number) => {
      const stop = spawn(executable('pg_ctl'), ['-D', directory, '-m', 'immediate', '-W', 'stop'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      stop.unref();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const readiness = spawnSync(
          executable('pg_isready'),
          ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres'],
          { encoding: 'utf8', windowsHide: true },
        );
        if (readiness.status !== 0) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail('disposable 036 server did not stop');
    };
    let sqlSequence = 0;
    const psql = (port: number, sql: string, tuplesOnly = false) => {
      const sqlFile = join(
        tmpdir(),
        `kostation-w10-owner-036-${process.pid}-${(sqlSequence += 1)}.sql`,
      );
      writeFileSync(sqlFile, sql, 'utf8');
      try {
        return spawnSync(
          executable('psql'),
          [
            '-h',
            '127.0.0.1',
            '-p',
            String(port),
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-v',
            'ON_ERROR_STOP=1',
            ...(tuplesOnly ? ['-At'] : []),
            '-f',
            sqlFile,
          ],
          { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        );
      } finally {
        rmSync(sqlFile, { force: true });
      }
    };
    const prelude = `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active');
      CREATE TABLE users (id UUID PRIMARY KEY, email TEXT, phone TEXT, password_hash TEXT, display_name TEXT, user_status TEXT, password_changed_at TIMESTAMPTZ);
      CREATE TABLE roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, is_system_role BOOLEAN NOT NULL DEFAULT true);
      CREATE TABLE permissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT);
      CREATE TABLE role_permissions (role_id UUID NOT NULL REFERENCES roles(id), permission_id UUID NOT NULL REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));
      CREATE TABLE room_buildings (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), building_code TEXT, building_name TEXT, category TEXT, gender_policy TEXT);
      CREATE TABLE rooms (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), building_id UUID REFERENCES room_buildings(id), room_code TEXT, category TEXT, gender_policy TEXT, room_status TEXT);
      CREATE TABLE leases (id UUID PRIMARY KEY);
      CREATE TABLE payments (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id));
      INSERT INTO properties (id) VALUES ('${propertyId}'), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      INSERT INTO roles (code, name) VALUES ('owner', 'Owner'), ('manager', 'Manager'), ('admin', 'Admin');
      INSERT INTO permissions (code, name) VALUES ('property.read', 'Property read'), ('room.read', 'Room read'), ('resident.read', 'Resident read'), ('billing.read', 'Billing read');
      INSERT INTO users (id, email, display_name, user_status) VALUES
        ('${actorId}', 'admin@kostation.test', 'Admin', 'active'),
        ('33333333-3333-4333-8333-333333333333', 'owner-a@kostation.test', 'Owner A', 'active');
      INSERT INTO room_buildings (id, property_id, building_code, category) VALUES
        ('88888888-8888-4888-8888-888888888888', '${propertyId}', 'AK-01', 'apartkost');
      INSERT INTO rooms (id, property_id, building_id, room_code, category, room_status) VALUES
        ('99999999-9999-4999-8999-999999999999', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-01', 'apartkost', 'occupied');
      INSERT INTO payments (id, property_id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${propertyId}');
    `;
    const authorityProof = `
      -- Migration 035 seeds its first policy at CURRENT_DATE. This proof needs an
      -- August earning month regardless of when it is run, so make that seeded
      -- policy authoritative for the complete fixture period.
      UPDATE property_owner_commercial_policies
         SET effective_from = '2026-01-01'
       WHERE property_id = '${propertyId}'
         AND policy_status = 'active';
      INSERT INTO property_owner_profiles (id, property_id, user_id, full_name, email) VALUES
        ('55555555-5555-4555-8555-555555555555', '${propertyId}', '33333333-3333-4333-8333-333333333333', 'Owner A', 'owner-a@kostation.test');
      INSERT INTO room_owner_assignments (id, property_id, owner_profile_id, room_id, effective_from, assignment_status, reason)
      VALUES ('66666666-6666-4666-8666-666666666666', '${propertyId}', '55555555-5555-4555-8555-555555555555', '99999999-9999-4999-8999-999999999999', '2026-08-01', 'active', 'Valid Apart Kost assignment');
      INSERT INTO property_owner_earnings (id, property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, payment_id, earning_month, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
      SELECT '77777777-7777-4777-8777-777777777777', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'room', '66666666-6666-4666-8666-666666666666', '99999999-9999-4999-8999-999999999999', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-08-01', 1800000, 1500000, 300000, id
      FROM property_owner_commercial_policies WHERE property_id = '${propertyId}';
      INSERT INTO payments (id, property_id) VALUES ('abababab-abab-4bab-8bab-abababababab', '${propertyId}');
      INSERT INTO property_owner_earnings (id, property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, payment_id, earning_month, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
      SELECT '78787878-7878-4787-8787-787878787878', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'room', '66666666-6666-4666-8666-666666666666', '99999999-9999-4999-8999-999999999999', 'abababab-abab-4bab-8bab-abababababab', '2026-09-01', 1800000, 1500000, 300000, id
      FROM property_owner_commercial_policies WHERE property_id = '${propertyId}';
      INSERT INTO property_owner_settlements (id, property_id, owner_profile_id, period_start, period_end, gross_amount, owner_amount, operator_fee_amount)
      VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${propertyId}', '55555555-5555-4555-8555-555555555555', '2026-08-01', '2026-08-31', 1800000, 1500000, 300000);
      INSERT INTO property_owner_settlement_lines (settlement_id, earning_id)
      VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '77777777-7777-4777-8777-777777777777');
      INSERT INTO property_owner_payout_destination_snapshots (id, property_id, owner_profile_id, destination_kind, destination_ciphertext, destination_mask, created_by_user_id)
      VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'bank_account', decode('deadbeef', 'hex'), 'Bank ****1234', '${actorId}');
      INSERT INTO property_owner_earning_adjustments (id, property_id, owner_profile_id, settlement_id, earning_id, effective_month, adjustment_kind, gross_amount_delta, owner_amount_delta, operator_fee_amount_delta, reason)
      VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '77777777-7777-4777-8777-777777777777', '2026-08-01', 'refund', -120, -100, -20, 'Approved refund correction');
      DO $preapproval$
      BEGIN
        BEGIN
          INSERT INTO property_owner_settlement_lines (settlement_id, earning_id)
          VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '78787878-7878-4787-8787-787878787878');
          RAISE EXCEPTION 'W10_OWNER_SETTLEMENT_LINE_PERIOD_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          UPDATE property_owner_earning_adjustments SET reason = 'changed' WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
          RAISE EXCEPTION 'W10_OWNER_ADJUSTMENT_MUTATION_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        UPDATE property_owner_settlements
           SET settlement_status = 'ready_for_review'
         WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        BEGIN
          UPDATE property_owner_settlements
             SET settlement_status = 'approved', approved_by_user_id = '${actorId}'
           WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
          RAISE EXCEPTION 'W10_OWNER_RECONCILIATION_MISMATCH_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        UPDATE property_owner_settlements
           SET gross_amount = 1799880, owner_amount = 1499900, operator_fee_amount = 299980
         WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        UPDATE property_owner_settlements SET settlement_status = 'ready_for_review' WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        BEGIN
          INSERT INTO property_owner_payouts (property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
          VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'bank_transfer', 'TRX-PRE-APPROVAL', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
          RAISE EXCEPTION 'W10_OWNER_PREAPPROVAL_PAYOUT_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          INSERT INTO property_owner_earning_adjustments (property_id, owner_profile_id, settlement_id, earning_id, effective_month, adjustment_kind, gross_amount_delta, owner_amount_delta, operator_fee_amount_delta, reason)
          VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '77777777-7777-4777-8777-777777777777', '2026-09-01', 'refund', -12, -10, -2, 'Out of period adjustment');
          RAISE EXCEPTION 'W10_OWNER_ADJUSTMENT_PERIOD_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
      END
      $preapproval$;
      UPDATE property_owner_settlements SET settlement_status = 'approved', approved_by_user_id = '${actorId}' WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      DO $paid_without_payout$
      BEGIN
        BEGIN
          UPDATE property_owner_settlements SET settlement_status = 'paid', paid_at = now() WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
          RAISE EXCEPTION 'W10_OWNER_PAID_WITHOUT_PAYOUT_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
      END
      $paid_without_payout$;
      INSERT INTO property_owner_payouts (id, property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
      VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1000000, 'bank_transfer', 'TRX-OWNER-001', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
      DO $constraints$
      BEGIN
        BEGIN
          UPDATE property_owner_payout_destination_snapshots
          SET destination_mask = 'Bank ****9999'
          WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
          RAISE EXCEPTION 'W10_OWNER_PAYOUT_DESTINATION_SNAPSHOT_MUTATION_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          INSERT INTO property_owner_settlements (property_id, owner_profile_id, period_start, period_end, gross_amount, owner_amount, operator_fee_amount)
          VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', '2026-08-01', '2026-08-31', 0, 0, 0);
          RAISE EXCEPTION 'W10_OWNER_DUPLICATE_SETTLEMENT_ACCEPTED';
        EXCEPTION WHEN unique_violation THEN NULL; END;
        BEGIN
          INSERT INTO property_owner_payouts (property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
          VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 600000, 'bank_transfer', 'TRX-OWNER-002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
          RAISE EXCEPTION 'W10_OWNER_PAYOUT_CAP_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          UPDATE property_owner_payouts SET payout_reference = 'changed' WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
          RAISE EXCEPTION 'W10_OWNER_PAYOUT_MUTATION_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          UPDATE property_owner_earnings SET owner_earned_amount = 1 WHERE id = '77777777-7777-4777-8777-777777777777';
          RAISE EXCEPTION 'W10_OWNER_EARNING_MUTATION_ACCEPTED';
        EXCEPTION WHEN check_violation THEN NULL; END;
      END
      $constraints$;
    `;
    let replayPort: number | null = null;
    let rollbackPort: number | null = null;
    try {
      init(replayDirectory);
      const port = 56000 + Math.floor(Math.random() * 2000);
      replayPort = port;
      await startServer(replayDirectory, port);
      const firstApply = psql(port, `${prelude}\n${migration035}\n${migration036}`);
      assert.equal(
        firstApply.status,
        0,
        `disposable 036 first-apply proof failed: ${firstApply.stderr || firstApply.stdout || firstApply.error?.message || 'no output'}`,
      );
      const replay = psql(port, migration036);
      assert.equal(
        replay.status,
        0,
        `disposable 036 immediate replay proof failed: ${replay.stderr || replay.stdout}`,
      );
      const authority = psql(port, authorityProof);
      assert.equal(
        authority.status,
        0,
        `disposable 036 authority proof failed: ${authority.stderr || authority.stdout}`,
      );
      try {
        const locker = spawn(
          executable('psql'),
          [
            '-h',
            '127.0.0.1',
            '-p',
            String(port),
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-v',
            'ON_ERROR_STOP=1',
            '-At',
          ],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        let lockOutput = '';
        let lockError = '';
        const lockExit = new Promise<number | null>((resolve, reject) => {
          locker.once('close', resolve);
          locker.once('error', reject);
        });
        const lockReady = new Promise<void>((resolve, reject) => {
          locker.stdout.on('data', (chunk: Buffer) => {
            lockOutput += chunk.toString();
            if (lockOutput.includes('W10_OWNER_PAYOUT_LOCK_ACQUIRED')) resolve();
          });
          locker.stderr.on('data', (chunk: Buffer) => {
            lockError += chunk.toString();
          });
          locker.once('close', (code) => {
            if (!lockOutput.includes('W10_OWNER_PAYOUT_LOCK_ACQUIRED')) {
              reject(new Error(`payout lock process exited ${code}: ${lockError}`));
            }
          });
        });
        locker.stdin.write(`
          BEGIN;
          SELECT 1 FROM property_owner_settlements
           WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
           FOR UPDATE;
          \\echo W10_OWNER_PAYOUT_LOCK_ACQUIRED
        `);
        await Promise.race([
          lockReady,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('payout lock was not acquired')), 5_000),
          ),
        ]);
        const blocked = psql(
          port,
          `
          SET lock_timeout = '150ms';
          INSERT INTO property_owner_payouts (id, property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
          VALUES ('12121212-1212-4212-8212-121212121212', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 250000, 'bank_transfer', 'TRX-OWNER-CONCURRENT-A', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        `,
        );
        assert.notEqual(blocked.status, 0, 'concurrent payout must wait for the settlement lock');
        assert.match(`${blocked.stdout}\n${blocked.stderr}`, /lock timeout/i);
        locker.stdin.end('COMMIT;\n\\q\n');
        const lockExitCode = await Promise.race([
          lockExit,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('payout lock transaction did not close')), 5_000),
          ),
        ]);
        assert.equal(lockExitCode, 0, 'payout lock transaction must complete');
        const firstPayout = psql(
          port,
          `
          INSERT INTO property_owner_payouts (id, property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
          VALUES ('12121212-1212-4212-8212-121212121212', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 250000, 'bank_transfer', 'TRX-OWNER-CONCURRENT-A', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        `,
        );
        assert.equal(
          firstPayout.status,
          0,
          `first concurrent payout failed: ${firstPayout.stderr}`,
        );
        const capped = psql(
          port,
          `
          INSERT INTO property_owner_payouts (id, property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
          VALUES ('13131313-1313-4313-8313-131313131313', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 300000, 'bank_transfer', 'TRX-OWNER-CONCURRENT-B', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        `,
        );
        assert.notEqual(
          capped.status,
          0,
          'payout must be capped after the serialized prior payout',
        );
        assert.match(
          `${capped.stdout}\n${capped.stderr}`,
          /PROPERTY_OWNER_PAYOUT_REMAINDER_EXCEEDED/,
        );
        const finalPayout = psql(
          port,
          `
          INSERT INTO property_owner_payouts (id, property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id)
          VALUES ('14141414-1414-4414-8414-141414141414', '${propertyId}', '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 249900, 'bank_transfer', 'TRX-OWNER-FINAL', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
        `,
        );
        assert.equal(finalPayout.status, 0, `final payout failed: ${finalPayout.stderr}`);
        const paid = psql(
          port,
          `
          UPDATE property_owner_settlements
             SET settlement_status = 'paid', paid_at = now()
           WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        `,
        );
        assert.equal(paid.status, 0, `paid transition failed: ${paid.stderr}`);
      } finally {
        await stopServer(replayDirectory, port);
        replayPort = null;
      }

      init(rollbackDirectory);
      const rollbackProofPort = 58000 + Math.floor(Math.random() * 2000);
      rollbackPort = rollbackProofPort;
      await startServer(rollbackDirectory, rollbackProofPort);
      const failedMigration = migration036.replace(
        /COMMIT;\s*$/,
        "DO $$ BEGIN RAISE EXCEPTION 'W10_OWNER_036_SYNTHETIC_ROLLBACK'; END $$; COMMIT;",
      );
      const setup = psql(rollbackProofPort, `${prelude}\n${migration035}`);
      assert.equal(setup.status, 0, `disposable 036 rollback setup failed: ${setup.stderr}`);
      const failed = psql(rollbackProofPort, failedMigration);
      assert.match(
        `${failed.stdout}\n${failed.stderr}`,
        /ERROR:.*W10_OWNER_036_SYNTHETIC_ROLLBACK/s,
      );
      const rollback = psql(
        rollbackProofPort,
        `DO $rollback$ BEGIN
           IF to_regclass('public.property_owner_payouts') IS NOT NULL
              OR to_regclass('public.property_owner_earning_adjustments') IS NOT NULL
              OR to_regclass('public.property_owner_payout_destination_snapshots') IS NOT NULL
           THEN RAISE EXCEPTION 'W10_OWNER_036_ROLLBACK_INCOMPLETE'; END IF;
         END $rollback$;`,
      );
      assert.equal(rollback.status, 0, `disposable 036 rollback proof failed: ${rollback.stderr}`);
      await stopServer(rollbackDirectory, rollbackProofPort);
      rollbackPort = null;
    } finally {
      if (replayPort !== null) await stopServer(replayDirectory, replayPort);
      if (rollbackPort !== null) await stopServer(rollbackDirectory, rollbackPort);
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);

void test(
  'migration 035 first apply, replay, category/overlap constraints, and rollback are executable',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const migration = readFileSync(resolve(root, migrationPath), 'utf8');
    const prelude = `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active');
      CREATE TABLE users (id UUID PRIMARY KEY, email TEXT, phone TEXT, password_hash TEXT, display_name TEXT, user_status TEXT, password_changed_at TIMESTAMPTZ);
      CREATE TABLE roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, is_system_role BOOLEAN NOT NULL DEFAULT true);
      CREATE TABLE permissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT);
      CREATE TABLE role_permissions (role_id UUID NOT NULL REFERENCES roles(id), permission_id UUID NOT NULL REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));
      CREATE TABLE room_buildings (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), building_code TEXT, building_name TEXT, category TEXT, gender_policy TEXT);
      CREATE TABLE rooms (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), building_id UUID REFERENCES room_buildings(id), room_code TEXT, category TEXT, gender_policy TEXT, room_status TEXT);
      CREATE TABLE leases (id UUID PRIMARY KEY);
      CREATE TABLE payments (id UUID PRIMARY KEY);
      INSERT INTO properties (id) VALUES ('${propertyId}');
      INSERT INTO roles (code, name) VALUES ('owner', 'Owner'), ('manager', 'Manager'), ('admin', 'Admin');
      INSERT INTO permissions (code, name) VALUES
        ('property.read', 'Property read'), ('room.read', 'Room read'),
        ('resident.read', 'Resident read'), ('billing.read', 'Billing read');
    `;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w10-owner-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w10-owner-rollback-'));
    const executable = (name: string) =>
      join(bin, process.platform === 'win32' ? `${name}.exe` : name);
    const run = (directory: string, sql: string) =>
      spawnSync(executable('postgres'), ['--single', '-D', directory, 'postgres'], {
        input: sql,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
    const init = (directory: string) => {
      const result = spawnSync(
        executable('initdb'),
        ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(
        result.status,
        0,
        `disposable PostgreSQL initialization failed: ${result.stderr}`,
      );
    };
    try {
      init(replayDirectory);
      const proof = `${prelude}
        ${migration}
        DO $first$
        BEGIN
          IF (SELECT count(*) FROM property_owner_commercial_policies WHERE gross_room_month_amount = 1800000 AND owner_room_month_amount = 1500000 AND operator_room_month_fee = 300000) <> 1
             OR NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'property_owner.report.view')
             OR NOT EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.code = 'property_owner' AND p.code = 'property_owner.asset.read')
          THEN RAISE EXCEPTION 'W10_OWNER_FIRST_APPLY_INVALID'; END IF;
        END
        $first$;
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.code = 'property_owner' AND p.code IN ('property.read', 'room.read', 'resident.read', 'billing.read');
        ${migration}
        DO $replay$
        BEGIN
          IF (SELECT count(*) FROM property_owner_commercial_policies) <> 1
             OR EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.code = 'property_owner' AND p.code IN ('property.read', 'room.read', 'resident.read', 'billing.read'))
          THEN RAISE EXCEPTION 'W10_OWNER_REPLAY_INVALID'; END IF;
        END
        $replay$;
        INSERT INTO users (id, email, display_name, user_status) VALUES
          ('${actorId}', 'admin@kostation.test', 'Admin', 'active'),
          ('33333333-3333-4333-8333-333333333333', 'owner-a@kostation.test', 'Owner A', 'active'),
          ('44444444-4444-4444-8444-444444444444', 'owner-b@kostation.test', 'Owner B', 'active');
        INSERT INTO property_owner_profiles (id, property_id, user_id, full_name, email) VALUES
          ('55555555-5555-4555-8555-555555555555', '${propertyId}', '33333333-3333-4333-8333-333333333333', 'Owner A', 'owner-a@kostation.test'),
          ('66666666-6666-4666-8666-666666666666', '${propertyId}', '44444444-4444-4444-8444-444444444444', 'Owner B', 'owner-b@kostation.test');
        INSERT INTO room_buildings (id, property_id, building_code, category) VALUES
          ('77777777-7777-4777-8777-777777777777', '${propertyId}', 'RK-01', 'rukost'),
          ('88888888-8888-4888-8888-888888888888', '${propertyId}', 'AK-01', 'apartkost');
        INSERT INTO rooms (id, property_id, building_id, room_code, category, room_status) VALUES
          ('99999999-9999-4999-8999-999999999999', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-01', 'apartkost', 'vacant'),
          ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${propertyId}', '77777777-7777-4777-8777-777777777777', 'RK-01-01', 'rukost', 'vacant');
        INSERT INTO building_owner_assignments (property_id, owner_profile_id, building_id, effective_from, assignment_status, reason)
        VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777777', '2026-08-11', 'active', 'Valid Rumah Kost assignment');
        INSERT INTO room_owner_assignments (property_id, owner_profile_id, room_id, effective_from, assignment_status, reason)
        VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', '99999999-9999-4999-8999-999999999999', '2026-08-11', 'active', 'Valid Apart Kost assignment');
        DO $constraints$
        BEGIN
          BEGIN
            INSERT INTO building_owner_assignments (property_id, owner_profile_id, building_id, effective_from, assignment_status, reason)
            VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', '88888888-8888-4888-8888-888888888888', '2027-01-01', 'scheduled', 'Invalid Apart Kost building');
            RAISE EXCEPTION 'W10_OWNER_BUILDING_CATEGORY_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL; END;
          BEGIN
            INSERT INTO room_owner_assignments (property_id, owner_profile_id, room_id, effective_from, assignment_status, reason)
            VALUES ('${propertyId}', '55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2027-01-01', 'scheduled', 'Invalid Rumah Kost room');
            RAISE EXCEPTION 'W10_OWNER_ROOM_CATEGORY_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL; END;
          BEGIN
            INSERT INTO room_owner_assignments (property_id, owner_profile_id, room_id, effective_from, assignment_status, reason)
            VALUES ('${propertyId}', '66666666-6666-4666-8666-666666666666', '99999999-9999-4999-8999-999999999999', '2026-09-01', 'active', 'Overlapping owner');
            RAISE EXCEPTION 'W10_OWNER_OVERLAP_ACCEPTED';
          EXCEPTION WHEN exclusion_violation THEN NULL; END;
          UPDATE room_owner_assignments
             SET assignment_status = 'released', effective_until = '2026-10-01'
           WHERE room_id = '99999999-9999-4999-8999-999999999999';
          BEGIN
            INSERT INTO room_owner_assignments (property_id, owner_profile_id, room_id, effective_from, effective_until, assignment_status, reason)
            VALUES ('${propertyId}', '66666666-6666-4666-8666-666666666666', '99999999-9999-4999-8999-999999999999', '2026-09-01', '2026-11-01', 'scheduled', 'Released-period overlap');
            RAISE EXCEPTION 'W10_OWNER_RELEASED_OVERLAP_ACCEPTED';
          EXCEPTION WHEN exclusion_violation THEN NULL; END;
        END
        $constraints$;
      `;
      const replay = run(replayDirectory, proof);
      assert.equal(replay.status, 0, `disposable migration proof failed: ${replay.stderr}`);

      init(rollbackDirectory);
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        "DO $$ BEGIN RAISE EXCEPTION 'W10_OWNER_SYNTHETIC_ROLLBACK'; END $$; COMMIT;",
      );
      assert.notEqual(failedMigration, migration);
      const failed = run(rollbackDirectory, `${prelude}${failedMigration}`);
      assert.match(
        `${failed.stdout}\n${failed.stderr}`,
        /ERROR:.*W10_OWNER_SYNTHETIC_ROLLBACK/s,
        'synthetic migration failure was not observed',
      );
      const rollback = run(
        rollbackDirectory,
        `DO $rollback$
        BEGIN
          IF to_regclass('public.property_owner_profiles') IS NOT NULL
             OR to_regclass('public.building_owner_assignments') IS NOT NULL
             OR to_regclass('public.room_owner_assignments') IS NOT NULL
          THEN RAISE EXCEPTION 'W10_OWNER_ROLLBACK_INCOMPLETE'; END IF;
        END
        $rollback$;`,
      );
      assert.equal(rollback.status, 0, `disposable rollback proof failed: ${rollback.stderr}`);
    } finally {
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
