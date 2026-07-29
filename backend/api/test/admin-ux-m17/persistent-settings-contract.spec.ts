import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/infrastructure/database/database.service';
import { UpdateNotificationPreferencesDto } from '../../src/modules/notification/dto/update-notification-preferences.dto';
import { UpdatePropertySettingsDto } from '../../src/modules/property/dto/update-property-settings.dto';
import { UpdatePropertyDto } from '../../src/modules/property/dto/update-property.dto';
import { PropertyController } from '../../src/modules/property/property.controller';
import { PropertyModule } from '../../src/modules/property/property.module';
import { PropertyService } from '../../src/modules/property/property.service';
import { PropertyRepository } from '../../src/modules/property/repositories/property.repository';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const root = resolve(__dirname, '../..');
const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const TARGET_USER = '44444444-4444-4444-8444-444444444444';
const TX_CLIENT = { name: 'm17-transaction-client' };

const paths = {
  controller: resolve(root, 'src/modules/property/property.controller.ts'),
  service: resolve(root, 'src/modules/property/property.service.ts'),
  repository: resolve(root, 'src/modules/property/repositories/property.repository.ts'),
  notificationController: resolve(
    root,
    'src/modules/notification/controllers/my-notification-preference.controller.ts',
  ),
};

type Event = { name: string; client?: unknown; lockForUpdate?: boolean };

for (const field of ['name', 'address', 'phone', 'email', 'timezone']) {
  Reflect.defineMetadata('design:type', String, UpdatePropertyDto.prototype, field);
}
for (const field of ['default_due_day', 'late_fee_percent_per_day', 'booking_fee_amount']) {
  Reflect.defineMetadata('design:type', Number, UpdatePropertySettingsDto.prototype, field);
}
for (const field of ['quiet_hour_start', 'guest_report_deadline']) {
  Reflect.defineMetadata('design:type', String, UpdatePropertySettingsDto.prototype, field);
}
for (const field of ['email_enabled', 'whatsapp_enabled', 'push_enabled', 'digest_mode']) {
  Reflect.defineMetadata('design:type', Boolean, UpdateNotificationPreferencesDto.prototype, field);
}
for (const field of ['quiet_hours_start', 'quiet_hours_end']) {
  Reflect.defineMetadata('design:type', String, UpdateNotificationPreferencesDto.prototype, field);
}

function actor(
  role: 'owner' | 'manager' | 'admin' | 'resident',
  propertyIds: string[] = [PROPERTY_A],
  permissions: string[] = ['property.manage'],
): UserAccessContext {
  return {
    id: ACTOR,
    email: null,
    phone: null,
    displayName: 'M17 Actor',
    roles: [role],
    permissions,
    propertyIds,
    sessionId: 'm17-session',
  };
}

function property() {
  return {
    id: PROPERTY_A,
    name: 'Demo Property',
    address: 'Demo Address',
    phone: null,
    email: null,
    timezone: 'Asia/Jakarta',
    status: 'active' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function settings() {
  return {
    propertyId: PROPERTY_A,
    defaultDueDay: 25,
    lateFeePercentPerDay: '1.00',
    bookingFeeAmount: 100000,
    quietHourStart: '22:00',
    guestReportDeadline: '21:00',
  };
}

function harness(options: { auditFailure?: Error } = {}) {
  const events: Event[] = [];
  const currentProperty = property();
  const currentSettings = settings();
  const repository = {
    transaction: async <T>(operation: (client: unknown) => Promise<T>): Promise<T> => {
      events.push({ name: 'begin', client: TX_CLIENT });
      try {
        const result = await operation(TX_CLIENT);
        events.push({ name: 'commit', client: TX_CLIENT });
        return result;
      } catch (error) {
        events.push({ name: 'rollback', client: TX_CLIENT });
        throw error;
      }
    },
    findById: async (_propertyId: string, client?: unknown, lockForUpdate = false) => {
      events.push({ name: 'find', client, lockForUpdate });
      return currentProperty;
    },
    update: async (_propertyId: string, _dto: unknown, _actorId: string, client?: unknown) => {
      events.push({ name: 'update', client });
      return { ...currentProperty, name: 'Updated Property' };
    },
    getSettings: async (_propertyId: string, client?: unknown) => {
      events.push({ name: 'get-settings', client });
      return currentSettings;
    },
    updateSettings: async (_propertyId: string, _dto: unknown, client?: unknown) => {
      events.push({ name: 'update-settings', client });
      return { ...currentSettings, defaultDueDay: 10 };
    },
    assignPropertyOwner: async (
      _propertyId: string,
      _userId: string,
      _label: string | null,
      _actorId: string,
      client?: unknown,
    ) => {
      events.push({ name: 'assign-owner', client });
    },
    revokePropertyOwner: async (_propertyId: string, _userId: string, client?: unknown) => {
      events.push({ name: 'revoke-owner', client });
    },
    isPropertyOwner: async () => false,
  };
  const audit = {
    write: async (_input: unknown, client?: unknown) => {
      events.push({ name: 'audit', client });
      if (options.auditFailure) throw options.auditFailure;
    },
  };
  return {
    events,
    service: new PropertyService(repository as never, audit as never),
  };
}

function response(error: unknown): unknown {
  assert.ok(error instanceof HttpException);
  return error.getResponse();
}

async function errorsFor<T extends object>(constructor: new () => T, input: unknown) {
  return validate(plainToInstance(constructor, input, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

function assertServiceWiring(service: string): void {
  for (const method of ['update', 'updateSettings', 'assignOwner', 'revokeOwner']) {
    const methodStart = service.indexOf(`async ${method}(`);
    assert.notEqual(methodStart, -1);
    const nextMethod = service.indexOf('\n  async ', methodStart + 1);
    const methodSource = service.slice(methodStart, nextMethod === -1 ? undefined : nextMethod);
    const authorization = methodSource.indexOf('assertCanManageProperty');
    const transaction = methodSource.indexOf('transaction(');
    const lockedLookup = methodSource.indexOf('requireProperty(propertyId, client, true)');
    const audit = methodSource.indexOf('audit.write');
    assert.ok(authorization >= 0 && authorization < transaction);
    assert.ok(transaction >= 0 && transaction < lockedLookup && lockedLookup < audit);
    assert.match(methodSource.slice(audit), /audit\.write\([\s\S]*?,\s*client,\s*\)/);
  }
}

function assertRepositoryTransaction(repository: string): void {
  assert.match(
    repository,
    /transaction<T>\(operation: \(client: PoolClient\) => Promise<T>\): Promise<T> \{\s*return this\.database\.transaction\(operation\);\s*\}/,
  );
}

test('controller freezes compatible reads and owner|manager property.manage writes', () => {
  assert.ok(
    (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PropertyModule) as unknown[]).includes(
      PropertyController,
    ),
  );
  assert.ok(
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]).includes(PropertyModule),
  );

  const reflector = new Reflector();
  for (const method of ['get', 'getSettings'] as const) {
    assert.deepEqual(
      reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        PropertyController.prototype[method],
        PropertyController,
      ]),
      ['property.read'],
    );
  }
  for (const method of ['update', 'updateSettings', 'assignOwner', 'revokeOwner'] as const) {
    assert.deepEqual(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        PropertyController.prototype[method],
        PropertyController,
      ]),
      ['owner', 'manager'],
    );
    assert.deepEqual(
      reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        PropertyController.prototype[method],
        PropertyController,
      ]),
      ['property.manage'],
    );
  }
});

test('assigned manager and global owner mutate profile/settings in one audited transaction', async () => {
  const managerHarness = harness();
  await managerHarness.service.update(
    actor('manager'),
    PROPERTY_A,
    { name: 'Updated Property' },
    {},
  );
  assert.deepEqual(
    managerHarness.events.map((event) => event.name),
    ['begin', 'find', 'update', 'audit', 'commit'],
  );
  assert.ok(
    managerHarness.events
      .filter((event) => !['begin', 'commit'].includes(event.name))
      .every((event) => event.client === TX_CLIENT),
  );
  assert.equal(managerHarness.events.find((event) => event.name === 'find')?.lockForUpdate, true);

  const ownerHarness = harness();
  await ownerHarness.service.updateSettings(
    actor('owner', []),
    PROPERTY_A,
    { default_due_day: 10 },
    {},
  );
  assert.deepEqual(
    ownerHarness.events.map((event) => event.name),
    ['begin', 'find', 'get-settings', 'update-settings', 'audit', 'commit'],
  );
  assert.ok(
    ownerHarness.events
      .filter((event) => !['begin', 'commit'].includes(event.name))
      .every((event) => event.client === TX_CLIENT),
  );
  assert.equal(ownerHarness.events.find((event) => event.name === 'find')?.lockForUpdate, true);
});

test('manager cross-property or empty scope and unauthorized actors fail before lookup/write/audit', async () => {
  for (const deniedActor of [
    actor('manager', [PROPERTY_B]),
    actor('manager', []),
    actor('admin'),
    actor('resident'),
    actor('manager', [PROPERTY_A], []),
  ]) {
    for (const invoke of [
      (service: PropertyService) => service.update(deniedActor, PROPERTY_A, { name: 'Denied' }, {}),
      (service: PropertyService) =>
        service.updateSettings(deniedActor, PROPERTY_A, { default_due_day: 10 }, {}),
      (service: PropertyService) =>
        service.assignOwner(
          deniedActor,
          PROPERTY_A,
          { user_id: TARGET_USER, ownership_label: 'Denied' },
          {},
        ),
      (service: PropertyService) => service.revokeOwner(deniedActor, PROPERTY_A, TARGET_USER, {}),
    ]) {
      const deniedHarness = harness();
      await assert.rejects(invoke(deniedHarness.service), (error) => {
        assert.deepEqual(response(error), {
          code: 'PROPERTY_SCOPE_DENIED',
          message: 'User is not allowed to manage this property',
        });
        return true;
      });
      assert.deepEqual(deniedHarness.events, []);
    }
  }
});

test('assign and revoke stay property-scoped and atomic for manager', async () => {
  for (const [operation, expectedMutation] of [
    [
      (service: PropertyService) =>
        service.assignOwner(
          actor('manager'),
          PROPERTY_A,
          { user_id: TARGET_USER, ownership_label: 'Operational' },
          {},
        ),
      'assign-owner',
    ],
    [
      (service: PropertyService) =>
        service.revokeOwner(actor('manager'), PROPERTY_A, TARGET_USER, {}),
      'revoke-owner',
    ],
  ] as const) {
    const allowedHarness = harness();
    await operation(allowedHarness.service);
    assert.deepEqual(
      allowedHarness.events.map((event) => event.name),
      ['begin', 'find', expectedMutation, 'audit', 'commit'],
    );
    assert.ok(
      allowedHarness.events
        .filter((event) => !['begin', 'commit'].includes(event.name))
        .every((event) => event.client === TX_CLIENT),
    );
    assert.equal(allowedHarness.events.find((event) => event.name === 'find')?.lockForUpdate, true);
  }
});

test('audit failure rolls back property mutation without commit or success fallback', async () => {
  const auditFailure = new Error('audit failed');
  const failedHarness = harness({ auditFailure });
  await assert.rejects(
    failedHarness.service.update(actor('manager'), PROPERTY_A, { name: 'Rolled Back' }, {}),
    (error) => error === auditFailure,
  );
  assert.deepEqual(
    failedHarness.events.map((event) => event.name),
    ['begin', 'find', 'update', 'audit', 'rollback'],
  );
  assert.equal(
    failedHarness.events.some((event) => event.name === 'commit'),
    false,
  );
  assert.ok(
    failedHarness.events
      .filter((event) => !['begin', 'rollback'].includes(event.name))
      .every((event) => event.client === TX_CLIENT),
  );
});

test('database transaction preserves the original operation error when rollback also fails', async () => {
  const operationError = new Error('operation failed');
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
    },
    release: () => calls.push('release'),
  };
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Reflect.set(database, 'pool', {
    connect: async () => client,
  });

  await assert.rejects(
    database.transaction(async () => {
      throw operationError;
    }),
    (error) => error === operationError,
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'release']);
});

test('database transaction commits and releases exactly once after a successful operation', async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => calls.push(sql),
    release: () => calls.push('release'),
  };
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Reflect.set(database, 'pool', { connect: async () => client });

  assert.equal(await database.transaction(async () => 'committed'), 'committed');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'release']);
});

test('property repository keeps transactional reads and writes on the supplied client', async () => {
  const poolQueries: string[] = [];
  const transactionQueries: string[] = [];
  const propertyRow = {
    id: PROPERTY_A,
    name: 'Demo Property',
    address: 'Demo Address',
    phone: null,
    email: null,
    timezone: 'Asia/Jakarta',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };
  const settingsRow = {
    property_id: PROPERTY_A,
    default_due_day: 25,
    late_fee_percent_per_day: '1.00',
    booking_fee_amount: 100000,
    quiet_hour_start: '22:00',
    guest_report_deadline: '21:00',
  };
  const resultFor = (sql: string) => ({
    rows: sql.includes('property_settings')
      ? [settingsRow]
      : sql.includes('properties')
        ? [propertyRow]
        : [],
  });
  const database = {
    client: {
      query: async (sql: string) => {
        poolQueries.push(sql);
        return resultFor(sql);
      },
    },
  };
  const transactionClient = {
    query: async (sql: string) => {
      transactionQueries.push(sql);
      return resultFor(sql);
    },
  };
  const repository = new PropertyRepository(database as never);

  await repository.findById(PROPERTY_A, transactionClient as never, true);
  await repository.update(PROPERTY_A, { name: 'Updated' }, ACTOR, transactionClient as never);
  await repository.getSettings(PROPERTY_A, transactionClient as never);
  await repository.updateSettings(PROPERTY_A, { default_due_day: 10 }, transactionClient as never);
  await repository.assignPropertyOwner(
    PROPERTY_A,
    TARGET_USER,
    'Operational',
    ACTOR,
    transactionClient as never,
  );
  await repository.revokePropertyOwner(PROPERTY_A, TARGET_USER, transactionClient as never);

  assert.deepEqual(poolQueries, []);
  assert.equal(transactionQueries.length, 7);
  assert.match(transactionQueries[0], /WHERE id = \$1[\s\S]*FOR UPDATE/);
});

test('profile DTO trims canonical strings, rejects empty/whitespace/unknown and preserves source validation', async () => {
  const dto = plainToInstance(
    UpdatePropertyDto,
    {
      name: '  Demo Property  ',
      address: '  Demo Address  ',
      phone: '  08123456789  ',
      email: '  demo@example.test  ',
      timezone: '  Asia/Jakarta  ',
    },
    { enableImplicitConversion: true },
  );
  assert.deepEqual(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }), []);
  assert.equal(dto.name, 'Demo Property');
  assert.equal(dto.address, 'Demo Address');
  assert.equal(dto.phone, '08123456789');
  assert.equal(dto.email, 'demo@example.test');
  assert.equal(dto.timezone, 'Asia/Jakarta');
  assert.deepEqual(await errorsFor(UpdatePropertyDto, { name: 'Valid', phone: null }), []);

  for (const invalid of [
    {},
    { phone: null },
    { name: '   ' },
    { address: '   ' },
    { phone: '   ' },
    { email: 'not-an-email' },
    { timezone: '   ' },
    { name: 123 },
    { address: 123 },
    { phone: 123 },
    { email: 123 },
    { timezone: 123 },
    { name: 'Valid', status: 'inactive' },
  ]) {
    assert.notDeepEqual(await errorsFor(UpdatePropertyDto, invalid), []);
  }
});

test('settings DTO accepts exact partial values and rejects empty, coercion, invalid range, and non-HH:mm time', async () => {
  assert.deepEqual(
    await errorsFor(UpdatePropertySettingsDto, {
      default_due_day: 31,
      late_fee_percent_per_day: 99.99,
      booking_fee_amount: 2147483647,
      quiet_hour_start: '22:30',
      guest_report_deadline: '21:00',
    }),
    [],
  );
  assert.deepEqual(
    await errorsFor(UpdatePropertySettingsDto, {
      default_due_day: 10,
      quiet_hour_start: null,
    }),
    [],
  );

  for (const invalid of [
    {},
    { quiet_hour_start: null },
    { default_due_day: '10' },
    { default_due_day: 1.5 },
    { default_due_day: 0 },
    { default_due_day: 32 },
    { late_fee_percent_per_day: '1.00' },
    { late_fee_percent_per_day: Number.NaN },
    { late_fee_percent_per_day: Number.POSITIVE_INFINITY },
    { late_fee_percent_per_day: 1.234 },
    { late_fee_percent_per_day: 1000 },
    { booking_fee_amount: '100000' },
    { booking_fee_amount: 1.5 },
    { booking_fee_amount: -1 },
    { booking_fee_amount: 2147483648 },
    { quiet_hour_start: '22:30:00' },
    { quiet_hour_start: '24:00' },
    { guest_report_deadline: '' },
    { default_due_day: 10, extra: true },
  ]) {
    assert.notDeepEqual(await errorsFor(UpdatePropertySettingsDto, invalid), []);
  }
});

test('personal notification DTO remains user-scoped and rejects truthy coercion or ambiguous time', async () => {
  assert.deepEqual(
    await errorsFor(UpdateNotificationPreferencesDto, {
      email_enabled: false,
      whatsapp_enabled: true,
      push_enabled: false,
      digest_mode: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '06:00',
    }),
    [],
  );
  assert.deepEqual(
    await errorsFor(UpdateNotificationPreferencesDto, {
      email_enabled: true,
      quiet_hours_start: null,
    }),
    [],
  );

  for (const field of ['email_enabled', 'whatsapp_enabled', 'push_enabled', 'digest_mode']) {
    assert.notDeepEqual(
      await errorsFor(UpdateNotificationPreferencesDto, { [field]: 'false' }),
      [],
    );
  }

  for (const invalid of [
    {},
    { quiet_hours_start: null },
    { email_enabled: 'false' },
    { email_enabled: 'true' },
    { email_enabled: '0' },
    { email_enabled: '1' },
    { email_enabled: 0 },
    { email_enabled: 1 },
    { email_enabled: '' },
    { email_enabled: 'yes' },
    { email_enabled: {} },
    { email_enabled: [] },
    { quiet_hours_start: '22:00:00' },
    { quiet_hours_end: '6:00' },
    { property_id: PROPERTY_A },
  ]) {
    assert.notDeepEqual(await errorsFor(UpdateNotificationPreferencesDto, invalid), []);
  }

  const notificationController = readFileSync(paths.notificationController, 'utf8');
  assert.match(notificationController, /@Controller\('my\/notification-preferences'\)/);
  assert.match(notificationController, /this\.preferences\.update\(\s*user\.id,/);
  assert.doesNotMatch(notificationController, /property[_A-Z]?id/i);
});

test('source wiring freezes authorization-before-transaction and transaction-client propagation', () => {
  const controller = readFileSync(paths.controller, 'utf8');
  const service = readFileSync(paths.service, 'utf8');
  const repository = readFileSync(paths.repository, 'utf8');

  assertServiceWiring(service);
  assert.match(controller, /@Patch\(':propertyId'\)[\s\S]*?@RequireRoles\('owner', 'manager'\)/);
  assert.match(
    controller,
    /@Patch\(':propertyId\/settings'\)[\s\S]*?@RequireRoles\('owner', 'manager'\)/,
  );
  assertRepositoryTransaction(repository);

  assert.throws(() =>
    assertServiceWiring(service.replace('this.assertCanManageProperty(user, propertyId);', '')),
  );
  assert.throws(() =>
    assertServiceWiring(
      service.replace(
        'this.assertCanManageProperty(user, propertyId);\n    return this.properties.transaction(async (client) => {',
        'return this.properties.transaction(async (client) => {\n      this.assertCanManageProperty(user, propertyId);',
      ),
    ),
  );
  assert.throws(() =>
    assertRepositoryTransaction(
      repository.replace(
        'return this.database.transaction(operation);',
        'return operation(this.database.client as never);',
      ),
    ),
  );
  assert.throws(() =>
    assertServiceWiring(
      service.replaceAll('await this.audit.write(', 'await this.auditAfterCommit('),
    ),
  );
});
