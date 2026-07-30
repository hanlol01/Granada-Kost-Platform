import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import ts from 'typescript';
import { DatabaseService } from '../../src/infrastructure/database/database.service';
import { AdminUxMasterModule } from '../../src/modules/admin-ux-master/admin-ux-master.module';
import { AdminUxRoomV2Controller } from '../../src/modules/admin-ux-master/admin-ux-room-v2.controller';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { AdminUxRoomV2Service } from '../../src/modules/admin-ux-master/admin-ux-room-v2.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { RoomController } from '../../src/modules/room/room.controller';
import { RoomModule } from '../../src/modules/room/room.module';

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const ROOM_A = '33333333-3333-4333-8333-333333333333';
const ROOM_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_ROOM = '44444444-4444-4444-8444-444444444444';
const KOST_TYPE_A = '55555555-5555-4555-8555-555555555555';
const KOST_TYPE_B = '66666666-6666-4666-8666-666666666666';
const BUILDING_A = '77777777-7777-4777-8777-777777777777';
const BUILDING_B = '88888888-8888-4888-8888-888888888888';
const MISSING_ROOM = '99999999-9999-4999-8999-999999999999';
const V2_ACCEPT = 'application/vnd.granada.admin-ux.v2+json';
const IDEMPOTENCY_KEY = 'm15-room-command-0001';

const user = (propertyIds: string[] = [PROPERTY_A]): UserAccessContext => ({
  id: 'actor-m15',
  email: null,
  phone: null,
  displayName: 'M15 Admin',
  roles: ['admin'],
  permissions: ['room.manage'],
  propertyIds,
  sessionId: 'session-m15',
});

const context = {
  ipAddress: '127.0.0.1',
  userAgent: 'm15-contract',
  correlationId: 'correlation-m15',
};

const createBody = {
  property_id: PROPERTY_A,
  kost_type_id: KOST_TYPE_A,
  building_id: BUILDING_A,
  number: '101',
  floor_code: 'A' as const,
};

type FakeRoom = Record<string, unknown>;
type Command = {
  request_fingerprint: string;
  command_status: string;
  response_status: number | null;
  response_body: unknown;
};

class FakeDatabase {
  readonly logs: string[] = [];
  readonly events: string[] = [];
  readonly querySources: Array<{ source: 'pool' | 'transaction'; sql: string }> = [];
  transactionCount = 0;
  lifecycle = { hold: false, occupancy: false, lease: false };
  rooms = new Map<string, FakeRoom>();
  buildings = new Map<string, FakeRoom>();
  commands = new Map<string, Command>();
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.buildings.set(BUILDING_A, {
      id: BUILDING_A,
      property_id: PROPERTY_A,
      category: 'rukost',
      building_code: '01',
      building_name: 'RuKost 01',
      gender_policy: 'male',
      total_rooms: 10,
      floor_a_count: 5,
      floor_b_count: 5,
    });
    this.buildings.set(BUILDING_B, {
      id: BUILDING_B,
      property_id: PROPERTY_A,
      category: 'apartkost',
      building_code: '17',
      building_name: 'ApartKost 17',
      gender_policy: 'female',
      total_rooms: 8,
      floor_a_count: 4,
      floor_b_count: 4,
    });
    this.rooms.set(ROOM_A, this.roomRow());
  }

  readonly client = {
    query: async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) =>
      this.query<T>('pool', sql, values),
  };

  readonly transactionClient = {
    query: async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) =>
      this.query<T>('transaction', sql, values),
  };

  async transaction<T>(
    operation: (client: typeof this.transactionClient) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolveQueue) => {
      release = resolveQueue;
    });
    await previous;
    const snapshot = {
      rooms: structuredClone(this.rooms),
      buildings: structuredClone(this.buildings),
      commands: structuredClone(this.commands),
    };
    try {
      return await operation(this.transactionClient);
    } catch (error) {
      this.rooms = snapshot.rooms;
      this.buildings = snapshot.buildings;
      this.commands = snapshot.commands;
      throw error;
    } finally {
      release();
    }
  }

  addRoom(id: string, overrides: FakeRoom = {}): void {
    this.rooms.set(id, this.roomRow({ id, ...overrides }));
  }

  private roomRow(overrides: FakeRoom = {}): FakeRoom {
    return {
      id: ROOM_A,
      property_id: PROPERTY_A,
      kost_type_id: KOST_TYPE_A,
      number: '100',
      room_code: 'RK-01-A-100',
      building_id: BUILDING_A,
      category: 'rukost',
      unit_code: '01',
      gender_policy: 'male',
      floor: '2',
      floor_code: 'A',
      floor_label: 'Lantai Atas / LT.2',
      size_label: '3 x 4 m',
      room_status: 'vacant',
      primary_photo_file_id: null,
      public_visible: true,
      created_at: '2026-07-28T00:00:00.000Z',
      updated_at: '2026-07-28T00:00:00.000Z',
      monthly_price: 1_800_000,
      yearly_price: 0,
      deposit_amount: 0,
      ...overrides,
    };
  }

  private enriched(room: FakeRoom): FakeRoom {
    const building = this.buildings.get(String(room.building_id));
    const apart = room.kost_type_id === KOST_TYPE_B;
    return {
      ...room,
      kost_type_name: apart ? 'Apart Kost' : 'Rumah Kost',
      kost_type_slug: apart ? 'apartkost' : 'rukost',
      kost_type_category: apart ? 'apartkost' : 'rukost',
      building_code: building?.building_code,
      building_name: building?.building_name,
    };
  }

  private commandKey(actor: unknown, route: unknown, key: unknown): string {
    return `${String(actor)}|${String(route)}|${String(key)}`;
  }

  private async query<T extends Record<string, unknown>>(
    source: 'pool' | 'transaction',
    sql: string,
    values: unknown[],
  ) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.logs.push(normalized);
    this.events.push(normalized);
    this.querySources.push({ source, sql: normalized });

    if (/^SELECT id FROM properties/.test(normalized)) return { rows: [{ id: PROPERTY_A }] as T[] };
    if (/^INSERT INTO idempotency_commands/.test(normalized)) {
      const commandKey = this.commandKey(values[1], values[2], values[3]);
      if (this.commands.has(commandKey)) return { rows: [] as T[] };
      const command = {
        request_fingerprint: String(values[4]),
        command_status: 'pending',
        response_status: null,
        response_body: null,
      };
      this.commands.set(commandKey, command);
      return { rows: [command] as T[] };
    }
    if (/^SELECT request_fingerprint.+FROM idempotency_commands/.test(normalized)) {
      const command = this.commands.get(this.commandKey(values[0], values[1], values[2]));
      return { rows: command ? ([command] as T[]) : ([] as T[]) };
    }
    if (/^UPDATE idempotency_commands/.test(normalized)) {
      const command = this.commands.get(this.commandKey(values[0], values[5], values[6]));
      assert.ok(command);
      command.command_status = 'succeeded';
      command.response_status = Number(values[1]);
      command.response_body = JSON.parse(String(values[2]));
      return { rows: [] as T[] };
    }
    if (/^SELECT property_id FROM rooms/.test(normalized)) {
      const room = this.rooms.get(String(values[0]));
      const scope = values[1] as string[] | null;
      return {
        rows:
          room && (scope === null || scope.includes(String(room.property_id)))
            ? ([{ property_id: room.property_id }] as T[])
            : ([] as T[]),
      };
    }
    if (/^SELECT \* FROM rooms WHERE id = \$1 AND property_id = \$2 FOR UPDATE/.test(normalized)) {
      const room = this.rooms.get(String(values[0]));
      return {
        rows:
          room && room.property_id === values[1] ? ([structuredClone(room)] as T[]) : ([] as T[]),
      };
    }
    if (/^SELECT \* FROM room_buildings/.test(normalized)) {
      const ids = values[1] as string[];
      return {
        rows: ids
          .map((id) => this.buildings.get(id))
          .filter((row) => row?.property_id === values[0])
          .map((row) => structuredClone(row)) as T[],
      };
    }
    if (/^SELECT \* FROM kost_types/.test(normalized)) {
      const category = values[0] === KOST_TYPE_B ? 'apartkost' : 'rukost';
      return {
        rows:
          values[1] === PROPERTY_A
            ? ([
                {
                  id: values[0],
                  property_id: PROPERTY_A,
                  category,
                  status: 'active',
                  monthly_price: 1_800_000,
                  yearly_price: 0,
                  deposit_amount: 0,
                },
              ] as T[])
            : ([] as T[]),
      };
    }
    if (/^SELECT id FROM files/.test(normalized)) return { rows: [{ id: values[0] }] as T[] };
    if (/^SELECT id FROM booking_lead_holds/.test(normalized))
      return { rows: this.lifecycle.hold ? ([{ id: 'hold' }] as T[]) : ([] as T[]) };
    if (/^SELECT id FROM occupancies/.test(normalized))
      return { rows: this.lifecycle.occupancy ? ([{ id: 'occupancy' }] as T[]) : ([] as T[]) };
    if (/^SELECT id FROM leases/.test(normalized))
      return { rows: this.lifecycle.lease ? ([{ id: 'lease' }] as T[]) : ([] as T[]) };
    if (/^INSERT INTO rooms/.test(normalized)) {
      const duplicate = [...this.rooms.values()].some(
        (room) => room.property_id === values[0] && room.number === values[2],
      );
      if (duplicate) {
        const error = new Error('duplicate room number') as Error & { code: string };
        error.code = '23505';
        throw error;
      }
      this.rooms.set(
        NEW_ROOM,
        this.roomRow({
          id: NEW_ROOM,
          property_id: values[0],
          kost_type_id: values[1],
          number: values[2],
          room_code: values[3],
          building_id: values[4],
          category: values[5],
          unit_code: values[6],
          gender_policy: values[7],
          floor: values[8],
          floor_code: values[9],
          floor_label: values[10],
          size_label: values[11],
          monthly_price: values[12],
          yearly_price: values[13],
          deposit_amount: values[14],
          room_status: 'vacant',
          primary_photo_file_id: values[15],
          public_visible: values[16],
        }),
      );
      return { rows: [{ id: NEW_ROOM }] as T[] };
    }
    if (/^UPDATE rooms SET kost_type_id/.test(normalized)) {
      const room = this.rooms.get(String(values[0]));
      if (!room || room.property_id !== values[1]) return { rows: [] as T[] };
      Object.assign(room, {
        kost_type_id: values[2],
        number: values[3],
        room_code: values[4],
        building_id: values[5],
        category: values[6],
        unit_code: values[7],
        gender_policy: values[8],
        floor: values[9],
        floor_code: values[10],
        floor_label: values[11],
        size_label: values[12],
        primary_photo_file_id: values[13],
        public_visible: values[14],
        monthly_price: values[15],
        yearly_price: values[16],
        deposit_amount: values[17],
      });
      return { rows: [{ id: room.id }] as T[] };
    }
    if (/^UPDATE room_buildings/.test(normalized)) {
      const building = this.buildings.get(String(values[0]));
      assert.ok(building);
      const total = Number(building.total_rooms) + Number(values[1]);
      const floorA = Number(building.floor_a_count) + Number(values[2]);
      const floorB = Number(building.floor_b_count) + Number(values[3]);
      if (total < 0 || floorA < 0 || floorB < 0) return { rows: [] as T[] };
      Object.assign(building, { total_rooms: total, floor_a_count: floorA, floor_b_count: floorB });
      return { rows: [{ id: building.id }] as T[] };
    }
    if (/^SELECT room\.id/.test(normalized) && /FROM rooms room/.test(normalized)) {
      const room = this.rooms.get(String(values[0]));
      return {
        rows:
          room && (values[1] === null || room.property_id === values[1])
            ? ([this.enriched(room)] as T[])
            : ([] as T[]),
      };
    }
    if (/^SELECT assignment\.kost_type_id/.test(normalized)) return { rows: [] as T[] };
    throw new Error(`Unhandled fake SQL: ${normalized}`);
  }
}

function fixture(options: { auditFailure?: boolean } = {}) {
  const database = new FakeDatabase();
  const audits: Array<Record<string, unknown>> = [];
  const audit = {
    write: async (input: Record<string, unknown>, client: unknown) => {
      database.events.push('AUDIT');
      assert.equal(client, database.transactionClient);
      if (options.auditFailure) throw new Error('audit unavailable');
      audits.push(input);
    },
  };
  const properties = {
    assertCanReadProperty: async (actor: UserAccessContext, propertyId: string) => {
      if (!actor.roles.includes('owner') && !actor.propertyIds.includes(propertyId)) {
        throw new ForbiddenException({ code: 'PROPERTY_SCOPE_DENIED' });
      }
    },
  };
  return {
    database,
    audits,
    service: new AdminUxRoomV2Service(database as never, properties as never, audit as never),
  };
}

function request(accept: string | undefined, key?: string) {
  return {
    headers: { accept, 'idempotency-key': key, 'user-agent': 'm15-contract' },
    ip: '127.0.0.1',
    correlationId: 'correlation-m15',
  } as never;
}

function errorCode(error: unknown): unknown {
  assert.ok(error instanceof HttpException);
  const response = error.getResponse();
  return typeof response === 'object' && response !== null
    ? (response as { code?: unknown }).code
    : undefined;
}

async function rejectsCode(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error) => errorCode(error) === code);
}

function assertUnknownBodyParameter(methodName: 'create' | 'update', parameterIndex: number): void {
  const source = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/room/room.controller.ts'),
    'utf8',
  );
  const sourceFile = ts.createSourceFile(
    'room.controller.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  assert.deepEqual(diagnostics, []);
  const roomController = sourceFile.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === 'RoomController',
  );
  assert.ok(roomController);
  const method = roomController.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === methodName,
  );
  assert.ok(method);
  const body = method.parameters[parameterIndex];
  assert.ok(body && ts.isIdentifier(body.name) && body.name.text === 'dto');
  assert.equal(body.type?.kind, ts.SyntaxKind.UnknownKeyword);
}

test('registered RoomController forwards V2 idempotency keys and preserves legacy dispatch', async () => {
  const legacyCalls: Array<{ operation: string; body: Record<string, unknown> }> = [];
  const v2Calls: Array<{ operation: string; body: unknown; key: unknown }> = [];
  const controller = new RoomController(
    {
      createRoom: async (_user: unknown, body: Record<string, unknown>) =>
        legacyCalls.push({ operation: 'create', body }),
      updateRoom: async (_user: unknown, _roomId: unknown, body: Record<string, unknown>) =>
        legacyCalls.push({ operation: 'update', body }),
    } as never,
    {
      create: async (...args: unknown[]) =>
        v2Calls.push({ operation: 'create', body: args[1], key: args[3] }),
      rejectRoutineCreate: async (_user: unknown, propertyId: string) =>
        legacyCalls.push({ operation: 'create', body: { property_id: propertyId } }),
      update: async (...args: unknown[]) =>
        v2Calls.push({ operation: 'update', body: args[2], key: args[4] }),
    } as never,
  );

  const rawV2Create = { ...createBody, public_visible: 'false' };
  const rawV2Update = { number: '102', public_visible: 'false' };
  await controller.create(user(), rawV2Create, request(V2_ACCEPT, IDEMPOTENCY_KEY));
  await controller.update(user(), ROOM_A, rawV2Update, request(V2_ACCEPT, IDEMPOTENCY_KEY));
  assert.deepEqual(v2Calls, [
    { operation: 'create', body: rawV2Create, key: IDEMPOTENCY_KEY },
    { operation: 'update', body: rawV2Update, key: IDEMPOTENCY_KEY },
  ]);
  assert.equal(legacyCalls.length, 0);

  await controller.create(user(), createBody, request(undefined));
  await controller.update(user(), ROOM_A, { number: '102' }, request(undefined));
  assert.deepEqual(
    legacyCalls.map(({ operation, body }) => ({ operation, publicVisible: body.public_visible })),
    [
      { operation: 'create', publicVisible: undefined },
      { operation: 'update', publicVisible: undefined },
    ],
  );
  await rejectsCode(
    () => controller.create(user(), { ...createBody, legacy_unknown: true }, request(undefined)),
    'VALIDATION_ERROR',
  );
  assert.equal(legacyCalls.length, 2);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, RoomController), [
    'owner',
    'manager',
    'admin',
    'property_owner',
  ]);
  assert.equal(Reflect.getOwnMetadata(ROLES_KEY, RoomController.prototype.create), undefined);
  assert.equal(Reflect.getOwnMetadata(ROLES_KEY, RoomController.prototype.update), undefined);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.create), [
    'room.manage',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.update), [
    'room.manage',
  ]);
  assertUnknownBodyParameter('create', 1);
  assertUnknownBodyParameter('update', 2);
});

test('live route remains singular and dormant V2 controller stays unregistered', () => {
  const registered = [RoomModule, AdminUxMasterModule].flatMap(
    (module) => (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? []) as unknown[],
  );
  assert.equal(registered.filter((controller) => controller === RoomController).length, 1);
  assert.equal(registered.includes(AdminUxRoomV2Controller), false);
});

test('V2 runtime DTO validation rejects malformed bodies before fixed-inventory authority', async () => {
  for (const invalid of [
    { ...createBody, floor_code: undefined },
    { ...createBody, property_id: 'not-v4' },
    { ...createBody, number: ' '.repeat(2) },
    { ...createBody, number: 'x'.repeat(81) },
    { ...createBody, gender_policy: 'mixed' },
    { ...createBody, legacy_only_field: true },
  ]) {
    const current = fixture();
    await assert.rejects(() => current.service.create(user(), invalid, context, IDEMPOTENCY_KEY));
    assert.equal(current.database.transactionCount, 0);
  }
  const malformedUpdate = fixture();
  await assert.rejects(() =>
    malformedUpdate.service.update(user(), ROOM_A, { number: ' ' }, context, IDEMPOTENCY_KEY),
  );
  assert.equal(malformedUpdate.database.transactionCount, 0);

  for (const [raw, expected] of [
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ] as const) {
    const updateFixture = fixture();
    const updateResponse = await updateFixture.service.update(
      user(),
      ROOM_A,
      { public_visible: raw },
      context,
      `${IDEMPOTENCY_KEY}-update-boolean-${String(raw)}`,
    );
    assert.equal(updateResponse.data.public_visible, expected);
  }

  for (const raw of ['1', '0', '', 'yes', 1, 0, {}, []]) {
    const updateFixture = fixture();
    await rejectsCode(
      () =>
        updateFixture.service.update(
          user(),
          ROOM_A,
          { public_visible: raw },
          context,
          `${IDEMPOTENCY_KEY}-invalid-update`,
        ),
      'VALIDATION_ERROR',
    );
    assert.equal(updateFixture.database.transactionCount, 0);
  }

  const fixed = fixture();
  await rejectsCode(
    () =>
      fixed.service.create(
        user(),
        { ...createBody, number: ' 101 ', room_code: ' ', public_visible: 'false' },
        context,
        IDEMPOTENCY_KEY,
      ),
    'ROOM_INVENTORY_FIXED',
  );
  assert.equal(fixed.database.transactionCount, 0);
  assert.equal(fixed.audits.length, 0);
});

function databaseServiceWithClient(client: {
  query: (sql: string) => Promise<unknown>;
  release: () => void;
}): DatabaseService {
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(database, 'pool', {
    value: { connect: async () => client },
  });
  return database;
}

test('DatabaseService transaction preserves errors and exact client lifecycle', async () => {
  const successEvents: string[] = [];
  let successReleases = 0;
  const successClient = {
    query: async (sql: string) => successEvents.push(sql),
    release: () => {
      successReleases += 1;
      successEvents.push('RELEASE');
    },
  };
  const successDatabase = databaseServiceWithClient(successClient);
  const result = await successDatabase.transaction(async (client) => {
    assert.equal(client, successClient);
    successEvents.push('CALLBACK');
    return 'result';
  });
  assert.equal(result, 'result');
  assert.deepEqual(successEvents, ['BEGIN', 'CALLBACK', 'COMMIT', 'RELEASE']);
  assert.equal(successReleases, 1);

  const callbackError = new Error('callback failed');
  const callbackEvents: string[] = [];
  let callbackReleases = 0;
  const callbackDatabase = databaseServiceWithClient({
    query: async (sql) => callbackEvents.push(sql),
    release: () => {
      callbackReleases += 1;
      callbackEvents.push('RELEASE');
    },
  });
  await assert.rejects(
    () =>
      callbackDatabase.transaction(async () => {
        callbackEvents.push('CALLBACK');
        throw callbackError;
      }),
    (error) => error === callbackError,
  );
  assert.deepEqual(callbackEvents, ['BEGIN', 'CALLBACK', 'ROLLBACK', 'RELEASE']);
  assert.equal(callbackReleases, 1);

  const commitError = new Error('commit failed');
  const commitEvents: string[] = [];
  let commitReleases = 0;
  const commitDatabase = databaseServiceWithClient({
    query: async (sql) => {
      commitEvents.push(sql);
      if (sql === 'COMMIT') throw commitError;
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
    },
    release: () => {
      commitReleases += 1;
      commitEvents.push('RELEASE');
    },
  });
  await assert.rejects(
    () => commitDatabase.transaction(async () => 'result'),
    (error) => error === commitError,
  );
  assert.deepEqual(commitEvents, ['BEGIN', 'COMMIT', 'ROLLBACK', 'RELEASE']);
  assert.equal(commitReleases, 1);

  const beginError = new Error('begin failed');
  const beginEvents: string[] = [];
  let beginReleases = 0;
  const beginDatabase = databaseServiceWithClient({
    query: async (sql) => {
      beginEvents.push(sql);
      throw beginError;
    },
    release: () => {
      beginReleases += 1;
      beginEvents.push('RELEASE');
    },
  });
  await assert.rejects(
    () => beginDatabase.transaction(async () => 'unreachable'),
    (error) => error === beginError,
  );
  assert.deepEqual(beginEvents, ['BEGIN', 'RELEASE']);
  assert.equal(beginReleases, 1);
});

test('property denial, missing key, and scoped missing/foreign update perform zero writes', async () => {
  const denied = fixture();
  await rejectsCode(
    () => denied.service.create(user([PROPERTY_B]), createBody, context, IDEMPOTENCY_KEY),
    'PROPERTY_SCOPE_DENIED',
  );
  assert.equal(denied.database.transactionCount, 0);
  assert.equal(denied.audits.length, 0);

  const missingKey = fixture();
  await rejectsCode(
    () => missingKey.service.create(user(), createBody, context),
    'ROOM_INVENTORY_FIXED',
  );
  assert.equal(missingKey.database.transactionCount, 0);
  const missingUpdateKey = fixture();
  await rejectsCode(
    () => missingUpdateKey.service.update(user(), ROOM_A, { size_label: 'safe' }, context),
    'IDEMPOTENCY_KEY_REQUIRED',
  );
  assert.equal(missingUpdateKey.database.transactionCount, 0);

  for (const [roomId, actor] of [
    [ROOM_A, user([PROPERTY_B])],
    [MISSING_ROOM, user()],
  ] as const) {
    const current = fixture();
    await rejectsCode(
      () =>
        current.service.update(actor, roomId, { size_label: '4 x 4 m' }, context, IDEMPOTENCY_KEY),
      'ROOM_NOT_FOUND',
    );
    assert.equal(current.database.transactionCount, 0);
    assert.equal(current.audits.length, 0);
  }
});

test('valid routine create variants consistently use fixed-inventory authority', async () => {
  for (const body of [
    { ...createBody, monthly_price: 1 },
    { ...createBody, gender_policy: 'female' },
    { ...createBody, floor_label: 'Lantai Bawah / LT.1' },
  ]) {
    const current = fixture();
    await rejectsCode(
      () => current.service.create(user(), body, context, IDEMPOTENCY_KEY),
      'ROOM_INVENTORY_FIXED',
    );
    assert.equal(current.database.rooms.size, 1);
    assert.equal(current.database.transactionCount, 0);
    assert.equal(current.audits.length, 0);
  }
});

test('floor move, cross-building move, and harmless edit maintain exact counters', async () => {
  const floorFixture = fixture();
  await floorFixture.service.update(
    user(),
    ROOM_A,
    { floor_code: 'B' },
    context,
    `${IDEMPOTENCY_KEY}-floor`,
  );
  assert.deepEqual(
    (({ total_rooms, floor_a_count, floor_b_count }) => ({
      total_rooms,
      floor_a_count,
      floor_b_count,
    }))(floorFixture.database.buildings.get(BUILDING_A)!),
    { total_rooms: 10, floor_a_count: 4, floor_b_count: 6 },
  );

  const crossFixture = fixture();
  await crossFixture.service.update(
    user(),
    ROOM_A,
    {
      building_id: BUILDING_B,
      kost_type_id: KOST_TYPE_B,
      floor_code: 'B',
      gender_policy: 'female',
    },
    context,
    `${IDEMPOTENCY_KEY}-cross`,
  );
  assert.equal(crossFixture.database.buildings.get(BUILDING_A)!.total_rooms, 9);
  assert.equal(crossFixture.database.buildings.get(BUILDING_A)!.floor_a_count, 4);
  assert.equal(crossFixture.database.buildings.get(BUILDING_B)!.total_rooms, 9);
  assert.equal(crossFixture.database.buildings.get(BUILDING_B)!.floor_b_count, 5);

  const harmlessFixture = fixture();
  harmlessFixture.database.rooms.get(ROOM_A)!.gender_policy = 'mixed';
  await harmlessFixture.service.update(
    user(),
    ROOM_A,
    { size_label: '4 x 4 m', public_visible: false },
    context,
    `${IDEMPOTENCY_KEY}-harmless`,
  );
  assert.equal(
    harmlessFixture.database.logs.filter((sql) => /^UPDATE room_buildings/.test(sql)).length,
    0,
  );
  assert.equal(harmlessFixture.database.rooms.get(ROOM_A)!.gender_policy, 'mixed');
});

test('counter matrix covers B-to-A, same-floor cross-building, opposite moves, and rollback', async () => {
  const bToA = fixture();
  Object.assign(bToA.database.rooms.get(ROOM_A)!, {
    floor: '1',
    floor_code: 'B',
    floor_label: 'Lantai Bawah / LT.1',
  });
  await bToA.service.update(
    user(),
    ROOM_A,
    { floor_code: 'A' },
    context,
    `${IDEMPOTENCY_KEY}-b-to-a`,
  );
  assert.deepEqual(
    (({ total_rooms, floor_a_count, floor_b_count }) => ({
      total_rooms,
      floor_a_count,
      floor_b_count,
    }))(bToA.database.buildings.get(BUILDING_A)!),
    { total_rooms: 10, floor_a_count: 6, floor_b_count: 4 },
  );

  const sameFloorCross = fixture();
  await sameFloorCross.service.update(
    user(),
    ROOM_A,
    {
      building_id: BUILDING_B,
      kost_type_id: KOST_TYPE_B,
      gender_policy: 'female',
    },
    context,
    `${IDEMPOTENCY_KEY}-same-floor-cross`,
  );
  assert.deepEqual(
    [BUILDING_A, BUILDING_B].map((id) => {
      const building = sameFloorCross.database.buildings.get(id)!;
      return [building.total_rooms, building.floor_a_count, building.floor_b_count];
    }),
    [
      [9, 4, 5],
      [9, 5, 4],
    ],
  );

  const opposite = fixture();
  opposite.database.addRoom(ROOM_B, {
    property_id: PROPERTY_A,
    kost_type_id: KOST_TYPE_B,
    number: '200',
    room_code: 'AK-17-B-200',
    building_id: BUILDING_B,
    category: 'apartkost',
    unit_code: '17',
    gender_policy: 'female',
    floor: '1',
    floor_code: 'B',
    floor_label: 'Lantai Bawah / LT.1',
  });
  await Promise.all([
    opposite.service.update(
      user(),
      ROOM_A,
      {
        building_id: BUILDING_B,
        kost_type_id: KOST_TYPE_B,
        floor_code: 'B',
        gender_policy: 'female',
      },
      context,
      `${IDEMPOTENCY_KEY}-opposite-a`,
    ),
    opposite.service.update(
      user(),
      ROOM_B,
      {
        building_id: BUILDING_A,
        kost_type_id: KOST_TYPE_A,
        floor_code: 'A',
        gender_policy: 'male',
      },
      context,
      `${IDEMPOTENCY_KEY}-opposite-b`,
    ),
  ]);
  assert.deepEqual(
    [BUILDING_A, BUILDING_B].map((id) => {
      const building = opposite.database.buildings.get(id)!;
      return [building.total_rooms, building.floor_a_count, building.floor_b_count];
    }),
    [
      [10, 5, 5],
      [8, 4, 4],
    ],
  );

  const negative = fixture();
  negative.database.buildings.get(BUILDING_A)!.floor_a_count = 0;
  await rejectsCode(
    () =>
      negative.service.update(
        user(),
        ROOM_A,
        { floor_code: 'B' },
        context,
        `${IDEMPOTENCY_KEY}-negative`,
      ),
    'ROOM_BUILDING_COUNTER_INVALID',
  );
  assert.equal(negative.database.rooms.get(ROOM_A)!.floor_code, 'A');
  assert.equal(negative.database.buildings.get(BUILDING_A)!.floor_a_count, 0);
  assert.equal(negative.database.buildings.get(BUILDING_A)!.floor_b_count, 5);
  assert.equal(negative.audits.length, 0);
});

test('reserved/occupied/hold/occupancy/lease block structural edits but harmless edits remain allowed', async () => {
  for (const blocked of ['reserved', 'occupied', 'hold', 'occupancy', 'lease'] as const) {
    const current = fixture();
    if (blocked === 'reserved' || blocked === 'occupied') {
      current.database.rooms.get(ROOM_A)!.room_status = blocked;
    } else {
      current.database.lifecycle[blocked] = true;
    }
    await rejectsCode(
      () =>
        current.service.update(
          user(),
          ROOM_A,
          { number: 'changed' },
          context,
          `${IDEMPOTENCY_KEY}-${blocked}`,
        ),
      'ROOM_STRUCTURAL_EDIT_BLOCKED',
    );
    assert.equal(current.database.rooms.get(ROOM_A)!.number, '100');

    await current.service.update(
      user(),
      ROOM_A,
      { number: '100' },
      context,
      `${IDEMPOTENCY_KEY}-${blocked}-identical`,
    );
    assert.equal(current.database.rooms.get(ROOM_A)!.number, '100');

    await current.service.update(
      user(),
      ROOM_A,
      { size_label: 'safe' },
      context,
      `${IDEMPOTENCY_KEY}-${blocked}-safe`,
    );
    assert.equal(current.database.rooms.get(ROOM_A)!.size_label, 'safe');
  }

  for (const status of ['vacant', 'maintenance', 'inactive', 'requires_review'] as const) {
    const current = fixture();
    current.database.rooms.get(ROOM_A)!.room_status = status;
    await current.service.update(
      user(),
      ROOM_A,
      { number: `${status}-room` },
      context,
      `${IDEMPOTENCY_KEY}-${status}`,
    );
    assert.equal(current.database.rooms.get(ROOM_A)!.number, `${status}-room`);
    assert.equal(current.database.rooms.get(ROOM_A)!.room_status, status);
  }
});

test('lock order is deterministic and audit/idempotency success share the transaction', async () => {
  const current = fixture();
  await current.service.update(
    user(),
    ROOM_A,
    { floor_code: 'B' },
    context,
    `${IDEMPOTENCY_KEY}-order`,
  );
  const index = (pattern: RegExp) =>
    current.database.events.findIndex((event) => pattern.test(event));
  const sequence = [
    index(/^SELECT id FROM properties/),
    index(/^SELECT \* FROM rooms WHERE id = \$1 AND property_id = \$2 FOR UPDATE/),
    index(/^SELECT \* FROM room_buildings/),
    index(/^SELECT id FROM booking_lead_holds/),
    index(/^SELECT id FROM occupancies/),
    index(/^SELECT id FROM leases/),
    index(/^UPDATE rooms SET kost_type_id/),
    index(/^UPDATE room_buildings/),
    current.database.events.indexOf('AUDIT'),
    index(/^UPDATE idempotency_commands/),
  ];
  assert.ok(sequence.every((value) => value >= 0));
  assert.deepEqual(
    sequence,
    [...sequence].sort((left, right) => left - right),
  );
  const transactionalStatements = current.database.querySources.filter(({ sql }) =>
    /^(?:INSERT|UPDATE|DELETE)|FOR (?:UPDATE|KEY SHARE)/.test(sql),
  );
  assert.ok(transactionalStatements.length > 0);
  assert.ok(transactionalStatements.every(({ source }) => source === 'transaction'));
  assert.deepEqual(
    current.database.querySources.filter(({ source }) => source === 'pool').map(({ sql }) => sql),
    [
      'SELECT property_id FROM rooms WHERE id = $1 AND ($2::uuid[] IS NULL OR property_id = ANY($2::uuid[]))',
    ],
  );
});

test('audit failure rolls back room update, counters, and successful command result', async () => {
  const current = fixture({ auditFailure: true });
  await assert.rejects(() =>
    current.service.update(user(), ROOM_A, { size_label: 'rollback-me' }, context, IDEMPOTENCY_KEY),
  );
  assert.equal(current.database.rooms.size, 1);
  assert.equal(current.database.rooms.get(ROOM_A)!.size_label, '3 x 4 m');
  assert.equal(current.database.buildings.get(BUILDING_A)!.total_rooms, 10);
  assert.equal(current.database.commands.size, 0);
});

test('response and audit expose only their exact safe whitelists', async () => {
  const current = fixture();
  const response = await current.service.update(
    user(),
    ROOM_A,
    { size_label: 'safe' },
    context,
    IDEMPOTENCY_KEY,
  );
  const serialized = JSON.parse(JSON.stringify(response)) as { data: Record<string, unknown> };
  assert.deepEqual(Object.keys(serialized), ['data']);
  assert.deepEqual(Object.keys(serialized.data).sort(), [
    'active_lease',
    'building_code',
    'building_id',
    'building_name',
    'created_at',
    'floor',
    'floor_code',
    'floor_label',
    'gender_policy',
    'id',
    'kost_type',
    'number',
    'primary_photo_file_id',
    'property_id',
    'public_visible',
    'room_code',
    'size_label',
    'status',
    'unit_code',
    'updated_at',
  ]);
  assert.deepEqual(Object.keys(serialized.data.kost_type as object).sort(), [
    'category',
    'deposit_amount',
    'facilities',
    'id',
    'monthly_price',
    'name',
    'slug',
    'yearly_price',
  ]);
  const audit = current.audits[0];
  assert.deepEqual(Object.keys(audit.afterData as object).sort(), [
    'building_id',
    'category',
    'floor',
    'floor_code',
    'floor_label',
    'gender_policy',
    'id',
    'kost_type_id',
    'number',
    'primary_photo_file_id',
    'property_id',
    'public_visible',
    'room_code',
    'size_label',
    'status',
    'unit_code',
  ]);
  assert.doesNotMatch(
    JSON.stringify(audit),
    /monthly_price|deposit_amount|facility|actor_id|metadata/,
  );
  const domainMutations = current.database.logs.filter(
    (sql) =>
      /^(?:INSERT|UPDATE|DELETE)/.test(sql) &&
      !/(?:rooms|room_buildings|idempotency_commands)/.test(sql),
  );
  assert.deepEqual(domainMutations, []);
});

function assertMutationSensitiveSource(source: string) {
  assert.match(source, /this\.database\.transaction/);
  assert.match(source, /WHERE id = \$1 AND property_id = \$2 FOR UPDATE/);
  assert.match(source, /building\.gender_policy/);
  assert.match(source, /CANONICAL_FLOOR/);
  assert.match(source, /booking_lead_holds[\s\S]+hold_status = 'active'/);
  assert.match(source, /leases[\s\S]+lease_status = 'active'/);
  assert.match(source, /total_rooms = total_rooms \+ \$2/);
  assert.match(source, /floor_a_count = floor_a_count \+ \$3/);
  assert.match(source, /floor_b_count = floor_b_count \+ \$4/);
  assert.equal([...source.matchAll(/this\.audit\.write\([\s\S]*?\},\s*client,\s*\);/g)].length, 1);
  assert.match(source, /if \(command\) return command\.body/);
}

test('mutation-sensitive source proof rejects removed authority and decoy paths', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/admin-ux-master/admin-ux-room-v2.service.ts'),
    'utf8',
  );
  assertMutationSensitiveSource(source);
  const mutations = [
    source.replace('this.database.transaction', 'this.database.client.query'),
    source.replace('AND property_id = $2 FOR UPDATE', 'FOR UPDATE'),
    source.replaceAll('building.gender_policy', 'input.gender_policy'),
    source.replaceAll('CANONICAL_FLOOR', 'CLIENT_FLOOR'),
    source.replaceAll("hold_status = 'active'", "hold_status = 'ignored'"),
    source.replaceAll("lease_status = 'active'", "lease_status = 'ignored'"),
    source.replace('total_rooms = total_rooms + $2', 'total_rooms = total_rooms'),
    source.replace(/,\s*client,\s*\);/g, ');'),
    source.replace('if (command) return command.body', 'if (command) void command.body'),
  ];
  for (const mutation of mutations) assert.throws(() => assertMutationSensitiveSource(mutation));
});
