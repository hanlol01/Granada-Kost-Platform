import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { ListRoomBuildingsV2QueryDto } from '../../src/modules/admin-ux-master/admin-ux-room-v2.dto';
import { AdminUxRoomV2Service } from '../../src/modules/admin-ux-master/admin-ux-room-v2.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { RoomController } from '../../src/modules/room/room.controller';

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const BUILDING_A = '33333333-3333-4333-8333-333333333333';

const user = (): UserAccessContext => ({
  id: 'actor-admin',
  email: null,
  phone: null,
  displayName: 'M10 Admin',
  roles: ['admin'],
  permissions: ['room.read'],
  propertyIds: [PROPERTY_A],
  sessionId: 'session-m10',
});

test('building query DTO requires property UUID and exact optional category', async () => {
  assert.equal(
    (await validate(plainToInstance(ListRoomBuildingsV2QueryDto, {}))).some(
      (error) => error.property === 'property_id',
    ),
    true,
  );
  assert.equal(
    (
      await validate(
        plainToInstance(ListRoomBuildingsV2QueryDto, {
          property_id: PROPERTY_A,
          category: 'other',
        }),
      )
    ).some((error) => error.property === 'category'),
    true,
  );
  assert.deepEqual(
    await validate(
      plainToInstance(ListRoomBuildingsV2QueryDto, {
        property_id: PROPERTY_A,
        category: 'rukost',
      }),
    ),
    [],
  );
});

test('static buildings route precedes dynamic room route and keeps read RBAC', () => {
  const controller = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/room/room.controller.ts'),
    'utf8',
  );

  assert.ok(controller.indexOf("@Get('buildings')") < controller.indexOf("@Get(':roomId')"));
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, RoomController), [
    'owner',
    'manager',
    'admin',
    'property_owner',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.buildings), [
    'room.read',
  ]);
});

test('building reference is property scoped before one ordered repository query', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const scopeChecks: string[] = [];
  const service = new AdminUxRoomV2Service(
    {
      client: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          return {
            rows: [
              {
                id: BUILDING_A,
                property_id: PROPERTY_A,
                category: 'rukost',
                building_code: 'RK-A',
                building_name: 'Rumah Kost A',
                gender_policy: 'female',
                metadata: { forbidden: true },
              },
            ],
          };
        },
      },
    } as never,
    {
      assertCanReadProperty: async (_user: UserAccessContext, propertyId: string) => {
        scopeChecks.push(propertyId);
      },
    } as never,
    {} as never,
  );

  const result = await service.buildings(user(), {
    property_id: PROPERTY_A,
    category: 'rukost',
  });

  assert.deepEqual(scopeChecks, [PROPERTY_A]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /\bFROM room_buildings\b/);
  assert.match(calls[0].sql, /\bproperty_id = \$1\b/);
  assert.match(calls[0].sql, /\bcategory = \$2\b/);
  assert.match(calls[0].sql, /ORDER BY category, building_code, id/);
  assert.deepEqual(calls[0].values, [PROPERTY_A, 'rukost']);
  assert.deepEqual(result, {
    data: [
      {
        id: BUILDING_A,
        property_id: PROPERTY_A,
        category: 'rukost',
        building_code: 'RK-A',
        building_name: 'Rumah Kost A',
        gender_policy: 'female',
      },
    ],
  });
});

test('property denial performs zero building queries', async () => {
  let queried = false;
  const service = new AdminUxRoomV2Service(
    {
      client: {
        query: async () => {
          queried = true;
          return { rows: [] };
        },
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        throw new ForbiddenException('PROPERTY_SCOPE_DENIED');
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () => service.buildings(user(), { property_id: PROPERTY_B }),
    ForbiddenException,
  );
  assert.equal(queried, false);
});

test('building reference patch remains read-only and schema-free', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/admin-ux-master/admin-ux-room-v2.service.ts'),
    'utf8',
  );
  const controller = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/room/room.controller.ts'),
    'utf8',
  );
  assert.doesNotMatch(service + controller, /\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i);
  assert.doesNotMatch(
    service.slice(service.indexOf('async buildings'), service.indexOf('async get')),
    /\b(?:INSERT|UPDATE|DELETE)\b/i,
  );
});
