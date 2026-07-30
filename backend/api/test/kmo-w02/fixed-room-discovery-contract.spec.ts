import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { AdminUxRoomV2Service } from '../../src/modules/admin-ux-master/admin-ux-room-v2.service';
import { RoomController } from '../../src/modules/room/room.controller';
import {
  ROOM_BUILDING_SEEDS,
  ROOM_SEEDS,
} from '../../src/infrastructure/database/seeds/core-seed.data';

const PROPERTY_ID = '20000000-0000-4000-8000-000000000001';
const BUILDING_ID = '31000000-0000-4000-8000-000000000001';
const KOST_TYPE_ID = '30000000-0000-4000-8000-000000000001';
const V2_ACCEPT = 'application/vnd.granada.admin-ux.v2+json';

const admin = {
  id: '10000000-0000-4000-8000-000000000001',
  roles: ['admin'],
  permissions: ['room.read', 'room.manage'],
  propertyIds: [PROPERTY_ID],
};

function exceptionCode(error: unknown): string | undefined {
  return error instanceof HttpException
    ? String((error.getResponse() as Record<string, unknown>).code)
    : undefined;
}

function isFixedInventoryError(error: unknown): boolean {
  if (!(error instanceof HttpException) || error.getStatus() !== 409) return false;
  assert.deepEqual(error.getResponse(), {
    code: 'ROOM_INVENTORY_FIXED',
    message: 'Room inventory is fixed and cannot be expanded through routine operations.',
  });
  return true;
}

function serviceFixture() {
  const calls = { authorization: 0, query: 0, transaction: 0, audit: 0 };
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    client: {
      query: async (sql: string, values: unknown[]) => {
        calls.query += 1;
        queries.push({ sql, values });
        if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
        throw new Error(`Unexpected query with ${values.length} values`);
      },
    },
    transaction: async () => {
      calls.transaction += 1;
      throw new Error('transaction must not run');
    },
  };
  const properties = {
    assertCanReadProperty: async (_user: unknown, propertyId: string) => {
      calls.authorization += 1;
      assert.equal(propertyId, PROPERTY_ID);
    },
  };
  const audit = {
    write: async () => {
      calls.audit += 1;
    },
  };
  return {
    calls,
    queries,
    service: new AdminUxRoomV2Service(database as never, properties as never, audit as never),
  };
}

const createBody = {
  property_id: PROPERTY_ID,
  kost_type_id: KOST_TYPE_ID,
  number: 'QA-ROOM',
  building_id: BUILDING_ID,
  floor_code: 'A',
};

test('canonical seed fixes the authoritative inventory at 163 rooms and 26 buildings', () => {
  assert.equal(ROOM_BUILDING_SEEDS.length, 26);
  assert.equal(ROOM_SEEDS.length, 163);
  assert.equal(ROOM_SEEDS.filter((room) => room.number.startsWith('RK-')).length, 123);
  assert.equal(ROOM_SEEDS.filter((room) => room.number.startsWith('AK-')).length, 40);
});

test('authorized V2 and legacy routine create fail before command, transaction, audit, or write', async () => {
  const v2 = serviceFixture();
  await assert.rejects(
    () => v2.service.create(admin as never, createBody, {}, 'ignored-idempotency-key'),
    isFixedInventoryError,
  );
  assert.deepEqual(v2.calls, { authorization: 1, query: 0, transaction: 0, audit: 0 });

  const legacy = serviceFixture();
  await assert.rejects(
    () => legacy.service.rejectRoutineCreate(admin as never, PROPERTY_ID),
    isFixedInventoryError,
  );
  assert.deepEqual(legacy.calls, { authorization: 1, query: 0, transaction: 0, audit: 0 });
});

test('live RoomController dispatches both POST variants to fixed-inventory authority', async () => {
  const calls: string[] = [];
  const controller = new RoomController(
    {
      createRoom: async () => {
        throw new Error('legacy room write must be unreachable');
      },
    } as never,
    {
      create: async () => {
        calls.push('v2');
        throw new Error('fixed');
      },
      rejectRoutineCreate: async () => {
        calls.push('legacy');
        throw new Error('fixed');
      },
    } as never,
  );
  const request = (accept?: string) =>
    ({
      headers: { accept, 'idempotency-key': 'not-authoritative-for-fixed-create' },
      correlationId: 'qa',
    }) as never;

  await assert.rejects(() => controller.create(admin as never, createBody, request(V2_ACCEPT)));
  await assert.rejects(() => controller.create(admin as never, createBody, request()));
  assert.deepEqual(calls, ['v2', 'legacy']);
});

test('V2 discovery validates combined filters, strict booleans, UUIDs, and unknown fields', async () => {
  const current = serviceFixture();
  const page = await current.service.list(admin as never, {
    property_id: PROPERTY_ID,
    q: '  RK_01%  ',
    category: 'rukost',
    status: 'vacant',
    gender_policy: 'male',
    building_id: BUILDING_ID,
    floor_code: 'A',
    active_occupancy: 'false',
    reconciliation_state: 'normal',
    sort: 'active_resident',
    order: 'desc',
    include_active_lease: 'true',
    limit: '20',
    offset: '200',
  });
  assert.deepEqual(page, { data: [], meta: { limit: 20, offset: 200, total: 0 } });
  assert.equal(current.calls.query, 1);
  assert.equal(current.queries[0].values[7], 'RK\\_01\\%');
  assert.equal(current.queries[0].values[9], false);
  assert.match(current.queries[0].sql, /building\.building_code ILIKE/);
  assert.match(current.queries[0].sql, /building\.building_name ILIKE/);
  assert.match(current.queries[0].sql, /WHEN 'rukost' THEN 'Rumah Kost'/);
  assert.match(current.queries[0].sql, /WHEN 'apartkost' THEN 'Apart Kost'/);
  assert.match(current.queries[0].sql, /active_resident\.full_name ILIKE/);

  for (const invalid of [
    { property_id: PROPERTY_ID, active_occupancy: '1' },
    { property_id: PROPERTY_ID, active_occupancy: '0' },
    { property_id: PROPERTY_ID, active_occupancy: '' },
    { property_id: PROPERTY_ID, active_occupancy: 'yes' },
    { property_id: PROPERTY_ID, active_occupancy: 'arbitrary' },
    { property_id: PROPERTY_ID, active_occupancy: {} },
    { property_id: PROPERTY_ID, active_occupancy: [] },
    { property_id: PROPERTY_ID, include_active_lease: '0' },
    { property_id: PROPERTY_ID, include_active_lease: '' },
    { property_id: PROPERTY_ID, include_active_lease: 'yes' },
    { property_id: PROPERTY_ID, include_active_lease: {} },
    { property_id: PROPERTY_ID, include_active_lease: [] },
    { property_id: PROPERTY_ID, building_id: 'not-v4' },
    { property_id: PROPERTY_ID, sort: 'room.number; DROP TABLE rooms' },
    { property_id: PROPERTY_ID, unexpected: true },
  ]) {
    const fixture = serviceFixture();
    await assert.rejects(
      () => fixture.service.list(admin as never, invalid),
      (error) => exceptionCode(error) === 'VALIDATION_ERROR',
    );
    assert.equal(fixture.calls.query, 0);
  }
});

test('list source shares one predicate, escapes literal search, and maps sort without raw SQL input', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/admin-ux-master/admin-ux-room-v2.service.ts'),
    'utf8',
  );
  const list = source.slice(source.indexOf('async list('), source.indexOf('async buildings('));
  assert.match(list, /const fromAndWhere =/);
  assert.equal((list.match(/\$\{fromAndWhere\}/g) ?? []).length, 2);
  assert.match(list, /active_resident\.full_name/);
  assert.match(list, /building\.building_code/);
  assert.match(list, /building\.building_name/);
  assert.match(list, /WHEN 'rukost' THEN 'Rumah Kost'/);
  assert.match(list, /WHEN 'apartkost' THEN 'Apart Kost'/);
  assert.match(list, /kost_type\.property_id = room\.property_id/);
  assert.match(list, /building\.property_id = room\.property_id/);
  assert.match(list, /\$5::uuid IS NULL OR building\.id = \$5/);
  assert.match(list, /active_resident\.property_id = active_occupancy\.property_id/);
  assert.match(list, /active_occupancy\.property_id = room\.property_id/);
  assert.match(list, /active_occupancy\.room_id = room\.id/);
  assert.match(list, /active_occupancy\.occupancy_status = 'active'/);
  assert.match(list, /escapeSearchPattern/);
  assert.match(list, /ORDER BY \$\{orderBy\}, room\.id/);
  assert.doesNotMatch(list, /ORDER BY \$\{query\./);

  const assertFixedCreate = (candidate: string) => {
    const create = candidate.slice(
      candidate.indexOf('async create('),
      candidate.indexOf('async rejectRoutineCreate('),
    );
    assert.match(create, /assertCanMutate/);
    assert.match(create, /throwFixedInventory/);
    assert.doesNotMatch(create, /executeCommand|transaction|INSERT INTO rooms|audit\.write/);
  };
  assertFixedCreate(source);
  assert.throws(() =>
    assertFixedCreate(
      source.replace('this.throwFixedInventory();', 'return this.executeCommand();'),
    ),
  );

  const assertCompleteDiscovery = (candidate: string) => {
    for (const pattern of [
      /building\.building_code ILIKE/,
      /building\.building_name ILIKE/,
      /WHEN 'rukost' THEN 'Rumah Kost'/,
      /WHEN 'apartkost' THEN 'Apart Kost'/,
      /active_resident\.full_name ILIKE/,
      /kost_type\.property_id = room\.property_id/,
      /building\.property_id = room\.property_id/,
      /active_resident\.property_id = active_occupancy\.property_id/,
      /active_occupancy\.property_id = room\.property_id/,
      /active_occupancy\.occupancy_status = 'active'/,
    ]) {
      assert.match(candidate, pattern);
    }
    assert.equal(
      (candidate.match(/active_occupancy\.property_id = room\.property_id/g) ?? []).length,
      2,
    );
    assert.equal(
      (candidate.match(/active_occupancy\.occupancy_status = 'active'/g) ?? []).length,
      2,
    );
  };
  assertCompleteDiscovery(list);
  for (const mutation of [
    list.replace('building.building_code ILIKE', 'building.id::text ILIKE'),
    list.replace("WHEN 'rukost' THEN 'Rumah Kost'", "WHEN 'rukost' THEN 'rukost'"),
    list.replace(
      "active_occupancy.occupancy_status = 'active'",
      "active_occupancy.occupancy_status = 'ended'",
    ),
    list.replace('building.property_id = room.property_id', 'building.id = room.building_id'),
    list.replace(
      'active_resident.property_id = active_occupancy.property_id',
      'active_resident.id = active_occupancy.resident_id',
    ),
  ]) {
    assert.throws(() => assertCompleteDiscovery(mutation));
  }
  assert.throws(() =>
    assertFixedCreate(source.replace('await this.assertCanMutate(user, input.property_id);', '')),
  );

  const assertScopedSearch = (candidate: string) =>
    assert.match(candidate, /active_resident\.property_id = active_occupancy\.property_id/);
  assertScopedSearch(list);
  assert.throws(() =>
    assertScopedSearch(
      list.replace(
        'active_resident.property_id = active_occupancy.property_id',
        'active_resident.id = active_occupancy.resident_id',
      ),
    ),
  );
});
