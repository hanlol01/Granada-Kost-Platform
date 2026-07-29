import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingModule } from '../../src/modules/billing/billing.module';
import { MyBillingController } from '../../src/modules/billing/controllers/my-billing.controller';
import { InvoiceRepository } from '../../src/modules/billing/repositories/invoice.repository';
import { PaymentRepository } from '../../src/modules/billing/repositories/payment.repository';
import { ComplaintModule } from '../../src/modules/complaint/complaint.module';
import { MyComplaintController } from '../../src/modules/complaint/controllers/my-complaint.controller';
import { ComplaintRepository } from '../../src/modules/complaint/repositories/complaint.repository';
import { ComplaintService } from '../../src/modules/complaint/services/complaint.service';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PaymentGatewayModule } from '../../src/modules/payment-gateway/payment-gateway.module';
import { PaymentGatewayController } from '../../src/modules/payment-gateway/payment-gateway.controller';
import { PaymentGatewayService } from '../../src/modules/payment-gateway/payment-gateway.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../src/modules/rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/modules/rbac/guards/rbac.guard';
import { CreateResidentDto } from '../../src/modules/resident/dto/create-resident.dto';
import { UpdateResidentDto } from '../../src/modules/resident/dto/update-resident.dto';
import { MyResidentContextController } from '../../src/modules/resident/my-resident-context.controller';
import { PropertyOwnerResidentController } from '../../src/modules/resident/property-owner-resident.controller';
import {
  residentPropertyMembershipSql,
  ResidentRepository,
} from '../../src/modules/resident/repositories/resident.repository';
import { ResidentModule } from '../../src/modules/resident/resident.module';
import {
  selectSingleResidentContext,
  ResidentService,
} from '../../src/modules/resident/resident.service';
import { MyVehicleController } from '../../src/modules/vehicle/controllers/my-vehicle.controller';
import { VehicleRepository } from '../../src/modules/vehicle/repositories/vehicle.repository';
import { VehicleService } from '../../src/modules/vehicle/services/vehicle.service';
import { VehicleModule } from '../../src/modules/vehicle/vehicle.module';

const root = resolve(__dirname, '../..');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_A = '22222222-2222-4222-8222-222222222222';
const PROPERTY_B = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = '44444444-4444-4444-8444-444444444444';
const ROOM_ID = '55555555-5555-4555-8555-555555555555';
const RECORD_ID = '66666666-6666-4666-8666-666666666666';
const ATTACKER_USER_ID = '77777777-7777-4777-8777-777777777777';

const paths = {
  createDto: resolve(root, 'src/modules/resident/dto/create-resident.dto.ts'),
  updateDto: resolve(root, 'src/modules/resident/dto/update-resident.dto.ts'),
  residentRepository: resolve(root, 'src/modules/resident/repositories/resident.repository.ts'),
  residentService: resolve(root, 'src/modules/resident/resident.service.ts'),
  residentModule: resolve(root, 'src/modules/resident/resident.module.ts'),
  propertyOwnerController: resolve(
    root,
    'src/modules/resident/property-owner-resident.controller.ts',
  ),
  invoiceRepository: resolve(root, 'src/modules/billing/repositories/invoice.repository.ts'),
  paymentRepository: resolve(root, 'src/modules/billing/repositories/payment.repository.ts'),
  complaintRepository: resolve(root, 'src/modules/complaint/repositories/complaint.repository.ts'),
  vehicleRepository: resolve(root, 'src/modules/vehicle/repositories/vehicle.repository.ts'),
};

type CapturedQuery = { sql: string; params: unknown[] };

function response(error: unknown): unknown {
  assert.ok(error instanceof HttpException);
  return error.getResponse();
}

function controllers(module: unknown): unknown[] {
  return Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) as unknown[];
}

function actor(propertyIds: string[] = [PROPERTY_A]): UserAccessContext {
  return {
    id: USER_ID,
    email: null,
    phone: null,
    displayName: 'Resident actor',
    roles: ['resident'],
    permissions: ['billing.self.read'],
    propertyIds,
    sessionId: 'm18-session',
  };
}

function database(
  rowsFor: (sql: string, params: unknown[]) => Record<string, unknown>[] = () => [],
) {
  const queries: CapturedQuery[] = [];
  return {
    queries,
    value: {
      client: {
        query: async (sql: string, params: unknown[] = []) => {
          queries.push({ sql, params });
          return { rows: rowsFor(sql, params) };
        },
      },
    },
  };
}

function residentRow() {
  return {
    id: RESIDENT_ID,
    property_id: PROPERTY_A,
    user_id: null,
    full_name: 'Resident Demo',
    phone: null,
    email: null,
    ktp_number: null,
    date_of_birth: null,
    place_of_birth: null,
    address: null,
    emergency_phone: null,
    ktp_file_id: null,
    profile_photo_file_id: null,
    gender: 'female',
    resident_status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function residentContext(propertyName = 'Property Demo') {
  return {
    displayName: 'Resident Demo',
    phone: null,
    propertyName,
    roomNumber: 'RK-01-01',
    occupancyStart: '2026-01-01',
  };
}

function activeComplaintContext(propertyId = PROPERTY_A) {
  return {
    propertyId,
    residentId: RESIDENT_ID,
    roomId: ROOM_ID,
    roomNumber: 'RK-01-01',
    residentName: 'Resident Demo',
  };
}

async function validationErrors<T extends object>(constructor: new () => T, input: unknown) {
  return validate(plainToInstance(constructor, input, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

function readSources() {
  return Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
  ) as Record<keyof typeof paths, string>;
}

function assertSourceContracts(sources: ReturnType<typeof readSources>): void {
  assert.doesNotMatch(sources.createDto, /\buser_id\b|\buserId\b/);
  assert.doesNotMatch(sources.updateDto, /\buser_id\b|\buserId\b/);

  const createStart = sources.residentRepository.indexOf('async create(');
  const updateStart = sources.residentRepository.indexOf('async update(');
  const updateStatusStart = sources.residentRepository.indexOf('async updateStatus(');
  assert.ok(createStart >= 0 && updateStart > createStart && updateStatusStart > updateStart);
  const createRegion = sources.residentRepository.slice(createStart, updateStart);
  const updateRegion = sources.residentRepository.slice(updateStart, updateStatusStart);
  assert.doesNotMatch(createRegion, /dto\.user_id/);
  assert.doesNotMatch(createRegion.slice(0, createRegion.indexOf('RETURNING')), /\buser_id\b/);
  assert.doesNotMatch(updateRegion, /dto\.user_id/);
  assert.doesNotMatch(
    updateRegion.slice(0, updateRegion.indexOf('RETURNING')),
    /SET\s+user_id|^\s*user_id\s*=/m,
  );

  assert.match(
    sources.residentRepository,
    /resident_membership\.property_id\s*=\s*residents\.property_id/,
  );
  assert.match(sources.residentRepository, /resident_membership\.revoked_at IS NULL/);
  assert.match(sources.residentRepository, /resident_role\.name\s*=\s*'resident'/);
  assert.match(sources.residentRepository, /LIMIT 2/);
  assert.doesNotMatch(
    sources.residentRepository.slice(
      sources.residentRepository.indexOf('async findActiveContextsForUser('),
    ),
    /LIMIT 1/,
  );

  for (const [key, entity] of [
    ['invoiceRepository', 'invoices'],
    ['paymentRepository', 'payments'],
    ['complaintRepository', 'complaints'],
    ['vehicleRepository', 'vehicles'],
  ] as const) {
    assert.match(sources[key], /residentPropertyMembershipSql/);
    assert.match(
      sources[key],
      new RegExp(`${entity}\\.property_id\\s*=\\s*residents\\.property_id`),
    );
  }

  assert.match(sources.residentModule, /MyResidentContextController/);
  assert.match(sources.residentService, /RESIDENT_CONTEXT_AMBIGUOUS/);
  assert.doesNotMatch(
    sources.propertyOwnerController,
    /\b(phone|email|address|date_of_birth|ktp|emergency|user_id|resident_id|room_id|property_id|lease_id|metadata)\b/,
  );
}

test('live registered routes freeze resident self-service inventory and distinct user-scoped exclusions', () => {
  assert.equal(
    controllers(ResidentModule).filter((controller) => controller === MyResidentContextController)
      .length,
    1,
  );
  assert.ok(controllers(ResidentModule).includes(PropertyOwnerResidentController));
  assert.ok(controllers(BillingModule).includes(MyBillingController));
  assert.ok(controllers(PaymentGatewayModule).includes(PaymentGatewayController));
  assert.ok(controllers(ComplaintModule).includes(MyComplaintController));
  assert.ok(controllers(VehicleModule).includes(MyVehicleController));

  assert.equal(
    Reflect.getMetadata(PATH_METADATA, MyResidentContextController),
    'my/resident-context',
  );
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, MyResidentContextController), ['resident']);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, MyResidentContextController), [
    JwtAuthGuard,
    RbacGuard,
  ]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PropertyOwnerResidentController), [
    'property_owner',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, PropertyOwnerResidentController), [
    'resident.read',
  ]);
});

test('Admin resident DTOs reject every client-controlled identity shape while valid writes remain compatible', async () => {
  const validCreate = {
    property_id: PROPERTY_A,
    full_name: 'Resident Demo',
    phone: '081234567890',
  };
  assert.deepEqual(await validationErrors(CreateResidentDto, validCreate), []);
  assert.deepEqual(
    await validationErrors(UpdateResidentDto, { full_name: 'Resident Updated' }),
    [],
  );

  for (const malicious of [
    { ...validCreate, user_id: ATTACKER_USER_ID },
    { ...validCreate, userId: ATTACKER_USER_ID },
    { ...validCreate, identity: { user_id: ATTACKER_USER_ID } },
    {
      ...validCreate,
      emergency_contacts: [
        {
          contact_name: 'Contact',
          phone: '081234567890',
          user_id: ATTACKER_USER_ID,
        },
      ],
    },
    { ...validCreate, account_id: ATTACKER_USER_ID },
    { ...validCreate, principal: { id: ATTACKER_USER_ID } },
  ]) {
    assert.ok((await validationErrors(CreateResidentDto, malicious)).length > 0);
  }
  for (const malicious of [
    { full_name: 'Resident Updated', user_id: ATTACKER_USER_ID },
    { full_name: 'Resident Updated', userId: ATTACKER_USER_ID },
    { full_name: 'Resident Updated', identity: { user_id: ATTACKER_USER_ID } },
    {
      full_name: 'Resident Updated',
      emergency_contacts: [
        {
          contact_name: 'Contact',
          phone: '081234567890',
          userId: ATTACKER_USER_ID,
        },
      ],
    },
  ]) {
    assert.ok((await validationErrors(UpdateResidentDto, malicious)).length > 0);
  }
});

test('repository ignores identity decoys even when invoked outside controller validation', async () => {
  const row = residentRow();
  const captured = database((sql) => {
    if (/INSERT INTO residents|UPDATE residents|FROM residents/.test(sql)) return [row];
    return [];
  });
  const repository = new ResidentRepository(captured.value as never);

  await repository.create(
    {
      property_id: PROPERTY_A,
      full_name: 'Resident Demo',
      user_id: ATTACKER_USER_ID,
    } as never,
    USER_ID,
  );
  await repository.update(
    RESIDENT_ID,
    { full_name: 'Resident Updated', user_id: ATTACKER_USER_ID } as never,
    USER_ID,
  );

  const create = captured.queries.find((query) => /INSERT INTO residents/.test(query.sql));
  const update = captured.queries.find((query) => /UPDATE residents/.test(query.sql));
  assert.ok(create);
  assert.ok(update);
  assert.doesNotMatch(create.sql.slice(0, create.sql.indexOf('RETURNING')), /\buser_id\b/);
  assert.doesNotMatch(
    update.sql.slice(0, update.sql.indexOf('RETURNING')),
    /SET\s+user_id|^\s*user_id\s*=/m,
  );
  assert.equal(create.params.includes(ATTACKER_USER_ID), false);
  assert.equal(update.params.includes(ATTACKER_USER_ID), false);
});

test('canonical membership predicate binds user, resident role, and exact non-revoked property membership', () => {
  const sql = residentPropertyMembershipSql('$2');
  assert.match(sql, /^\s*EXISTS\s*\(/);
  assert.match(sql, /resident_membership\.user_id = \$2/);
  assert.match(sql, /resident_membership\.property_id = residents\.property_id/);
  assert.match(sql, /resident_membership\.revoked_at IS NULL/);
  assert.match(sql, /resident_role\.name = 'resident'/);
});

test('resident context is bounded, deterministic, safe-null, and conflicts on ambiguity', async () => {
  const captured = database(() => []);
  const repository = new ResidentRepository(captured.value as never);
  assert.deepEqual(await repository.findActiveContextsForUser(USER_ID), []);
  const query = captured.queries.at(-1);
  assert.ok(query);
  assert.deepEqual(query.params, [USER_ID]);
  assert.match(query.sql, /residents\.resident_status = 'active'/);
  assert.match(query.sql, /occupancies\.occupancy_status = 'active'/);
  assert.match(query.sql, /occupancies\.end_date IS NULL/);
  assert.match(query.sql, /occupancies\.property_id = residents\.property_id/);
  assert.match(query.sql, /rooms\.property_id = residents\.property_id/);
  assert.match(query.sql, /ORDER BY occupancies\.start_date DESC, occupancies\.id ASC/);
  assert.match(query.sql, /LIMIT 2/);
  assert.doesNotMatch(query.sql, /LIMIT 1/);

  assert.equal(selectSingleResidentContext([]), null);
  assert.deepEqual(selectSingleResidentContext([residentContext()]), residentContext());
  assert.throws(
    () => selectSingleResidentContext([residentContext('A'), residentContext('B')]),
    (error) => {
      assert.deepEqual(response(error), {
        code: 'RESIDENT_CONTEXT_AMBIGUOUS',
        message: 'Multiple active resident contexts are available',
      });
      return true;
    },
  );

  let contexts = [residentContext()];
  const requestedUserIds: string[] = [];
  const service = new ResidentService(
    {
      findActiveContextsForUser: async (userId: string) => {
        requestedUserIds.push(userId);
        return contexts;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  assert.deepEqual(await service.myContext(USER_ID), residentContext());
  contexts = [];
  assert.equal(await service.myContext(USER_ID), null);
  contexts = [residentContext('A'), residentContext('B')];
  await assert.rejects(service.myContext(USER_ID), (error) => {
    assert.deepEqual(response(error), {
      code: 'RESIDENT_CONTEXT_AMBIGUOUS',
      message: 'Multiple active resident contexts are available',
    });
    return true;
  });
  assert.deepEqual(requestedUserIds, [USER_ID, USER_ID, USER_ID]);
});

test('/my/resident-context returns exact whitelisted envelope without opaque IDs or excess PII', async () => {
  const context = residentContext();
  const controller = new MyResidentContextController({
    myContext: async () => context,
  } as never);
  assert.deepEqual(await controller.get(actor()), {
    data: {
      display_name: 'Resident Demo',
      phone: null,
      property_name: 'Property Demo',
      room_number: 'RK-01-01',
      occupancy_start: '2026-01-01',
    },
  });

  const zero = new MyResidentContextController({
    myContext: async () => null,
  } as never);
  assert.deepEqual(await zero.get(actor()), { data: null });
  assert.deepEqual(Object.keys((await controller.get(actor())).data).sort(), [
    'display_name',
    'occupancy_start',
    'phone',
    'property_name',
    'room_number',
  ]);
});

test('Property Owner authorization happens before safe-summary lookup and response remains PII-free', async () => {
  const events: string[] = [];
  const service = new ResidentService(
    {
      listPropertyOwnerSummary: async () => {
        events.push('query');
        return [
          {
            displayName: 'Resident Demo',
            roomNumber: 'RK-01-01',
            status: 'active',
          },
        ];
      },
    } as never,
    {
      assertCanReadProperty: async () => events.push('authorize'),
    } as never,
    {} as never,
    {} as never,
  );
  const controller = new PropertyOwnerResidentController(service);
  assert.deepEqual(await controller.list(actor(), PROPERTY_A), [
    {
      display_name: 'Resident Demo',
      room_number: 'RK-01-01',
      status: 'active',
    },
  ]);
  assert.deepEqual(events, ['authorize', 'query']);

  const deniedEvents: string[] = [];
  const deniedService = new ResidentService(
    {
      listPropertyOwnerSummary: async () => {
        deniedEvents.push('query');
        return [];
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        deniedEvents.push('authorize');
        throw new Error('scope denied');
      },
    } as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(
    new PropertyOwnerResidentController(deniedService).list(actor([]), PROPERTY_B),
    /scope denied/,
  );
  assert.deepEqual(deniedEvents, ['authorize']);
});

test('all vulnerable repository paths enforce shared same-property resident membership', async () => {
  const captured = database(() => []);
  const invoice = new InvoiceRepository(captured.value as never);
  const payment = new PaymentRepository(captured.value as never);
  const complaint = new ComplaintRepository(captured.value as never);
  const vehicle = new VehicleRepository(captured.value as never);

  await invoice.listForUser(USER_ID);
  await invoice.findByIdForUser(RECORD_ID, USER_ID);
  await payment.listForUser(USER_ID);
  await complaint.listForUser(USER_ID);
  await complaint.findByIdForUser(RECORD_ID, USER_ID);
  await complaint.activeContextsForUser(USER_ID);
  await vehicle.listForUser(USER_ID);
  await vehicle.findByIdForUser(RECORD_ID, USER_ID);
  await vehicle.activeContextsForUser(USER_ID);

  assert.equal(captured.queries.length, 9);
  for (const [index, query] of captured.queries.entries()) {
    assert.match(query.sql, /resident_membership\.property_id = residents\.property_id/);
    assert.match(query.sql, /resident_membership\.revoked_at IS NULL/);
    assert.match(query.sql, /resident_role\.name = 'resident'/);
    assert.match(query.sql, /\bEXISTS\s*\(/);
    assert.match(
      query.sql,
      new RegExp(`residents\\.user_id = \\$${[1, 2, 1, 1, 2, 1, 1, 2, 1][index]}`),
    );
  }
  for (const [index, entity] of [
    [0, 'invoices'],
    [1, 'invoices'],
    [2, 'payments'],
    [3, 'complaints'],
    [4, 'complaints'],
    [6, 'vehicles'],
    [7, 'vehicles'],
  ] as const) {
    assert.match(
      captured.queries[index].sql,
      new RegExp(`${entity}\\.property_id = residents\\.property_id`),
    );
  }
  for (const query of [captured.queries[5], captured.queries[8]]) {
    assert.match(query.sql, /residents\.resident_status = 'active'/);
    assert.match(query.sql, /occupancies\.occupancy_status = 'active'/);
    assert.match(query.sql, /occupancies\.end_date IS NULL/);
    assert.match(query.sql, /occupancies\.property_id = residents\.property_id/);
    assert.match(query.sql, /rooms\.property_id = residents\.property_id/);
    assert.match(query.sql, /LIMIT 2/);
    assert.doesNotMatch(query.sql, /LIMIT 1/);
  }
});

test('complaint and vehicle resident mutations fail closed when active context is ambiguous', async () => {
  const contexts = [activeComplaintContext(PROPERTY_A), activeComplaintContext(PROPERTY_B)];
  const complaint = new ComplaintService(
    { activeContextsForUser: async () => contexts } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const vehicle = new VehicleService(
    { activeContextsForUser: async () => contexts } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  for (const operation of [
    () => complaint.activeResidentContextForUser(USER_ID),
    () => vehicle.activeResidentContextForUser(USER_ID),
    () =>
      complaint.createComplaint({
        propertyId: PROPERTY_A,
        residentId: RESIDENT_ID,
        roomId: ROOM_ID,
        categoryId: RECORD_ID,
        complaintCode: 'CMP-M18',
        title: 'Leak check',
        description: 'Must stop before mutation',
        priority: 'medium',
        createdByUserId: USER_ID,
      }),
  ]) {
    await assert.rejects(operation(), (error) => {
      assert.deepEqual(response(error), {
        code: 'RESIDENT_CONTEXT_AMBIGUOUS',
        message: 'Multiple active resident contexts are available',
      });
      return true;
    });
  }
});

test('Payment Gateway resident commands derive authority through scoped InvoiceService lookup', async () => {
  const sentinel = new Error('scoped invoice sentinel');
  const calls: Array<{ invoiceId: string; userId: string }> = [];
  const service = new PaymentGatewayService(
    { enabled: true } as never,
    {} as never,
    {
      getForUser: async (invoiceId: string, userId: string) => {
        calls.push({ invoiceId, userId });
        throw sentinel;
      },
    } as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(service.createResidentPaymentSession(RECORD_ID, actor()), sentinel);
  await assert.rejects(service.getResidentPaymentStatus(RECORD_ID, actor()), sentinel);
  assert.deepEqual(calls, [
    { invoiceId: RECORD_ID, userId: USER_ID },
    { invoiceId: RECORD_ID, userId: USER_ID },
  ]);
});

test('mutation proof rejects identity writes, missing membership/property/role predicates, LIMIT 1, and PII', () => {
  const sources = readSources();
  assertSourceContracts(sources);

  for (const mutated of [
    { ...sources, createDto: `${sources.createDto}\nuser_id?: string;\n` },
    {
      ...sources,
      residentRepository: sources.residentRepository.replace(
        'resident_membership.revoked_at IS NULL',
        'true',
      ),
    },
    {
      ...sources,
      residentRepository: sources.residentRepository.replace(
        "resident_role.name = 'resident'",
        'true',
      ),
    },
    {
      ...sources,
      residentRepository: sources.residentRepository.replace(
        'resident_membership.property_id = residents.property_id',
        'true',
      ),
    },
    {
      ...sources,
      residentRepository: sources.residentRepository.replace('LIMIT 2', 'LIMIT 1'),
    },
    {
      ...sources,
      invoiceRepository: sources.invoiceRepository.replaceAll(
        'residentPropertyMembershipSql',
        'decoyResidentResolver',
      ),
    },
    {
      ...sources,
      propertyOwnerController: `${sources.propertyOwnerController}\nconst phone = resident.phone;\n`,
    },
  ]) {
    assert.throws(() => assertSourceContracts(mutated));
  }
});
