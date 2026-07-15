import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ExecutionContext, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminNotificationController } from '../../src/modules/notification/controllers/admin-notification.controller';
import { ListAdminNotificationsQueryDto } from '../../src/modules/notification/dto/list-admin-notifications-query.dto';
import { AdminNotificationRepository } from '../../src/modules/notification/repositories/admin-notification.repository';
import { AdminNotificationService } from '../../src/modules/notification/services/admin-notification.service';
import { PropertyService } from '../../src/modules/property/property.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../src/modules/rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/modules/rbac/guards/rbac.guard';

const propertyId = '11111111-1111-4111-8111-111111111111';

const access = (roles: string[], permissions: string[], propertyIds: string[] = [propertyId]) => ({
  id: '22222222-2222-4222-8222-222222222222',
  email: null,
  phone: null,
  displayName: 'Admin',
  roles,
  permissions,
  propertyIds,
  sessionId: '33333333-3333-4333-8333-333333333333',
});

function guardContext(user: ReturnType<typeof access>): ExecutionContext {
  return {
    getClass: () => AdminNotificationController,
    getHandler: () => AdminNotificationController.prototype.list,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

test('admin notification controller is exact GET-only RBAC surface', () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, AdminNotificationController),
    'admin/notifications',
  );
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AdminNotificationController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, AdminNotificationController), [
    'notification.manage',
  ]);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminNotificationController), [
    JwtAuthGuard,
    RbacGuard,
  ]);
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, AdminNotificationController.prototype.list),
    RequestMethod.GET,
  );

  const guard = new RbacGuard(new Reflector());
  for (const role of ['owner', 'manager', 'admin']) {
    assert.equal(guard.canActivate(guardContext(access([role], ['notification.manage']))), true);
  }
  for (const role of ['property_owner', 'technician', 'resident']) {
    assert.throws(() => guard.canActivate(guardContext(access([role], ['notification.manage']))));
  }
  assert.throws(() => guard.canActivate(guardContext(access(['admin'], []))));
});

test('admin notification query validates closed filters and pagination defaults', async () => {
  const defaults = plainToInstance(ListAdminNotificationsQueryDto, { property_id: propertyId });
  assert.equal((await validate(defaults)).length, 0);
  assert.equal(defaults.limit, 20);
  assert.equal(defaults.offset, 0);

  for (const input of [
    { property_id: 'not-a-uuid' },
    { property_id: propertyId, status: 'pending' },
    { property_id: propertyId, limit: 0 },
    { property_id: propertyId, limit: 101 },
    { property_id: propertyId, offset: -1 },
  ]) {
    const dto = plainToInstance(ListAdminNotificationsQueryDto, input);
    assert.notEqual((await validate(dto)).length, 0);
  }
});

test('service rejects missing property before dependencies', async () => {
  let propertyCalls = 0;
  let notificationCalls = 0;
  const service = new AdminNotificationService(
    {
      listForProperty: async () => {
        notificationCalls += 1;
        return { records: [], total: 0 };
      },
    } as never,
    {
      get: async () => {
        propertyCalls += 1;
      },
    } as never,
  );

  await assert.rejects(service.list(access(['admin'], ['notification.manage']), {}), (error) => {
    assert.ok(error instanceof BadRequestException);
    assert.deepEqual(error.getResponse(), {
      code: 'PROPERTY_ID_REQUIRED',
      message: 'property_id is required',
    });
    return true;
  });
  assert.equal(propertyCalls, 0);
  assert.equal(notificationCalls, 0);
});

test('property scope is checked before existence and notification queries', async () => {
  let findCalls = 0;
  let notificationCalls = 0;
  const properties = new PropertyService(
    {
      findById: async () => {
        findCalls += 1;
        return null;
      },
      isPropertyOwner: async () => false,
    } as never,
    {} as never,
  );
  const service = new AdminNotificationService(
    {
      listForProperty: async () => {
        notificationCalls += 1;
        return { records: [], total: 0 };
      },
    } as never,
    properties,
  );

  await assert.rejects(
    service.list(access(['manager'], ['notification.manage'], []), { property_id: propertyId }),
    (error: { getResponse?: () => unknown }) => {
      assert.deepEqual(error.getResponse?.(), {
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'User is not allowed to access this property',
      });
      return true;
    },
  );
  assert.equal(findCalls, 0);
  assert.equal(notificationCalls, 0);

  await assert.rejects(
    service.list(access(['manager'], ['notification.manage']), { property_id: propertyId }),
    (error: { getResponse?: () => unknown }) => {
      assert.deepEqual(error.getResponse?.(), {
        code: 'PROPERTY_NOT_FOUND',
        message: 'Property not found',
      });
      return true;
    },
  );
  assert.equal(findCalls, 1);
  assert.equal(notificationCalls, 0);
});

test('repository uses one count and one six-column stable page query', async () => {
  const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const repository = new AdminNotificationRepository({
    client: {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (/count\(\*\)/i.test(sql)) return { rows: [{ total: '3' }] };
        return { rows: [] };
      },
    },
  } as never);

  const result = await repository.listForProperty(propertyId, 'unread', 20, 40);
  assert.equal(result.total, 3);
  assert.equal(calls.length, 2);
  const count = calls.find((call) => /count\(\*\)/i.test(call.sql));
  const page = calls.find((call) => /SELECT id, notification_type/i.test(call.sql));
  assert.ok(count);
  assert.ok(page);
  assert.deepEqual(count.values, [propertyId, 'unread']);
  assert.deepEqual(page.values, [propertyId, 'unread', 20, 40]);
  assert.match(page.sql, /ORDER BY created_at DESC, id DESC/);
  assert.doesNotMatch(page.sql, /JOIN|recipient|title|body|metadata|delivery|lease|resident|file/i);
  assert.match(
    page.sql.replace(/\s+/g, ' '),
    /SELECT id, notification_type, notification_status, priority, created_at, expires_at FROM notifications/,
  );
});

test('service returns exact whitelist and normalizes unknown type before response', async () => {
  const rawUnknown = 'custom.secret_type';
  const service = new AdminNotificationService(
    {
      listForProperty: async () => ({
        records: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            notification_type: rawUnknown,
            notification_status: 'unread',
            priority: 'normal',
            created_at: new Date('2026-07-15T00:00:00.000Z'),
            expires_at: null,
            title: 'forbidden-title',
            metadata: { secret: true },
          },
        ],
        total: 1,
      }),
    } as never,
    { get: async () => ({ id: propertyId }) } as never,
  );

  const response = await service.list(access(['owner'], ['notification.manage'], []), {
    property_id: propertyId,
    status: 'unread',
    limit: 20,
    offset: 0,
  });
  assert.deepEqual(Object.keys(response).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(response.data[0]).sort(), [
    'created_at',
    'expires_at',
    'id',
    'notification_status',
    'notification_type',
    'priority',
  ]);
  assert.deepEqual(response.meta, { limit: 20, offset: 0, total: 1 });
  assert.equal(response.data[0].notification_type, 'other');
  assert.equal(response.data[0].created_at, '2026-07-15T00:00:00.000Z');
  assert.equal(response.data[0].expires_at, null);
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(
    serialized,
    /custom\.secret_type|forbidden-title|metadata|property_id|recipient/i,
  );
});
