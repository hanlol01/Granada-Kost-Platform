import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminNotificationCenterService } from '../../src/modules/notification/services/admin-notification-center.service';
import { AdminNotificationCenterRepository } from '../../src/modules/notification/repositories/admin-notification-center.repository';
import { NotificationRepository } from '../../src/modules/notification/repositories/notification.repository';
import { toNotificationResponse } from '../../src/modules/notification/controllers/notification-controller.util';

const propertyId = '11111111-1111-4111-8111-111111111111';
const actor = {
  id: '22222222-2222-4222-8222-222222222222',
  email: null,
  phone: null,
  displayName: 'Admin',
  roles: ['admin'],
  permissions: ['notification.manage'],
  propertyIds: [propertyId],
  sessionId: '33333333-3333-4333-8333-333333333333',
};

const record = {
  id: '44444444-4444-4444-8444-444444444444',
  property_id: propertyId,
  notification_type: 'complaint.created',
  notification_status: 'unread' as const,
  priority: 'high' as const,
  title: 'Komplain baru',
  body: 'Ada komplain baru yang perlu ditinjau.',
  created_at: new Date('2026-08-18T01:00:00.000Z'),
  expires_at: null,
  read_at: null,
};

function service(
  overrides: Record<string, unknown> = {},
  databaseOverrides: Record<string, unknown> = {},
) {
  const repository = {
    listForProperty: async () => ({ records: [record], total: 1, unreadCount: 1 }),
    markRead: async () => record,
    archive: async () => ({ ...record, notification_status: 'archived' as const }),
    markAllReadForProperty: async () => 1,
    ...overrides,
  };
  const properties = { get: async () => ({ id: propertyId }) };
  const audit = { write: async () => undefined };
  const database = {
    transaction: async (operation: (client: unknown) => Promise<unknown>) =>
      operation({
        query: async (sql: string) => {
          if (sql.includes('SELECT command_status')) return { rows: [] };
          return { rows: [], rowCount: 1 };
        },
      }),
    ...databaseOverrides,
  };
  return new AdminNotificationCenterService(
    repository as never,
    properties as never,
    audit as never,
    database as never,
  );
}

test('W08D list exposes safe center fields and a generic allowlisted deep link', async () => {
  const result = await service().list(actor as never, {
    property_id: propertyId,
    status: 'unread',
    limit: 20,
    offset: 0,
  });

  assert.deepEqual(Object.keys(result.data[0]!).sort(), [
    'body',
    'created_at',
    'deep_link',
    'expires_at',
    'id',
    'notification_status',
    'notification_type',
    'priority',
    'read_at',
    'title',
  ]);
  assert.equal(result.data[0]!.deep_link, '/complaints');
  assert.equal(result.data[0]!.id, record.id);
  assert.equal(result.meta.unread_count, 1);
});

test('W08D read and archive mutations are property-scoped and audited', async () => {
  const calls: string[] = [];
  const center = service({
    markRead: async (id: string, scopedPropertyId: string) => {
      calls.push(`read:${id}:${scopedPropertyId}`);
      return record;
    },
    archive: async (id: string, scopedPropertyId: string) => {
      calls.push(`archive:${id}:${scopedPropertyId}`);
      return { ...record, notification_status: 'archived' as const };
    },
  });

  await center.markRead(actor as never, propertyId, record.id, 'w08d-read-key-0001', {
    actorUserId: actor.id,
  });
  await center.archive(actor as never, propertyId, record.id, 'w08d-archive-key-0001', {
    actorUserId: actor.id,
  });
  assert.deepEqual(calls, [
    `read:${record.id}:${propertyId}`,
    `archive:${record.id}:${propertyId}`,
  ]);
});

test('W08D mark-all-read returns the changed count without exposing records', async () => {
  const center = service({ markAllReadForProperty: async () => 3 });
  const result = await center.markAllRead(actor as never, propertyId, 'w08d-read-all-key-0001', {
    actorUserId: actor.id,
  });
  assert.deepEqual(result, { updated_count: 3 });
});

test('W08D mutation requires an idempotency key before any write', async () => {
  const center = service();
  await assert.rejects(
    center.markRead(actor as never, propertyId, record.id, undefined),
    (error: { response?: { code?: string } }) =>
      error.response?.code === 'IDEMPOTENCY_KEY_REQUIRED',
  );
});

test('W08D mutation writes audit and outbox through the same transaction', async () => {
  const statements: string[] = [];
  const center = service(
    {
      markRead: async () => ({ ...record, notification_status: 'read' as const }),
    },
    {
      transaction: async (operation: (client: unknown) => Promise<unknown>) =>
        operation({
          query: async (sql: string) => {
            statements.push(sql);
            if (sql.includes('SELECT command_status')) return { rows: [] };
            return { rows: [], rowCount: 1 };
          },
        }),
    },
  );
  await center.markRead(actor as never, propertyId, record.id, 'w08d-atomic-key-0001', {
    actorUserId: actor.id,
  });
  assert.ok(statements.some((sql) => sql.includes('idempotency_commands')));
  assert.ok(statements.some((sql) => sql.includes('business_events')));
});

test('W08D excludes expired unread notifications from the Admin badge and bulk action', async () => {
  const statements: string[] = [];
  const database = {
    client: {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('count(*) AS total')) return { rows: [{ total: '0' }] };
        if (sql.includes('count(*) AS unread_count')) return { rows: [{ unread_count: '0' }] };
        return { rows: [], rowCount: 0 };
      },
    },
  };
  const repository = new AdminNotificationCenterRepository(database as never);
  await repository.listForProperty(propertyId, {
    status: 'unread',
    limit: 20,
    offset: 0,
  });
  await repository.markAllReadForProperty(propertyId);
  assert.ok(statements.filter((sql) => sql.includes('expires_at > now()')).length >= 3);
});

test('W08D keeps Penghuni unread counts recipient-scoped and supplies a safe deep link', async () => {
  const statements: string[] = [];
  const database = {
    client: {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('count(*)')) return { rows: [{ unread_count: '0' }] };
        return { rows: [], rowCount: 0 };
      },
    },
  };
  const repository = new NotificationRepository(database as never);
  await repository.listForUser(actor.id, 'unread');
  await repository.unreadCountForUser(actor.id);
  await repository.markAllReadForUser(actor.id);
  assert.ok(statements.every((sql) => sql.includes('recipient_user_id = $1')));
  assert.ok(statements.filter((sql) => sql.includes('expires_at > now()')).length >= 3);

  const response = toNotificationResponse({
    id: record.id,
    propertyId,
    recipientUserId: actor.id,
    notificationType: 'billing.invoice_issued',
    notificationStatus: 'unread',
    priority: 'normal',
    title: record.title,
    body: record.body,
    metadata: null,
    sourceEventType: 'billing.invoice_issued',
    sourceResourceId: null,
    correlationId: null,
    readAt: null,
    expiresAt: null,
    createdAt: record.created_at,
  });
  assert.equal(response.deep_link, '/billing');
});
