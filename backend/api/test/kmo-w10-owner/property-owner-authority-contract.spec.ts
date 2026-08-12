import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  release: () => void;
}): DatabaseService {
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(database, 'pool', {
    value: { connect: async () => client },
  });
  return database;
}

test('controllers freeze separate Admin mutation and exact property_owner read-only authority', () => {
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
    'property_owner.asset.read',
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

test('DTOs reject unknown fields, malformed dates, and empty Apart Kost selections', async () => {
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

test('empty or foreign property scope fails before query, transaction, or password hashing', async () => {
  let databaseCalls = 0;
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: async () => {
          databaseCalls += 1;
          return { rows: [], rowCount: 0 };
        },
      },
      transaction: async () => {
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

test('owner workspace derives scope only from authenticated account and empty scope stays empty', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: async (sql: string, params: unknown[]) => {
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
  assert.doesNotMatch(calls[0].sql, /property_id = \$1/);
});

test('owner workspace keeps a released assignment visible until its effective end date', async () => {
  const ownerProfileId = '55555555-5555-4555-8555-555555555555';
  const calls: string[] = [];
  const service = new PropertyOwnerManagementService(
    {
      client: {
        query: async (sql: string) => {
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

test('ambiguous authenticated owner profile fails closed before asset projection', async () => {
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
        query: async () => {
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

test('building assignment keeps one transaction client and rolls back before outbox or completion when audit fails', async () => {
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const buildingId = '77777777-7777-4777-8777-777777777777';
  const assignmentId = '88888888-8888-4888-8888-888888888888';
  const events: string[] = [];
  let released = 0;
  const sentinel = {
    query: async (sql: string) => {
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
    write: async (_entry: unknown, client: unknown) => {
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

test('releasing ownership shortens its protected period and rejects a non-shortening release', async () => {
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const assignmentId = '88888888-8888-4888-8888-888888888888';
  const events: string[] = [];
  let releases = 0;
  const sentinel = {
    query: async (sql: string) => {
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
    write: async (_entry: unknown, client: unknown) => {
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

test('migration checksum, authority vocabulary, permissions, and module wiring are frozen', () => {
  const migration = readFileSync(resolve(root, migrationPath), 'utf8');
  const manifest = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '035_property_owner_management.sql',
  );
  assert.ok(manifest);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifest.checksumSha256);
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
