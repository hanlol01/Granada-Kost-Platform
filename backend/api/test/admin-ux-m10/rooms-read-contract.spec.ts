import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { AdminUxRoomV2Service } from '../../src/modules/admin-ux-master/admin-ux-room-v2.service';
import { RoomController } from '../../src/modules/room/room.controller';
import { RoomService } from '../../src/modules/room/room.service';

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const V2_ACCEPT = 'application/vnd.granada.admin-ux.v2+json';

const user = (propertyIds: string[] = [PROPERTY_A]): UserAccessContext => ({
  id: 'actor-admin',
  email: null,
  phone: null,
  displayName: 'M10 Admin',
  roles: ['admin'],
  permissions: ['room.read'],
  propertyIds,
  sessionId: 'session-m10',
});

test('availability preserves legacy wire and negotiates exact V2 data envelope', async () => {
  const aggregate = [{ propertyId: PROPERTY_A, status: 'vacant' as const, total: 7 }];
  const controller = new RoomController(
    { availability: async () => aggregate } as never,
    {} as never,
  );

  assert.deepEqual(await controller.availability(user(), PROPERTY_A), aggregate);
  assert.deepEqual(await controller.availability(user(), PROPERTY_A, V2_ACCEPT), {
    data: [{ property_id: PROPERTY_A, status: 'vacant', total: 7 }],
  });
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, RoomController), [
    'owner',
    'manager',
    'admin',
    'property_owner',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.availability), [
    'room.read',
  ]);
});

test('availability checks explicit property before repository access', async () => {
  let queried = false;
  const rooms = new RoomService(
    {
      availability: async () => {
        queried = true;
        return [];
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        throw new ForbiddenException('PROPERTY_SCOPE_DENIED');
      },
    } as never,
    {} as never,
  );

  await assert.rejects(() => rooms.availability(user(), PROPERTY_B), ForbiddenException);
  assert.equal(queried, false);
});

test('V2 room list keeps exact filtered total on an empty offset page', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const service = new AdminUxRoomV2Service(
    {
      client: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          return { rows: [{ total: 3 }] };
        },
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );

  const result = await service.list(user(), {
    property_id: PROPERTY_A,
    category: 'rukost',
    status: 'vacant',
    q: 'A-',
    limit: 20,
    offset: 20,
  });

  assert.deepEqual(result, {
    data: [],
    meta: { total: 3, limit: 20, offset: 20 },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /COUNT\(\*\)::int AS total/);
  assert.doesNotMatch(calls[0].sql, /COUNT\(\*\) OVER/);
  assert.match(calls[0].sql, /unavailable_occupancy\.occupancy_status = 'active'/);
  assert.match(
    calls[0].sql,
    /unavailable_lease\.lease_status IN \('active', 'awaiting_activation'\)/,
  );
  assert.match(calls[0].sql, /FROM onboarding_commitments unavailable_commitment/);
  assert.match(calls[0].sql, /FROM booking_lead_holds unavailable_hold/);
  assert.deepEqual(calls[0].values, [
    [PROPERTY_A],
    PROPERTY_A,
    null,
    'rukost',
    null,
    null,
    'vacant',
    'A-',
    'A',
    null,
  ]);
});

test('vacant-room commercial values follow the requested lease start date', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const service = new AdminUxRoomV2Service(
    {
      client: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          return { rows: [{ total: 0 }] };
        },
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );

  await service.list(user(), {
    property_id: PROPERTY_A,
    status: 'vacant',
    commercial_date: '2026-07-31',
    limit: 20,
    offset: 0,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /version\.effective_date <= COALESCE\(\$10::date, CURRENT_DATE\)/);
  assert.equal(calls[0].values[9], '2026-07-31');
});

test('count and page use identical filter semantics with no more than two base queries', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pageRow = {
    id: '33333333-3333-4333-8333-333333333333',
    property_id: PROPERTY_A,
    kost_type_id: '44444444-4444-4444-8444-444444444444',
    number: 'A-01',
    room_status: 'vacant',
    public_visible: true,
    monthly_price: 1_800_000,
    yearly_price: 0,
    deposit_amount: 0,
    kost_type_name: 'Rumah Kost',
    kost_type_slug: 'rukost',
    kost_type_category: 'rukost',
  };
  const service = new AdminUxRoomV2Service(
    {
      client: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          if (/COUNT\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 1 }] };
          if (/FROM rooms room/.test(sql)) return { rows: [pageRow] };
          return { rows: [] };
        },
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );

  const result = await service.list(user(), {
    property_id: PROPERTY_A,
    category: 'rukost',
    limit: 20,
    offset: 0,
  });
  const base = calls.filter(({ sql }) => /FROM rooms room/.test(sql));

  assert.equal(base.length, 2);
  assert.deepEqual(base[0].values, base[1].values.slice(0, 10));
  assert.equal(result.meta.total, 1);
  assert.deepEqual(Object.keys(result).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(result.meta).sort(), ['limit', 'offset', 'total']);
});

test('room read patch does not add schema or migration operations', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/admin-ux-master/admin-ux-room-v2.service.ts'),
    'utf8',
  );
  const controller = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/room/room.controller.ts'),
    'utf8',
  );
  assert.doesNotMatch(service + controller, /\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i);
});
