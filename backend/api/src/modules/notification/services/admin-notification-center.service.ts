import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import type { PoolClient } from 'pg';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { NOTIFICATION_TYPES } from '../constants/notification.constants';
import {
  AdminNotificationCenterFilters,
  AdminNotificationCenterRepository,
  AdminNotificationCenterRow,
} from '../repositories/admin-notification-center.repository';
import { NotificationPriority, NotificationStatus } from '../types/notification.types';

type AuditContext = {
  actorUserId?: string;
  propertyId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type ListQuery = Omit<AdminNotificationCenterFilters, 'limit' | 'offset'> & {
  property_id: string;
  limit?: number;
  offset?: number;
};

@Injectable()
export class AdminNotificationCenterService {
  constructor(
    private readonly notifications: AdminNotificationCenterRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly database: DatabaseService,
  ) {}

  async list(user: UserAccessContext, query: ListQuery) {
    await this.assertProperty(user, query.property_id);
    const filters: AdminNotificationCenterFilters = {
      ...query,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
    const result = await this.notifications.listForProperty(query.property_id, filters);
    return {
      data: result.records.map((record) => this.toResponse(record)),
      meta: {
        limit: filters.limit,
        offset: filters.offset,
        total: result.total,
        unread_count: result.unreadCount,
      },
    };
  }

  async unreadCount(
    user: UserAccessContext,
    propertyId: string,
  ): Promise<{ unread_count: number }> {
    await this.assertProperty(user, propertyId);
    const result = await this.notifications.listForProperty(propertyId, {
      limit: 1,
      offset: 0,
    });
    return { unread_count: result.unreadCount };
  }

  async markRead(
    user: UserAccessContext,
    propertyId: string,
    id: string,
    idempotencyKey: string | undefined,
    context?: AuditContext,
  ) {
    await this.assertProperty(user, propertyId);
    return this.runIdempotentMutation(
      user,
      propertyId,
      `POST:/admin/notifications/center/${id}/read`,
      idempotencyKey,
      { notificationId: id, operation: 'read' },
      async (client) => {
        const record = await this.notifications.markRead(id, propertyId, client);
        if (!record)
          throw new NotFoundException({
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found',
          });
        const response = this.toResponse(record);
        await this.writeAudit('notification.read', record, user, context, client);
        await this.writeOutbox(client, {
          propertyId,
          eventKey: `notification.read:${record.id}:${idempotencyKey}`,
          eventType: 'notification.read',
          aggregateType: 'notification',
          aggregateId: record.id,
          actorUserId: user.id,
          correlationId: context?.correlationId,
          payload: { notification_id: record.id, notification_status: record.notification_status },
        });
        return response;
      },
    );
  }

  async archive(
    user: UserAccessContext,
    propertyId: string,
    id: string,
    idempotencyKey: string | undefined,
    context?: AuditContext,
  ) {
    await this.assertProperty(user, propertyId);
    return this.runIdempotentMutation(
      user,
      propertyId,
      `POST:/admin/notifications/center/${id}/archive`,
      idempotencyKey,
      { notificationId: id, operation: 'archive' },
      async (client) => {
        const record = await this.notifications.archive(id, propertyId, client);
        if (!record)
          throw new NotFoundException({
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found',
          });
        const response = this.toResponse(record);
        await this.writeAudit('notification.archive', record, user, context, client);
        await this.writeOutbox(client, {
          propertyId,
          eventKey: `notification.archive:${record.id}:${idempotencyKey}`,
          eventType: 'notification.archive',
          aggregateType: 'notification',
          aggregateId: record.id,
          actorUserId: user.id,
          correlationId: context?.correlationId,
          payload: { notification_id: record.id, notification_status: record.notification_status },
        });
        return response;
      },
    );
  }

  async markAllRead(
    user: UserAccessContext,
    propertyId: string,
    idempotencyKey: string | undefined,
    context?: AuditContext,
  ) {
    await this.assertProperty(user, propertyId);
    return this.runIdempotentMutation(
      user,
      propertyId,
      'POST:/admin/notifications/center/read-all',
      idempotencyKey,
      { operation: 'read-all', propertyId },
      async (client) => {
        const updatedCount = await this.notifications.markAllReadForProperty(propertyId, client);
        await this.audit.write(
          {
            actorUserId: user.id,
            propertyId,
            action: 'notification.read',
            resourceType: 'notification',
            afterData: { scope: 'property', updatedCount },
            resultStatus: 'success',
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
            correlationId: context?.correlationId,
          },
          client,
        );
        await this.writeOutbox(client, {
          propertyId,
          eventKey: `notification.read_all:${propertyId}:${idempotencyKey}`,
          eventType: 'notification.read_all',
          aggregateType: 'notification_scope',
          aggregateId: propertyId,
          actorUserId: user.id,
          correlationId: context?.correlationId,
          payload: { scope: 'property', updated_count: updatedCount },
        });
        return { updated_count: updatedCount };
      },
    );
  }

  private async assertProperty(user: UserAccessContext, propertyId: string): Promise<void> {
    await this.properties.get(user, propertyId);
  }

  private toResponse(record: AdminNotificationCenterRow) {
    return {
      id: record.id,
      notification_type: this.normalizeType(record.notification_type),
      notification_status: record.notification_status,
      priority: record.priority,
      title: record.title,
      body: record.body,
      read_at: record.read_at?.toISOString() ?? null,
      created_at: record.created_at.toISOString(),
      expires_at: record.expires_at?.toISOString() ?? null,
      deep_link: this.deepLink(record.notification_type),
    };
  }

  private normalizeType(value: string): string {
    return Object.values(NOTIFICATION_TYPES).includes(value as never) ? value : 'other';
  }

  private deepLink(type: string): string | null {
    if (type.startsWith('billing.')) return '/payments';
    if (type.startsWith('complaint.')) return '/complaints';
    if (type.startsWith('maintenance.')) return '/complaints?tab=maintenance';
    if (type.startsWith('vehicle.')) return '/vehicles';
    if (type.startsWith('occupancy.')) return '/tenants';
    return null;
  }

  private async writeAudit(
    action: string,
    record: AdminNotificationCenterRow,
    user: UserAccessContext,
    context?: AuditContext,
    client?: PoolClient,
  ) {
    await this.audit.write(
      {
        actorUserId: user.id,
        propertyId: record.property_id,
        action,
        resourceType: 'notification',
        resourceId: record.id,
        resultStatus: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        correlationId: context?.correlationId,
      },
      client,
    );
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private async runIdempotentMutation<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    rawKey: string | undefined,
    fingerprintInput: Record<string, unknown>,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const key = this.requireIdempotencyKey(rawKey);
    const fingerprint = JSON.stringify(fingerprintInput);
    return this.database.transaction(async (client) => {
      const existing = await client.query<{
        command_status: string;
        request_fingerprint: string;
        response_body: unknown;
      }>(
        `SELECT command_status, request_fingerprint, response_body
         FROM idempotency_commands
         WHERE property_id = $1 AND actor_user_id = $2 AND route = $3 AND idempotency_key = $4
         FOR UPDATE`,
        [propertyId, user.id, route, key],
      );
      const previous = existing.rows[0];
      if (previous) {
        if (previous.request_fingerprint !== fingerprint) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was reused with different data',
          });
        }
        if (previous.command_status === 'succeeded' && previous.response_body !== null) {
          return previous.response_body as T;
        }
        throw new ConflictException({
          code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          message: 'The notification action is already being processed',
        });
      }
      await client.query(
        `INSERT INTO idempotency_commands(
           property_id, actor_user_id, route, idempotency_key, request_fingerprint, command_status
         ) VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [propertyId, user.id, route, key, fingerprint],
      );
      const response = await operation(client);
      await client.query(
        `UPDATE idempotency_commands
         SET command_status = 'succeeded', response_status = 200, response_body = $5::jsonb, completed_at = now()
         WHERE property_id = $1 AND actor_user_id = $2 AND route = $3 AND idempotency_key = $4`,
        [propertyId, user.id, route, key, JSON.stringify(response)],
      );
      return response;
    });
  }

  private async writeOutbox(
    client: PoolClient,
    input: {
      propertyId: string;
      eventKey: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      actorUserId: string;
      correlationId?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events(
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
        input.correlationId ?? null,
        input.actorUserId,
      ],
    );
  }
}

export type AdminNotificationCenterQuery = {
  property_id: string;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  notification_type?: string;
  search?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};
