import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateNotificationInput,
  NotificationRecord,
  NotificationSettingsRecord,
  NotificationStatus,
} from '../types/notification.types';

type NotificationRow = {
  id: string;
  property_id: string;
  recipient_user_id: string;
  notification_type: string;
  notification_status: NotificationStatus;
  priority: NotificationRecord['priority'];
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  source_event_type: string | null;
  source_resource_id: string | null;
  correlation_id: string | null;
  read_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const result = await this.database.client.query<NotificationRow>(
      `INSERT INTO notifications (
         property_id, recipient_user_id, notification_type, priority, title, body,
         metadata, source_event_type, source_resource_id, correlation_id, expires_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, $8, $9, $10,
         CASE WHEN $11::integer IS NULL THEN now() + interval '90 days' ELSE now() + ($11::integer * interval '1 day') END
       )
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.recipientUserId,
        input.notificationType,
        input.priority,
        input.title,
        input.body,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
        input.sourceEventType ?? null,
        input.sourceResourceId ?? null,
        input.correlationId ?? null,
        input.retentionDays ?? null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const result = await this.database.client.query<NotificationRow>(
      `SELECT ${this.columns()}
       FROM notifications
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async listForUser(userId: string, status?: NotificationStatus, limit = 20, offset = 0): Promise<NotificationRecord[]> {
    const result = await this.database.client.query<NotificationRow>(
      `SELECT ${this.columns()}
       FROM notifications
       WHERE recipient_user_id = $1
         AND ($2::text IS NULL OR notification_status = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async unreadCountForUser(userId: string): Promise<number> {
    const result = await this.database.client.query<{ unread_count: string }>(
      `SELECT count(*) AS unread_count
       FROM notifications
       WHERE recipient_user_id = $1
         AND notification_status = 'unread'`,
      [userId],
    );
    return Number(result.rows[0].unread_count);
  }

  async markAllReadForUser(userId: string): Promise<number> {
    const result = await this.database.client.query<{ id: string }>(
      `UPDATE notifications
       SET notification_status = 'read',
           read_at = COALESCE(read_at, now())
       WHERE recipient_user_id = $1
         AND notification_status = 'unread'
       RETURNING id`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  async markRead(id: string, recipientUserId?: string): Promise<NotificationRecord | null> {
    const result = await this.database.client.query<NotificationRow>(
      `UPDATE notifications
       SET notification_status = 'read',
           read_at = COALESCE(read_at, now())
       WHERE id = $1
         AND ($2::uuid IS NULL OR recipient_user_id = $2)
       RETURNING ${this.columns()}`,
      [id, recipientUserId ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async archive(id: string, recipientUserId?: string): Promise<NotificationRecord | null> {
    const result = await this.database.client.query<NotificationRow>(
      `UPDATE notifications
       SET notification_status = 'archived'
       WHERE id = $1
         AND ($2::uuid IS NULL OR recipient_user_id = $2)
       RETURNING ${this.columns()}`,
      [id, recipientUserId ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async settings(propertyId: string): Promise<NotificationSettingsRecord | null> {
    const result = await this.database.client.query<{
      property_id: string;
      notification_email_enabled: boolean;
      notification_whatsapp_enabled: boolean;
      notification_push_enabled: boolean;
      notification_digest_enabled: boolean;
      notification_digest_hour: number;
      notification_retention_days: number;
    }>(
      `SELECT property_id,
              notification_email_enabled,
              notification_whatsapp_enabled,
              notification_push_enabled,
              notification_digest_enabled,
              notification_digest_hour,
              notification_retention_days
       FROM property_settings
       WHERE property_id = $1`,
      [propertyId],
    );
    const row = result.rows[0];
    return row
      ? {
          propertyId: row.property_id,
          emailEnabled: row.notification_email_enabled,
          whatsappEnabled: row.notification_whatsapp_enabled,
          pushEnabled: row.notification_push_enabled,
          digestEnabled: row.notification_digest_enabled,
          digestHour: row.notification_digest_hour,
          retentionDays: row.notification_retention_days,
        }
      : null;
  }

  private columns(): string {
    return `id, property_id, recipient_user_id, notification_type, notification_status, priority, title, body,
            metadata, source_event_type, source_resource_id, correlation_id, read_at, expires_at, created_at`;
  }

  private map(row: NotificationRow): NotificationRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      recipientUserId: row.recipient_user_id,
      notificationType: row.notification_type,
      notificationStatus: row.notification_status,
      priority: row.priority,
      title: row.title,
      body: row.body,
      metadata: row.metadata,
      sourceEventType: row.source_event_type,
      sourceResourceId: row.source_resource_id,
      correlationId: row.correlation_id,
      readAt: row.read_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
