import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { HttpException, ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BookingLeadHoldCommandController,
  BookingLeadHoldReadController,
} from '../../src/modules/booking-lead/booking-lead-hold.controller';
import { BookingLeadHoldExpiryWorker } from '../../src/modules/booking-lead/booking-lead-hold-expiry.worker';
import { BookingLeadHoldFeatureService } from '../../src/modules/booking-lead/booking-lead-hold-feature.service';
import { BookingLeadHoldService } from '../../src/modules/booking-lead/booking-lead-hold.service';
import { BookingLeadHoldCommandDto } from '../../src/modules/booking-lead/dto/booking-lead-hold-command.dto';
import { ListBookingLeadHoldsQueryDto } from '../../src/modules/booking-lead/dto/list-booking-lead-holds-query.dto';
import { BookingLeadHoldRepository } from '../../src/modules/booking-lead/repositories/booking-lead-hold.repository';
import type { BookingLeadHoldRecord } from '../../src/modules/booking-lead/types/booking-lead-hold.types';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const root = resolve(__dirname, '../..');
const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const ROOM_A = '33333333-3333-4333-8333-333333333333';
const ROOM_B = '88888888-8888-4888-8888-888888888888';
const LEAD_A = '44444444-4444-4444-8444-444444444444';
const HOLD_A = '55555555-5555-4555-8555-555555555555';
const ACTOR_A = '66666666-6666-4666-8666-666666666666';
const IDEMPOTENCY_KEY = 'm14-command-key-0001';

const paths = {
  migration: resolve(
    root,
    'src/infrastructure/database/migrations/020_booking_lead_room_holds.sql',
  ),
  repository: resolve(
    root,
    'src/modules/booking-lead/repositories/booking-lead-hold.repository.ts',
  ),
  service: resolve(root, 'src/modules/booking-lead/booking-lead-hold.service.ts'),
  worker: resolve(root, 'src/modules/booking-lead/booking-lead-hold-expiry.worker.ts'),
  module: resolve(root, 'src/modules/booking-lead/booking-lead.module.ts'),
  lease: resolve(root, 'src/modules/lease/lease.service.ts'),
  publicLead: resolve(root, 'src/modules/booking-lead/public-booking-lead.controller.ts'),
};

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function hold(overrides: Partial<BookingLeadHoldRecord> = {}): BookingLeadHoldRecord {
  return {
    id: HOLD_A,
    propertyId: PROPERTY_A,
    bookingLeadId: LEAD_A,
    roomId: ROOM_A,
    holdStatus: 'active',
    startsAt: '2099-01-01T00:00:00.000Z',
    expiresAt: '2099-01-02T00:00:00.000Z',
    releasedAt: null,
    ...overrides,
  };
}

function actor(): UserAccessContext {
  return {
    id: ACTOR_A,
    email: null,
    phone: null,
    displayName: 'M14 Admin',
    roles: ['admin'],
    permissions: ['room.read', 'room.manage'],
    propertyIds: [PROPERTY_A],
    sessionId: 'm14-session',
  };
}

function repository(overrides: Record<string, unknown> = {}) {
  const current = hold();
  return {
    readFeatureFlags: async () => ({ adminUxRead: true, bookingHoldWrite: true }),
    transaction: async (operation: (client: object) => Promise<unknown>) => operation({}),
    list: async () => ({ records: [current], total: 1 }),
    claimCommand: async () => null,
    completeCommand: async () => undefined,
    lockPropertyLifecycle: async () => undefined,
    lockProperty: async () => true,
    lockLead: async () => ({
      id: LEAD_A,
      propertyId: PROPERTY_A,
      roomId: ROOM_A,
      category: 'rukost',
      status: 'new',
    }),
    lockRoom: async () => ({
      id: ROOM_A,
      propertyId: PROPERTY_A,
      category: 'rukost',
      roomStatus: 'vacant',
      buildingId: '77777777-7777-4777-8777-777777777777',
      buildingPropertyId: PROPERTY_A,
      buildingCategory: 'rukost',
    }),
    lockMatchingHolds: async () => [],
    lockLatestHold: async () => ({ ...current, stale: false }),
    roomBlockers: async () => ({
      active_hold: false,
      active_occupancy: false,
      active_lease: false,
    }),
    insertActiveHold: async () => current,
    transitionRoomToReserved: async () => true,
    markExpired: async () => hold({ holdStatus: 'expired' }),
    markReleased: async () =>
      hold({ holdStatus: 'released', releasedAt: '2026-07-28T01:00:00.000Z' }),
    restoreRoomIfSafe: async () => undefined,
    writeAudit: async () => undefined,
    writeOutbox: async () => undefined,
    expireDueBatch: async () => 0,
    ...overrides,
  };
}

function service(repo = repository()) {
  return new BookingLeadHoldService(
    repo as never,
    new BookingLeadHoldFeatureService(repo as never),
  );
}

function exceptionBody(error: unknown): Record<string, unknown> {
  assert.ok(error instanceof HttpException);
  return error.getResponse() as Record<string, unknown>;
}

function assertMigrationContract(sql: string): void {
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS booking_hold_write BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(sql, /CHECK \(NOT booking_hold_write OR admin_ux_read\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS booking_lead_holds/);
  for (const fk of ['property_id', 'booking_lead_id', 'room_id']) {
    assert.match(sql, new RegExp(`${fk} UUID NOT NULL REFERENCES [^\\n]+ ON DELETE RESTRICT`));
  }
  for (const fk of ['released_by_user_id', 'created_by_user_id']) {
    assert.match(sql, new RegExp(`${fk} UUID REFERENCES users\\(id\\) ON DELETE SET NULL`));
  }
  assert.match(sql, /hold_status IN \('active', 'released', 'expired'\)/);
  assert.match(sql, /expires_at = starts_at \+ interval '24 hours'/);
  assert.match(sql, /uq_booking_lead_holds_active_room[\s\S]*WHERE hold_status = 'active'/);
  assert.match(sql, /uq_booking_lead_holds_active_lead[\s\S]*WHERE hold_status = 'active'/);
  assert.match(sql, /idx_booking_lead_holds_property_status_started/);
  assert.match(sql, /idx_booking_lead_holds_active_expiry/);
  const indexRegion = sql.slice(sql.indexOf('CREATE UNIQUE INDEX'));
  assert.doesNotMatch(indexRegion, /WHERE[^;]*now\s*\(/i);
  assert.doesNotMatch(sql, /booking_hold_write\s*=\s*TRUE/i);
}

test('migration is replay-safe and freezes exact schema, TTL, indexes, and disabled rollout', () => {
  const migration = source(paths.migration);
  assertMigrationContract(migration);
  assert.throws(() =>
    assertMigrationContract(
      migration.replace("WHERE hold_status = 'active';", 'WHERE expires_at > now();'),
    ),
  );
  assert.throws(() =>
    assertMigrationContract(migration.replace('ADD COLUMN IF NOT EXISTS', 'ADD COLUMN')),
  );
});

test('DTOs accept only exact property command and property/limit/offset read query', async () => {
  const command = plainToInstance(BookingLeadHoldCommandDto, { property_id: PROPERTY_A });
  assert.deepEqual(await validate(command, { whitelist: true, forbidNonWhitelisted: true }), []);
  assert.notDeepEqual(
    await validate(
      plainToInstance(BookingLeadHoldCommandDto, {
        property_id: PROPERTY_A,
        reason: 'not allowed',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    ),
    [],
  );

  const query = plainToInstance(ListBookingLeadHoldsQueryDto, {
    property_id: PROPERTY_A,
    limit: '20',
    offset: '0',
  });
  assert.deepEqual(await validate(query, { whitelist: true, forbidNonWhitelisted: true }), []);
  assert.equal(query.limit, 20);
  assert.equal(query.offset, 0);

  for (const invalid of [
    { property_id: PROPERTY_A, limit: '0', offset: '0' },
    { property_id: PROPERTY_A, limit: '101', offset: '0' },
    { property_id: PROPERTY_A, limit: '20', offset: '-1' },
    { property_id: PROPERTY_A, limit: '20', offset: '0', status: 'active' },
  ]) {
    assert.notDeepEqual(
      await validate(plainToInstance(ListBookingLeadHoldsQueryDto, invalid), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
      [],
    );
  }
});

test('controllers freeze exact wires, RBAC, permission, and authorization-before-service', async () => {
  const reflector = new Reflector();
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, BookingLeadHoldCommandController.prototype.create),
    RequestMethod.POST,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, BookingLeadHoldCommandController.prototype.create),
    '/',
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, BookingLeadHoldCommandController.prototype.release),
    RequestMethod.POST,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, BookingLeadHoldCommandController.prototype.release),
    'release',
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, BookingLeadHoldReadController.prototype.list),
    RequestMethod.GET,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, BookingLeadHoldCommandController),
    'booking-leads/:leadId/hold',
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, BookingLeadHoldReadController),
    'booking-lead-holds',
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      BookingLeadHoldCommandController.prototype.create,
      BookingLeadHoldCommandController,
    ]),
    ['manager', 'admin'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      BookingLeadHoldCommandController.prototype.create,
      BookingLeadHoldCommandController,
    ]),
    ['room.manage'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      BookingLeadHoldCommandController.prototype.release,
      BookingLeadHoldCommandController,
    ]),
    ['room.manage'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      BookingLeadHoldReadController.prototype.list,
      BookingLeadHoldReadController,
    ]),
    ['manager', 'admin'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      BookingLeadHoldReadController.prototype.list,
      BookingLeadHoldReadController,
    ]),
    ['room.read'],
  );

  for (const method of ['create', 'release'] as const) {
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      BookingLeadHoldCommandController,
      method,
    ) as
      | Record<
          string,
          {
            index: number;
            data: string;
            pipes: unknown[];
          }
        >
      | undefined;
    const leadIdArgument = Object.values(routeArguments ?? {}).find(
      (argument) => argument.index === 1 && argument.data === 'leadId',
    );
    assert.ok(leadIdArgument, `${method} leadId route argument`);
    assert.equal(leadIdArgument.pipes.length, 1);
    const pipe = leadIdArgument.pipes[0];
    assert.ok(pipe instanceof ParseUUIDPipe);
    assert.equal(
      await pipe.transform(LEAD_A, { type: 'param', metatype: String, data: 'leadId' }),
      LEAD_A,
    );
    await assert.rejects(
      pipe.transform('not-a-uuid', { type: 'param', metatype: String, data: 'leadId' }),
    );
  }

  const events: string[] = [];
  const controller = new BookingLeadHoldCommandController(
    {
      create: async () => {
        events.push('command-claim');
        return { status: 201, body: { data: {} }, replayed: false };
      },
    } as never,
    {
      assertCanReadProperty: async () => events.push('property-authorized'),
    } as never,
  );
  await controller.create(
    actor(),
    LEAD_A,
    { property_id: PROPERTY_A },
    IDEMPOTENCY_KEY,
    { headers: {}, correlationId: 'm14', ip: '127.0.0.1' } as never,
    { status: () => undefined, setHeader: () => undefined } as never,
  );
  assert.deepEqual(events, ['property-authorized', 'command-claim']);

  let deniedServiceCalls = 0;
  const denied = new BookingLeadHoldCommandController(
    {
      create: async () => {
        deniedServiceCalls += 1;
        throw new Error('must not run');
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        throw new HttpException(
          {
            code: 'PROPERTY_SCOPE_DENIED',
            message: 'User is not allowed to access this property',
          },
          403,
        );
      },
    } as never,
  );
  await assert.rejects(
    denied.create(
      actor(),
      LEAD_A,
      { property_id: PROPERTY_B },
      IDEMPOTENCY_KEY,
      { headers: {}, correlationId: 'm14', ip: '127.0.0.1' } as never,
      { status: () => undefined, setHeader: () => undefined } as never,
    ),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'User is not allowed to access this property',
      });
      return true;
    },
  );
  assert.equal(deniedServiceCalls, 0);
});

test('flag denial is exact and occurs before transaction or idempotency claim', async () => {
  let transactionCalls = 0;
  const repo = repository({
    readFeatureFlags: async () => ({ adminUxRead: true, bookingHoldWrite: false }),
    transaction: async () => {
      transactionCalls += 1;
      throw new Error('must not run');
    },
  });
  await assert.rejects(
    service(repo).create(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, { actorUserId: ACTOR_A }),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'BOOKING_HOLD_WRITE_DISABLED',
        message: 'Booking lead room hold creation is not enabled for this property',
      });
      return true;
    },
  );
  assert.equal(transactionCalls, 0);

  for (const invalidFlags of [
    {},
    { adminUxRead: null, bookingHoldWrite: true },
    { adminUxRead: true, bookingHoldWrite: 'true' },
  ]) {
    const feature = new BookingLeadHoldFeatureService(
      repository({ readFeatureFlags: async () => invalidFlags }) as never,
    );
    await assert.rejects(feature.assertCreateEnabled(PROPERTY_A), (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'BOOKING_HOLD_WRITE_DISABLED',
        message: 'Booking lead room hold creation is not enabled for this property',
      });
      return true;
    });
  }
});

test('create returns every exact eligibility and isolation error before lifecycle writes', async () => {
  const cases: Array<{
    name: string;
    overrides: Record<string, unknown>;
    status: number;
    code: string;
    message: string;
  }> = [
    {
      name: 'missing lead',
      overrides: { lockLead: async () => null },
      status: 404,
      code: 'BOOKING_HOLD_LEAD_NOT_FOUND',
      message: 'Booking lead not found',
    },
    {
      name: 'cross-property lead',
      overrides: {
        lockLead: async () => ({
          id: LEAD_A,
          propertyId: PROPERTY_B,
          roomId: ROOM_A,
          category: 'rukost',
          status: 'new',
        }),
      },
      status: 403,
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    },
    {
      name: 'lead without room',
      overrides: {
        lockLead: async () => ({
          id: LEAD_A,
          propertyId: PROPERTY_A,
          roomId: null,
          category: 'rukost',
          status: 'new',
        }),
      },
      status: 409,
      code: 'BOOKING_HOLD_ROOM_REQUIRED',
      message: 'Booking lead must reference a room before creating a hold',
    },
    {
      name: 'ineligible lead',
      overrides: {
        lockLead: async () => ({
          id: LEAD_A,
          propertyId: PROPERTY_A,
          roomId: ROOM_A,
          category: 'rukost',
          status: 'closed',
        }),
      },
      status: 409,
      code: 'BOOKING_HOLD_LEAD_NOT_ELIGIBLE',
      message: 'Booking lead status is not eligible for a room hold',
    },
    {
      name: 'invalid room linkage',
      overrides: { lockRoom: async () => null },
      status: 409,
      code: 'BOOKING_HOLD_ROOM_LINK_INVALID',
      message: 'Booking lead room linkage is not eligible for a hold',
    },
    {
      name: 'active hold',
      overrides: {
        roomBlockers: async () => ({
          active_hold: true,
          active_occupancy: false,
          active_lease: false,
        }),
      },
      status: 409,
      code: 'BOOKING_HOLD_ALREADY_ACTIVE',
      message: 'An active room hold already exists',
    },
    {
      name: 'active occupancy',
      overrides: {
        roomBlockers: async () => ({
          active_hold: false,
          active_occupancy: true,
          active_lease: false,
        }),
      },
      status: 409,
      code: 'BOOKING_HOLD_ACTIVE_OCCUPANCY',
      message: 'Room has an active occupancy',
    },
    {
      name: 'active lease',
      overrides: {
        roomBlockers: async () => ({
          active_hold: false,
          active_occupancy: false,
          active_lease: true,
        }),
      },
      status: 409,
      code: 'BOOKING_HOLD_ACTIVE_LEASE',
      message: 'Room has an active lease',
    },
    {
      name: 'room not vacant',
      overrides: {
        lockRoom: async () => ({
          id: ROOM_A,
          propertyId: PROPERTY_A,
          category: 'rukost',
          roomStatus: 'reserved',
          buildingId: '77777777-7777-4777-8777-777777777777',
          buildingPropertyId: PROPERTY_A,
          buildingCategory: 'rukost',
        }),
      },
      status: 409,
      code: 'BOOKING_HOLD_ROOM_NOT_VACANT',
      message: 'Room must be vacant before creating a booking lead hold',
    },
  ];

  for (const scenario of cases) {
    let lifecycleWrites = 0;
    const rejectWrite = async () => {
      lifecycleWrites += 1;
      throw new Error('must not write');
    };
    const repo = repository({
      insertActiveHold: rejectWrite,
      transitionRoomToReserved: rejectWrite,
      writeAudit: rejectWrite,
      writeOutbox: rejectWrite,
      completeCommand: rejectWrite,
      ...scenario.overrides,
    });
    await assert.rejects(
      service(repo).create(LEAD_A, PROPERTY_A, `${IDEMPOTENCY_KEY}-${scenario.name}`, {
        actorUserId: ACTOR_A,
      }),
      (error) => {
        assert.ok(error instanceof HttpException, scenario.name);
        assert.equal(error.getStatus(), scenario.status, scenario.name);
        assert.deepEqual(
          exceptionBody(error),
          { code: scenario.code, message: scenario.message },
          scenario.name,
        );
        return true;
      },
    );
    assert.equal(lifecycleWrites, 0, scenario.name);
  }
});

test('idempotency key validation uses exact existing errors before transaction', async () => {
  let transactions = 0;
  const repo = repository({
    transaction: async () => {
      transactions += 1;
      throw new Error('must not run');
    },
  });
  for (const [key, code, message] of [
    [undefined, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'],
    ['short', 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must be 16 to 128 characters'],
  ] as const) {
    await assert.rejects(
      service(repo).create(LEAD_A, PROPERTY_A, key, { actorUserId: ACTOR_A }),
      (error) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 400);
        assert.deepEqual(exceptionBody(error), { code, message });
        return true;
      },
    );
  }
  assert.equal(transactions, 0);
});

test('create uses deterministic lock order, reconciles stale hold, and returns exact whitelist', async () => {
  const events: string[] = [];
  const stale = hold({ roomId: ROOM_B, expiresAt: '2026-07-27T00:00:00.000Z' });
  const repo = repository({
    readFeatureFlags: async (_propertyId: string, client?: object) => {
      events.push(client ? 'flag-recheck' : 'flag-precheck');
      return { adminUxRead: true, bookingHoldWrite: true };
    },
    claimCommand: async () => {
      events.push('claim');
      return null;
    },
    lockPropertyLifecycle: async () => events.push('lock-property-lifecycle'),
    lockProperty: async () => {
      events.push('lock-property');
      return true;
    },
    lockLead: async () => {
      events.push('lock-lead');
      return {
        id: LEAD_A,
        propertyId: PROPERTY_A,
        roomId: ROOM_A,
        category: 'rukost',
        status: 'new',
      };
    },
    lockRoom: async (_client: object, roomId: string) => {
      events.push(`lock-room:${roomId}`);
      return {
        id: roomId,
        propertyId: PROPERTY_A,
        category: 'rukost',
        roomStatus: 'vacant',
        buildingId: '77777777-7777-4777-8777-777777777777',
        buildingPropertyId: PROPERTY_A,
        buildingCategory: 'rukost',
      };
    },
    lockMatchingHolds: async () => {
      events.push('lock-holds');
      return [{ ...stale, stale: true }];
    },
    markExpired: async () => {
      events.push('expire-stale');
      return hold({ roomId: ROOM_B, holdStatus: 'expired' });
    },
    restoreRoomIfSafe: async (_client: object, _propertyId: string, roomId: string) =>
      events.push(`restore-safe:${roomId}`),
    insertActiveHold: async () => {
      events.push('insert-hold');
      return hold();
    },
    transitionRoomToReserved: async () => {
      events.push('room-reserved');
      return true;
    },
    writeAudit: async (_client: object, input: { action: string }) =>
      events.push(`audit:${input.action}`),
    writeOutbox: async (_client: object, input: { eventType: string }) =>
      events.push(`outbox:${input.eventType}`),
    completeCommand: async () => events.push('complete-command'),
  });

  const result = await service(repo).create(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, {
    actorUserId: ACTOR_A,
    correlationId: 'm14-create',
  });
  assert.equal(result.status, 201);
  assert.equal(result.replayed, false);
  assert.deepEqual(Object.keys((result.body as { data: object }).data), [
    'id',
    'property_id',
    'booking_lead_id',
    'room_id',
    'hold_status',
    'starts_at',
    'expires_at',
    'released_at',
  ]);
  assert.deepEqual(events.slice(0, 9), [
    'flag-precheck',
    'claim',
    'lock-property-lifecycle',
    'lock-property',
    'flag-recheck',
    'lock-lead',
    `lock-room:${ROOM_A}`,
    'lock-holds',
    `lock-room:${ROOM_B}`,
  ]);
  assert.ok(events.indexOf(`lock-room:${ROOM_B}`) < events.indexOf('expire-stale'));
  assert.ok(events.indexOf('expire-stale') < events.indexOf('insert-hold'));
  assert.ok(events.includes(`restore-safe:${ROOM_B}`));
  assert.ok(events.indexOf('insert-hold') < events.indexOf('room-reserved'));
  assert.ok(events.includes('audit:booking_lead_hold.create'));
  assert.ok(events.includes('outbox:booking_lead_hold.created'));
});

test('concurrent uniqueness maps to exact active-hold conflict and transaction rolls back', async () => {
  const queries: string[] = [];
  const database = {
    client: {
      connect: async () => ({
        query: async (text: string) => {
          queries.push(text);
          return { rows: [] };
        },
        release: () => undefined,
      }),
    },
  };
  const realRepository = new BookingLeadHoldRepository(database as never);
  await assert.rejects(
    realRepository.transaction(async () => {
      throw new Error('rollback-sentinel');
    }),
    /rollback-sentinel/,
  );
  assert.deepEqual(queries, ['BEGIN', 'ROLLBACK']);

  const unique = Object.assign(new Error('unique'), {
    code: '23505',
    constraint: 'uq_booking_lead_holds_active_room',
  });
  const repo = repository({ insertActiveHold: async () => Promise.reject(unique) });
  await assert.rejects(
    service(repo).create(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, { actorUserId: ACTOR_A }),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'BOOKING_HOLD_ALREADY_ACTIVE',
        message: 'An active room hold already exists',
      });
      return true;
    },
  );
});

test('create idempotency replays exact result and rejects key reuse before domain locks', async () => {
  let locks = 0;
  const replayBody = { data: { id: HOLD_A } };
  const base = {
    requestFingerprint: '',
    commandStatus: 'succeeded' as const,
    responseStatus: 201,
    responseBody: replayBody,
  };
  const repo = repository({
    claimCommand: async (_client: object, input: { fingerprint: string }) => ({
      ...base,
      requestFingerprint: input.fingerprint,
    }),
    lockProperty: async () => {
      locks += 1;
      return true;
    },
  });
  const replay = await service(repo).create(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, {
    actorUserId: ACTOR_A,
  });
  assert.deepEqual(replay, { status: 201, body: replayBody, replayed: true });
  assert.equal(locks, 0);

  const reused = repository({
    claimCommand: async () => ({ ...base, requestFingerprint: 'different' }),
  });
  await assert.rejects(
    service(reused).create(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, { actorUserId: ACTOR_A }),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
      return true;
    },
  );
});

test('claim-unavailable and release replay preserve exact Lease idempotency contract', async () => {
  const unavailableRepository = repository({
    claimCommand: async () => ({
      requestFingerprint: 'unused-for-unavailable',
      commandStatus: 'unavailable',
      responseStatus: null,
      responseBody: null,
    }),
  });
  await assert.rejects(
    service(unavailableRepository).create(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, {
      actorUserId: ACTOR_A,
    }),
    (error) => {
      assert.deepEqual(exceptionBody(error), {
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Command claim is unavailable; retry with the same key',
      });
      return true;
    },
  );

  const responseBody = {
    data: {
      id: HOLD_A,
      property_id: PROPERTY_A,
      booking_lead_id: LEAD_A,
      room_id: ROOM_A,
      hold_status: 'released',
      starts_at: '2026-07-28T00:00:00.000Z',
      expires_at: '2026-07-29T00:00:00.000Z',
      released_at: '2026-07-28T01:00:00.000Z',
    },
  };
  let releaseLocks = 0;
  const replayRepository = repository({
    claimCommand: async (_client: object, input: { fingerprint: string }) => ({
      requestFingerprint: input.fingerprint,
      commandStatus: 'succeeded',
      responseStatus: 200,
      responseBody,
    }),
    lockLatestHold: async () => {
      releaseLocks += 1;
      return hold();
    },
  });
  assert.deepEqual(
    await service(replayRepository).release(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, {
      actorUserId: ACTOR_A,
    }),
    { status: 200, body: responseBody, replayed: true },
  );
  assert.equal(releaseLocks, 0);

  const repositoryClaim = new BookingLeadHoldRepository({ client: {} } as never);
  let queryCount = 0;
  const claim = await repositoryClaim.claimCommand(
    {
      query: async () => {
        queryCount += 1;
        return { rows: [] };
      },
    } as never,
    {
      propertyId: PROPERTY_A,
      actorUserId: ACTOR_A,
      route: 'POST /booking-leads/:leadId/hold',
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: 'fingerprint',
    },
  );
  assert.equal(queryCount, 2);
  assert.equal(claim?.commandStatus, 'unavailable');
});

test('new release commands reject missing, cross-property, and terminal holds without writes', async () => {
  const cases = [
    {
      current: null,
      status: 404,
      code: 'BOOKING_HOLD_NOT_FOUND',
      message: 'Booking lead hold not found',
    },
    {
      current: hold({ propertyId: PROPERTY_B }),
      status: 403,
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    },
    {
      current: hold({ holdStatus: 'released', releasedAt: '2026-07-28T01:00:00.000Z' }),
      status: 409,
      code: 'BOOKING_HOLD_NOT_ACTIVE',
      message: 'Booking lead hold is no longer active',
    },
  ];
  for (const [index, scenario] of cases.entries()) {
    let lifecycleWrites = 0;
    const rejectWrite = async () => {
      lifecycleWrites += 1;
      throw new Error('must not write');
    };
    const repo = repository({
      lockLatestHold: async () => scenario.current,
      markExpired: rejectWrite,
      markReleased: rejectWrite,
      restoreRoomIfSafe: rejectWrite,
      writeAudit: rejectWrite,
      writeOutbox: rejectWrite,
      completeCommand: rejectWrite,
    });
    await assert.rejects(
      service(repo).release(LEAD_A, PROPERTY_A, `${IDEMPOTENCY_KEY}-release-${index}`, {
        actorUserId: ACTOR_A,
      }),
      (error) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), scenario.status);
        assert.deepEqual(exceptionBody(error), {
          code: scenario.code,
          message: scenario.message,
        });
        return true;
      },
    );
    assert.equal(lifecycleWrites, 0);
  }
});

test('release remains available with flag false and restores room only through safe predicate', async () => {
  const events: string[] = [];
  const repo = repository({
    readFeatureFlags: async () => {
      throw new Error('release must not read create flag');
    },
    lockPropertyLifecycle: async () => events.push('lock-property-lifecycle'),
    lockLatestHold: async () => {
      events.push('lock-hold');
      return { ...hold(), stale: false };
    },
    lockRoom: async () => {
      events.push('lock-room');
      return {
        id: ROOM_A,
        propertyId: PROPERTY_A,
        category: 'rukost',
        roomStatus: 'reserved',
        buildingId: '77777777-7777-4777-8777-777777777777',
        buildingPropertyId: PROPERTY_A,
        buildingCategory: 'rukost',
      };
    },
    markReleased: async () => {
      events.push('release-hold');
      return hold({ holdStatus: 'released', releasedAt: '2026-07-28T01:00:00.000Z' });
    },
    restoreRoomIfSafe: async () => events.push('restore-room-safe'),
  });
  const result = await service(repo).release(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, {
    actorUserId: ACTOR_A,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys((result.body as { data: object }).data), [
    'id',
    'property_id',
    'booking_lead_id',
    'room_id',
    'hold_status',
    'starts_at',
    'expires_at',
    'released_at',
  ]);
  assert.deepEqual(events.slice(0, 5), [
    'lock-property-lifecycle',
    'lock-hold',
    'lock-room',
    'release-hold',
    'restore-room-safe',
  ]);

  const restoreSql = source(paths.repository).match(/async restoreRoomIfSafe[\s\S]*?\n  }/)?.[0];
  assert.ok(restoreSql);
  assert.match(restoreSql, /room_status = 'reserved'/);
  assert.match(restoreSql, /NOT EXISTS[\s\S]*booking_lead_holds/);
  assert.match(restoreSql, /NOT EXISTS[\s\S]*occupancies/);
  assert.match(restoreSql, /NOT EXISTS[\s\S]*leases/);
  assert.doesNotMatch(restoreSql, /occupied|maintenance|inactive|requires_review/);
});

test('raced expiry commits expired state and returns exact terminal 409', async () => {
  const stale = {
    ...hold({ expiresAt: '2099-01-02T00:00:00.000Z' }),
    stale: true,
  };
  const events: string[] = [];
  const repo = repository({
    lockLatestHold: async () => stale,
    markExpired: async () => {
      events.push('expired');
      return hold({ holdStatus: 'expired' });
    },
    restoreRoomIfSafe: async () => events.push('restored'),
    completeCommand: async (_client: object, input: { succeeded: boolean; status: number }) =>
      events.push(`complete:${input.succeeded}:${input.status}`),
  });
  const result = await service(repo).release(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, {
    actorUserId: ACTOR_A,
    correlationId: 'm14-expired',
  });
  assert.equal(result.status, 409);
  assert.equal((result.body.error as { code: string }).code, 'BOOKING_HOLD_NOT_ACTIVE');
  assert.deepEqual(events, ['expired', 'restored', 'complete:false:409']);
});

test('release uses the transaction database clock instead of the application clock', async () => {
  let lockSql = '';
  let lockValues: unknown[] = [];
  const actualRepository = new BookingLeadHoldRepository({ client: {} } as never);
  const locked = await actualRepository.lockLatestHold(
    {
      query: async (text: string, values?: unknown[]) => {
        lockSql = text;
        lockValues = values ?? [];
        return {
          rows: [
            {
              id: HOLD_A,
              property_id: PROPERTY_A,
              booking_lead_id: LEAD_A,
              room_id: ROOM_A,
              hold_status: 'active',
              starts_at: '2099-01-01T00:00:00.000Z',
              expires_at: '2099-01-02T00:00:00.000Z',
              released_at: null,
              stale: true,
            },
          ],
        };
      },
    } as never,
    LEAD_A,
  );
  assert.match(lockSql, /expires_at <= now\(\) AS stale/);
  assert.deepEqual(lockValues, [LEAD_A]);
  assert.equal(locked?.stale, true);

  const events: string[] = [];
  const result = await service(
    repository({
      lockLatestHold: async () => ({
        ...hold({ expiresAt: '2000-01-01T00:00:00.000Z' }),
        stale: false,
      }),
      markExpired: async () => {
        throw new Error('application clock must not expire the hold');
      },
      markReleased: async () => {
        events.push('released');
        return hold({
          holdStatus: 'released',
          expiresAt: '2000-01-01T00:00:00.000Z',
          releasedAt: '2026-07-28T01:00:00.000Z',
        });
      },
    }),
  ).release(LEAD_A, PROPERTY_A, IDEMPOTENCY_KEY, { actorUserId: ACTOR_A });
  assert.equal(result.status, 200);
  assert.deepEqual(events, ['released']);
});

test('list keeps authoritative total for normal and out-of-range pages', async () => {
  const record = hold();
  const normal = await service(
    repository({
      readFeatureFlags: async () => {
        throw new Error('read must not inspect create flag');
      },
      list: async () => ({ records: [record], total: 163 }),
    }),
  ).list(plainToInstance(ListBookingLeadHoldsQueryDto, { property_id: PROPERTY_A }));
  assert.deepEqual(normal.meta, { limit: 20, offset: 0, total: 163 });
  assert.deepEqual(Object.keys(normal), ['data', 'meta']);

  const empty = await service(repository({ list: async () => ({ records: [], total: 3 }) })).list(
    plainToInstance(ListBookingLeadHoldsQueryDto, {
      property_id: PROPERTY_A,
      limit: 20,
      offset: 20,
    }),
  );
  assert.deepEqual(empty, { data: [], meta: { limit: 20, offset: 20, total: 3 } });
});

test('worker is bounded, serial, flag-independent, unrefed, and cleanly destroyed', async () => {
  const calls: Array<[number, string]> = [];
  const worker = new BookingLeadHoldExpiryWorker({
    expireDueBatch: async (limit: number, runId: string) => {
      calls.push([limit, runId]);
      return 2;
    },
  } as never);
  assert.equal(await worker.runOnce('m14-worker'), 2);
  assert.deepEqual(calls, [[100, 'm14-worker']]);

  const workerSource = source(paths.worker);
  assert.match(workerSource, /EXPIRY_INTERVAL_MS = 60_000/);
  assert.match(workerSource, /EXPIRY_BATCH_LIMIT = 100/);
  assert.match(workerSource, /setTimeout/);
  assert.match(workerSource, /this\.timer\.unref\(\)/);
  assert.match(workerSource, /onModuleDestroy[\s\S]*clearTimeout/);
  assert.doesNotMatch(workerSource, /bookingHoldWrite|assertCreateEnabled/);
  assert.throws(() =>
    assert.match(workerSource.replace('this.timer.unref();', ''), /this\.timer\.unref\(\)/),
  );
});

test('repository expiry uses one bounded transaction and FOR UPDATE SKIP LOCKED', () => {
  const repositorySource = source(paths.repository);
  const expiry = repositorySource.match(/async expireDueBatch[\s\S]*?\n  }/)?.[0];
  assert.ok(expiry);
  assert.match(expiry, /this\.transaction/);
  assert.match(expiry, /ORDER BY candidate\.property_id/);
  assert.match(expiry, /lockPropertyLifecycle[\s\S]*FOR UPDATE SKIP LOCKED/);
  assert.match(expiry, /property_id = ANY\(\$2::uuid\[\]\)/);
  assert.match(expiry, /LIMIT \$1[\s\S]*FOR UPDATE SKIP LOCKED/);
  assert.match(expiry, /markExpired[\s\S]*restoreRoomIfSafe[\s\S]*writeAudit[\s\S]*writeOutbox/);
  assert.throws(() =>
    assert.match(expiry.replace('FOR UPDATE SKIP LOCKED', 'FOR UPDATE'), /FOR UPDATE SKIP LOCKED/),
  );
});

test('expiry acquires sorted property lifecycle locks before hold and room rows', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values: values ?? [] });
      if (text.includes('SELECT DISTINCT candidate.property_id')) {
        return { rows: [{ property_id: PROPERTY_A }, { property_id: PROPERTY_B }] };
      }
      if (text.includes('FOR UPDATE SKIP LOCKED')) return { rows: [] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  const actualRepository = new BookingLeadHoldRepository({
    client: { connect: async () => client },
  } as never);

  assert.equal(await actualRepository.expireDueBatch(100, 'm14-lock-proof'), 0);
  const candidateIndex = queries.findIndex(({ text }) =>
    text.includes('SELECT DISTINCT candidate.property_id'),
  );
  const advisoryQueries = queries.filter(({ text }) => text.includes('pg_advisory_xact_lock'));
  const dueIndex = queries.findIndex(({ text }) => text.includes('FOR UPDATE SKIP LOCKED'));
  assert.ok(candidateIndex >= 0);
  assert.equal(advisoryQueries.length, 2);
  assert.deepEqual(
    advisoryQueries.map(({ values }) => values),
    [[PROPERTY_A], [PROPERTY_B]],
  );
  assert.ok(queries.indexOf(advisoryQueries[0]!) > candidateIndex);
  assert.ok(queries.indexOf(advisoryQueries[1]!) > queries.indexOf(advisoryQueries[0]!));
  assert.ok(dueIndex > queries.indexOf(advisoryQueries[1]!));
  assert.deepEqual(queries[dueIndex]?.values, [100, [PROPERTY_A, PROPERTY_B]]);
  assert.equal(queries[0]?.text, 'BEGIN');
  assert.equal(queries.at(-1)?.text, 'COMMIT');
});

test('audit/outbox stay exact and PII-free; forbidden lifecycle tables are read-only', () => {
  const repositorySource = source(paths.repository);
  for (const action of [
    'booking_lead_hold.create',
    'booking_lead_hold.release',
    'booking_lead_hold.expire',
  ]) {
    assert.match(source(paths.service) + repositorySource, new RegExp(action.replace('.', '\\.')));
  }
  for (const event of [
    'booking_lead_hold.created',
    'booking_lead_hold.released',
    'booking_lead_hold.expired',
  ]) {
    assert.match(source(paths.service) + repositorySource, new RegExp(event.replace('.', '\\.')));
  }
  const snapshot = repositorySource.match(/private auditSnapshot[\s\S]*?\n  }/)?.[0];
  assert.ok(snapshot);
  assert.doesNotMatch(
    snapshot,
    /visitor|phone|address|university|message|metadata|credential|commercial|creator|releaser/i,
  );
  assert.doesNotMatch(
    repositorySource,
    /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:residents|occupancies|leases|invoices|payments|deposit_ledger)/i,
  );
  assert.doesNotMatch(source(paths.service), /updateStatus|booking_leads\s+SET/);
});

test('module registers one controller pair, service, feature service, repository, and worker', () => {
  const moduleSource = source(paths.module);
  for (const symbol of [
    'BookingLeadHoldCommandController',
    'BookingLeadHoldReadController',
    'BookingLeadHoldService',
    'BookingLeadHoldFeatureService',
    'BookingLeadHoldRepository',
    'BookingLeadHoldExpiryWorker',
  ]) {
    assert.match(moduleSource, new RegExp(symbol));
  }
  assert.match(
    moduleSource,
    /import \{ BookingLeadHoldExpiryWorker \} from '\.\/booking-lead-hold-expiry\.worker';/,
  );
  assert.match(moduleSource, /providers:\s*\[[\s\S]*BookingLeadHoldExpiryWorker,[\s\S]*\]/);
});

test('M14 leaves Lease availability and public booking-lead entry unchanged', () => {
  const leaseSource = source(paths.lease);
  assert.match(
    leaseSource,
    /room\.room_status !== 'vacant'[\s\S]*code: 'ROOM_NOT_LEASABLE'[\s\S]*Room must be vacant before creating a lease/,
  );
  assert.doesNotMatch(leaseSource, /booking_lead_hold|booking-lead.*hold/i);
  const publicSource = source(paths.publicLead);
  assert.match(publicSource, /@Controller\('public\/booking-leads'\)/);
  assert.match(publicSource, /createPublicLead/);
  assert.doesNotMatch(publicSource, /hold/);
});
