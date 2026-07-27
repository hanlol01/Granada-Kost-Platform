import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { BookingLeadController } from '../../src/modules/booking-lead/booking-lead.controller';
import { BookingLeadService } from '../../src/modules/booking-lead/booking-lead.service';
import { CreateAdminBookingLeadDto } from '../../src/modules/booking-lead/dto/create-admin-booking-lead.dto';
import { PublicBookingLeadController } from '../../src/modules/booking-lead/public-booking-lead.controller';
import { BookingLeadRepository } from '../../src/modules/booking-lead/repositories/booking-lead.repository';
import type { BookingLeadRecord } from '../../src/modules/booking-lead/types/booking-lead.types';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const ROOM_A = '33333333-3333-4333-8333-333333333333';
const LEAD_A = '44444444-4444-4444-8444-444444444444';
const ACTOR_A = '55555555-5555-4555-8555-555555555555';

const ADMIN_RESPONSE_KEYS = [
  'buildingCode',
  'category',
  'createdAt',
  'floorCode',
  'gender',
  'id',
  'preferredMoveInDate',
  'propertyId',
  'publicGroupKey',
  'roomId',
  'roomNumber',
  'source',
  'status',
  'updatedAt',
  'visitorAddress',
  'visitorMessage',
  'visitorName',
  'visitorPhone',
  'visitorUniversity',
].sort();

function user(): UserAccessContext {
  return {
    id: ACTOR_A,
    email: null,
    phone: null,
    displayName: 'M11 Admin',
    roles: ['admin'],
    permissions: ['room.manage'],
    propertyIds: [PROPERTY_A],
    sessionId: 'session-m11',
  };
}

function dto(overrides: Partial<CreateAdminBookingLeadDto> = {}): CreateAdminBookingLeadDto {
  return plainToInstance(CreateAdminBookingLeadDto, {
    property_id: PROPERTY_A,
    room_id: ROOM_A,
    visitor_name: 'Calon Penghuni',
    gender: 'female',
    visitor_address: 'Jalan Contoh 10, Sumedang',
    visitor_university: 'Universitas Contoh',
    visitor_phone: '0812 3456 7890',
    ...overrides,
  });
}

function lead(overrides: Partial<BookingLeadRecord> = {}): BookingLeadRecord {
  return {
    id: LEAD_A,
    propertyId: PROPERTY_A,
    roomId: ROOM_A,
    roomNumber: 'RK-03-02',
    category: 'rukost',
    gender: 'female',
    buildingCode: '03',
    floorCode: 'A',
    publicGroupKey: null,
    visitorName: 'Calon Penghuni',
    visitorPhone: '6281234567890',
    visitorAddress: 'Jalan Contoh 10, Sumedang',
    visitorUniversity: 'Universitas Contoh',
    visitorMessage: null,
    preferredMoveInDate: null,
    status: 'new',
    source: 'admin_quick_entry',
    metadata: null,
    createdByUserId: ACTOR_A,
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
    updatedAt: new Date('2026-07-28T00:00:00.000Z'),
    ...overrides,
  };
}

const authoritativeRoom = {
  id: ROOM_A,
  propertyId: PROPERTY_A,
  roomNumber: 'RK-03-02',
  category: 'rukost' as const,
  floorCode: 'A' as const,
  roomStatus: 'vacant',
  genderPolicy: 'female' as const,
  buildingId: '66666666-6666-4666-8666-666666666666',
  buildingCode: '03',
  buildingCategory: 'rukost' as const,
  buildingGenderPolicy: 'female' as const,
};

test('migration 019 is additive, replay-safe, and preserves legacy public leads', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'backend/api/src/infrastructure/database/migrations/019_booking_lead_admin_quick_entry.sql',
    ),
    'utf8',
  );

  for (const column of [
    'room_id UUID',
    'visitor_address TEXT',
    'visitor_university TEXT',
    'created_by_user_id UUID',
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${column}`, 'i'));
  }
  assert.match(migration, /FOREIGN KEY \(room_id\) REFERENCES rooms\(id\) ON DELETE SET NULL/i);
  assert.match(
    migration,
    /FOREIGN KEY \(created_by_user_id\) REFERENCES users\(id\) ON DELETE SET NULL/i,
  );
  assert.match(migration, /source IN \('public_kamar', 'admin_quick_entry'\)/i);
  assert.match(
    migration,
    /visitor_address IS NULL[\s\S]*OR char_length\(trim\(visitor_address\)\)/i,
  );
  assert.match(
    migration,
    /visitor_university IS NULL[\s\S]*OR char_length\(trim\(visitor_university\)\)/i,
  );
  assert.match(migration, /CREATE INDEX IF NOT EXISTS[\s\S]*property_id[\s\S]*room_id/i);
  assert.doesNotMatch(
    migration,
    /CREATE UNIQUE INDEX[\s\S]*ON booking_leads\s*\(property_id,\s*room_id/i,
  );
  assert.doesNotMatch(migration, /ALTER TABLE\s+(?!booking_leads\b)/i);
  assert.doesNotMatch(migration, /UPDATE\s+(?:rooms|occupancies|residents|invoices|payments)\b/i);
});

test('Admin quick-entry DTO accepts only exact validated snake-case fields', async () => {
  const valid = dto();
  assert.deepEqual(await validate(valid, { whitelist: true, forbidNonWhitelisted: true }), []);
  assert.deepEqual(Object.keys(valid).sort(), [
    'gender',
    'property_id',
    'room_id',
    'visitor_address',
    'visitor_name',
    'visitor_phone',
    'visitor_university',
  ]);

  for (const invalid of [
    { property_id: 'not-a-uuid' },
    { room_id: 'not-a-uuid' },
    { visitor_name: ' ' },
    { gender: 'mixed' },
    { visitor_address: 'x' },
    { visitor_phone: 'not-a-phone' },
    { visitor_university: 'x'.repeat(161) },
    { category: 'rukost' },
    { building_code: '03' },
    { floor_code: 'A' },
    { room_number: 'RK-03-02' },
  ]) {
    const candidate = plainToInstance(CreateAdminBookingLeadDto, {
      ...dto(),
      ...invalid,
    });
    assert.notDeepEqual(
      await validate(candidate, { whitelist: true, forbidNonWhitelisted: true }),
      [],
    );
  }
});

test('POST route is manager/admin plus room.manage and checks property before service access', async () => {
  const reflector = new Reflector();
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, BookingLeadController.prototype.createAdmin),
    RequestMethod.POST,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, BookingLeadController.prototype.createAdmin),
    '/',
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      BookingLeadController.prototype.createAdmin,
      BookingLeadController,
    ]),
    ['manager', 'admin'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      BookingLeadController.prototype.createAdmin,
      BookingLeadController,
    ]),
    ['room.manage'],
  );

  let serviceCalls = 0;
  const controller = new BookingLeadController(
    {
      createAdminLead: async () => {
        serviceCalls += 1;
        return {};
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        throw new ForbiddenException({
          code: 'PROPERTY_SCOPE_DENIED',
          message: 'User is not allowed to access this property',
        });
      },
    } as never,
  );

  await assert.rejects(
    controller.createAdmin(user(), dto({ property_id: PROPERTY_B }), {} as never),
    ForbiddenException,
  );
  assert.equal(serviceCalls, 0);
});

test('Admin create rejects missing building, non-vacant room, and gender mismatch', async () => {
  const createService = (room: typeof authoritativeRoom | null) =>
    new BookingLeadService(
      {
        findAdminRoom: async () => room,
        findOrCreateAdminLead: async () => {
          throw new Error('create must not run');
        },
      } as never,
      { write: async () => undefined } as never,
    );

  await assert.rejects(
    createService(null).createAdminLead(dto(), { actorUserId: ACTOR_A }),
    NotFoundException,
  );
  await assert.rejects(
    createService({
      ...authoritativeRoom,
      buildingId: null,
      buildingCode: null,
    } as never).createAdminLead(dto(), { actorUserId: ACTOR_A }),
    BadRequestException,
  );
  await assert.rejects(
    createService({ ...authoritativeRoom, roomStatus: 'occupied' }).createAdminLead(dto(), {
      actorUserId: ACTOR_A,
    }),
    ConflictException,
  );
  await assert.rejects(
    createService(authoritativeRoom).createAdminLead(dto({ gender: 'male' }), {
      actorUserId: ACTOR_A,
    }),
    BadRequestException,
  );
});

test('Admin create derives room facts, normalizes phone, returns whitelist, and audits no PII', async () => {
  const creates: unknown[] = [];
  const audits: unknown[] = [];
  const service = new BookingLeadService(
    {
      findAdminRoom: async (propertyId: string, roomId: string) => {
        assert.deepEqual([propertyId, roomId], [PROPERTY_A, ROOM_A]);
        return authoritativeRoom;
      },
      findOrCreateAdminLead: async (input: unknown, windowMinutes: number) => {
        creates.push(input);
        assert.equal(windowMinutes, 15);
        return { lead: lead(), created: true };
      },
    } as never,
    { write: async (input: unknown) => audits.push(input) } as never,
  );

  const response = await service.createAdminLead(dto(), {
    actorUserId: ACTOR_A,
    ipAddress: '127.0.0.1',
    userAgent: 'M11 test',
    correlationId: 'm11-correlation',
  });

  assert.deepEqual(creates, [
    {
      propertyId: PROPERTY_A,
      roomId: ROOM_A,
      roomNumber: 'RK-03-02',
      category: 'rukost',
      gender: 'female',
      buildingCode: '03',
      floorCode: 'A',
      visitorName: 'Calon Penghuni',
      visitorPhone: '6281234567890',
      visitorAddress: 'Jalan Contoh 10, Sumedang',
      visitorUniversity: 'Universitas Contoh',
      createdByUserId: ACTOR_A,
    },
  ]);
  assert.deepEqual(Object.keys(response).sort(), ADMIN_RESPONSE_KEYS);
  assert.deepEqual(response, {
    id: LEAD_A,
    propertyId: PROPERTY_A,
    roomId: ROOM_A,
    roomNumber: 'RK-03-02',
    category: 'rukost',
    gender: 'female',
    buildingCode: '03',
    floorCode: 'A',
    publicGroupKey: null,
    visitorName: 'Calon Penghuni',
    visitorPhone: '6281234567890',
    visitorAddress: 'Jalan Contoh 10, Sumedang',
    visitorUniversity: 'Universitas Contoh',
    visitorMessage: null,
    preferredMoveInDate: null,
    status: 'new',
    source: 'admin_quick_entry',
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
    updatedAt: new Date('2026-07-28T00:00:00.000Z'),
  });
  assert.equal(audits.length, 1);
  assert.equal((audits[0] as { action: string }).action, 'booking_lead.create_admin');
  assert.deepEqual((audits[0] as { afterData: unknown }).afterData, {
    id: LEAD_A,
    status: 'new',
    source: 'admin_quick_entry',
  });
  const auditText = JSON.stringify(audits[0]);
  for (const forbidden of [
    'Calon Penghuni',
    '6281234567890',
    'Jalan Contoh',
    'Universitas Contoh',
    'metadata',
    'visitorAddress',
    'visitorPhone',
  ]) {
    assert.equal(auditText.includes(forbidden), false);
  }
});

test('duplicate Admin submit returns existing lead and writes no second audit', async () => {
  const audits: unknown[] = [];
  const service = new BookingLeadService(
    {
      findAdminRoom: async () => authoritativeRoom,
      findOrCreateAdminLead: async () => ({ lead: lead(), created: false }),
    } as never,
    { write: async (input: unknown) => audits.push(input) } as never,
  );

  const first = await service.createAdminLead(dto(), { actorUserId: ACTOR_A });
  const second = await service.createAdminLead(dto(), { actorUserId: ACTOR_A });
  assert.deepEqual(first, second);
  assert.deepEqual(audits, []);
});

test('repository duplicate gate is atomic and Admin path cannot mutate room lifecycle', () => {
  const repository = readFileSync(
    resolve(
      process.cwd(),
      'backend/api/src/modules/booking-lead/repositories/booking-lead.repository.ts',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve(process.cwd(), 'backend/api/src/modules/booking-lead/booking-lead.service.ts'),
    'utf8',
  );
  const repositoryRegion = repository.slice(
    repository.indexOf('async findOrCreateAdminLead'),
    repository.indexOf('async listForProperties'),
  );
  const serviceRegion = service.slice(
    service.indexOf('async createAdminLead'),
    service.indexOf('listAdminLeads'),
  );

  assert.match(repositoryRegion, /BEGIN/);
  assert.match(repositoryRegion, /pg_advisory_xact_lock/);
  assert.match(repositoryRegion, /property_id = \$1/);
  assert.match(repositoryRegion, /room_id = \$2/);
  assert.match(repositoryRegion, /visitor_phone = \$3/);
  assert.match(repositoryRegion, /source = 'admin_quick_entry'/);
  assert.match(repositoryRegion, /created_at >= now\(\) -/);
  assert.match(repositoryRegion, /COMMIT/);
  assert.match(repositoryRegion, /this\.rollback\(client\)/);
  assert.match(repository, /client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(repositoryRegion + serviceRegion, /UPDATE\s+rooms\b/i);
  assert.doesNotMatch(
    repositoryRegion + serviceRegion,
    /(?:INSERT|UPDATE|DELETE)\s+(?:occupancies|residents|invoices|payments|payment_transactions)\b/i,
  );
});

test('public duplicate lookup is isolated from Admin quick-entry leads', async () => {
  let sql = '';
  let parameters: unknown[] | undefined;
  const repository = new BookingLeadRepository({
    client: {
      query: async (query: string, values?: unknown[]) => {
        sql = query;
        parameters = values;
        return { rows: [] };
      },
    },
  } as never);

  const result = await repository.findRecentDuplicate(
    {
      propertyId: PROPERTY_A,
      category: 'rukost',
      gender: 'female',
      visitorPhone: '6281234567890',
      publicGroupKey: undefined,
    },
    15,
  );

  assert.equal(result, null);
  assert.match(sql, /source = 'public_kamar'/);
  assert.doesNotMatch(sql, /admin_quick_entry/);
  assert.deepEqual(parameters, [PROPERTY_A, '6281234567890', 'rukost', 'female', null, 15]);
});

test('repository materializes nullable room numbers for Admin list and status paths', async () => {
  const queries: string[] = [];
  const persistedRow = {
    id: LEAD_A,
    property_id: PROPERTY_A,
    room_id: ROOM_A,
    room_number: 'RK-03-02',
    category: 'rukost',
    gender: 'female',
    building_code: '03',
    floor_code: 'A',
    public_group_key: null,
    visitor_name: 'Calon Penghuni',
    visitor_phone: '6281234567890',
    visitor_address: 'Jalan Contoh 10, Sumedang',
    visitor_university: 'Universitas Contoh',
    visitor_message: null,
    preferred_move_in_date: null,
    status: 'new',
    source: 'admin_quick_entry',
    metadata: { mustNotLeak: true },
    created_by_user_id: ACTOR_A,
    created_at: new Date('2026-07-28T00:00:00.000Z'),
    updated_at: new Date('2026-07-28T00:00:00.000Z'),
  };
  const repository = new BookingLeadRepository({
    client: {
      query: async (query: string) => {
        queries.push(query);
        return { rows: [persistedRow] };
      },
    },
  } as never);

  const [listed] = await repository.listForProperties([PROPERTY_A], {});
  const found = await repository.findById(LEAD_A);
  const updated = await repository.updateStatus(LEAD_A, 'contacted');

  assert.equal(listed.roomNumber, 'RK-03-02');
  assert.equal(found?.roomNumber, 'RK-03-02');
  assert.equal(updated?.roomNumber, 'RK-03-02');
  assert.match(queries[0], /LEFT JOIN rooms ON rooms\.id = booking_leads\.room_id/);
  assert.match(queries[1], /LEFT JOIN rooms ON rooms\.id = booking_leads\.room_id/);
  assert.match(queries[2], /WITH updated AS[\s\S]*LEFT JOIN rooms ON rooms\.id = updated\.room_id/);
  for (const query of queries) {
    assert.match(query, /rooms\.number AS room_number/);
  }
});

test('public create/list/status response contracts remain compatible', async () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PublicBookingLeadController),
    'public/booking-leads',
  );
  const existing = lead({
    roomId: null,
    roomNumber: null,
    visitorAddress: null,
    visitorUniversity: null,
    createdByUserId: null,
    publicGroupKey: 'rukost-female',
    visitorMessage: 'Mohon hubungi sore hari.',
    source: 'public_kamar',
  });
  const service = new BookingLeadService(
    {
      resolvePublicPropertyId: async () => PROPERTY_A,
      findRecentDuplicate: async () => existing,
      listForProperties: async () => [existing],
    } as never,
    { write: async () => undefined } as never,
  );

  const publicResponse = await service.createPublicLead(
    plainToInstance(
      (await import('../../src/modules/booking-lead/dto/create-public-booking-lead.dto'))
        .CreatePublicBookingLeadDto,
      {
        category: 'rukost',
        gender: 'female',
        visitorName: 'Public Visitor',
        visitorPhone: '081234567890',
      },
    ),
    {},
  );
  assert.deepEqual(Object.keys(publicResponse).sort(), [
    'category',
    'createdAt',
    'gender',
    'id',
    'message',
    'status',
  ]);

  const [adminListItem] = await service.listAdminLeads([PROPERTY_A], {} as never);
  assert.deepEqual(Object.keys(adminListItem).sort(), ADMIN_RESPONSE_KEYS);
  assert.deepEqual(
    {
      roomId: adminListItem.roomId,
      roomNumber: adminListItem.roomNumber,
      visitorAddress: adminListItem.visitorAddress,
      visitorUniversity: adminListItem.visitorUniversity,
      publicGroupKey: adminListItem.publicGroupKey,
      visitorMessage: adminListItem.visitorMessage,
    },
    {
      roomId: null,
      roomNumber: null,
      visitorAddress: null,
      visitorUniversity: null,
      publicGroupKey: 'rukost-female',
      visitorMessage: 'Mohon hubungi sore hari.',
    },
  );

  const statusService = new BookingLeadService(
    {
      updateStatus: async () => lead({ ...existing, status: 'contacted' }),
    } as never,
    { write: async () => undefined } as never,
  );
  const statusResponse = await statusService.updateStatus(existing, 'contacted', {
    actorUserId: ACTOR_A,
  });
  assert.deepEqual(Object.keys(statusResponse).sort(), ADMIN_RESPONSE_KEYS);
});
