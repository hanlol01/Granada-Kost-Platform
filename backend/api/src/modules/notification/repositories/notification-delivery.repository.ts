import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateNotificationDeliveryInput,
  NotificationChannel,
  NotificationDeliveryRecord,
  NotificationDeliveryStatus,
  NotificationSkipReason,
} from '../types/notification.types';

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: NotificationDeliveryRecord['channel'];
  provider_name: NotificationDeliveryRecord['providerName'];
  delivery_status: NotificationDeliveryStatus;
  recipient_address: string;
  subject: string | null;
  content_snapshot: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  provider_message_id: string | null;
  skip_reason: NotificationSkipReason | null;
  next_retry_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class NotificationDeliveryRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateNotificationDeliveryInput): Promise<NotificationDeliveryRecord> {
    const result = await this.database.client.query<DeliveryRow>(
      `INSERT INTO notification_deliveries (
         notification_id, channel, provider_name, delivery_status, recipient_address,
         subject, content_snapshot, max_attempts, skip_reason, next_retry_at
       )
       VALUES ($1, $2, $3, COALESCE($4, 'pending'), $5, $6, $7, COALESCE($8, 5), $9, $10)
       RETURNING ${this.columns()}`,
      [
        input.notificationId,
        input.channel,
        input.providerName,
        input.deliveryStatus ?? null,
        input.recipientAddress,
        input.subject ?? null,
        input.contentSnapshot ?? null,
        input.maxAttempts ?? null,
        input.skipReason ?? null,
        input.nextRetryAt ?? null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async findById(id: string): Promise<NotificationDeliveryRecord | null> {
    const result = await this.database.client.query<DeliveryRow>(
      `SELECT ${this.columns()}
       FROM notification_deliveries
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async listForNotification(notificationId: string): Promise<NotificationDeliveryRecord[]> {
    const result = await this.database.client.query<DeliveryRow>(
      `SELECT ${this.columns()}
       FROM notification_deliveries
       WHERE notification_id = $1
       ORDER BY created_at ASC`,
      [notificationId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async list(
    filters: {
      propertyId?: string;
      propertyIds?: string[];
      status?: NotificationDeliveryStatus;
      channel?: NotificationChannel;
      deadLetterOnly?: boolean;
    },
    limit = 20,
    offset = 0,
  ): Promise<NotificationDeliveryRecord[]> {
    const result = await this.database.client.query<DeliveryRow>(
      `SELECT ${this.columns('notification_deliveries')}
      FROM notification_deliveries
       JOIN notifications ON notifications.id = notification_deliveries.notification_id
       WHERE ($1::uuid IS NULL OR notifications.property_id = $1)
         AND ($2::uuid[] IS NULL OR notifications.property_id = ANY($2::uuid[]))
         AND ($3::text IS NULL OR notification_deliveries.delivery_status = $3)
         AND ($4::text IS NULL OR notification_deliveries.channel = $4)
         AND ($5::boolean = false OR notification_deliveries.delivery_status = 'dead_lettered')
       ORDER BY notification_deliveries.created_at DESC
       LIMIT $6 OFFSET $7`,
      [
        filters.propertyId ?? null,
        filters.propertyIds?.length ? filters.propertyIds : null,
        filters.status ?? null,
        filters.channel ?? null,
        filters.deadLetterOnly ?? false,
        limit,
        offset,
      ],
    );
    return result.rows.map((row) => this.map(row));
  }

  async propertyIdForDelivery(id: string): Promise<string | null> {
    const result = await this.database.client.query<{ property_id: string }>(
      `SELECT notifications.property_id
       FROM notification_deliveries
       JOIN notifications ON notifications.id = notification_deliveries.notification_id
       WHERE notification_deliveries.id = $1`,
      [id],
    );
    return result.rows[0]?.property_id ?? null;
  }

  async markSending(id: string): Promise<NotificationDeliveryRecord | null> {
    return this.updateStatus(id, 'sending');
  }

  async markDelivered(id: string, providerMessageId?: string): Promise<NotificationDeliveryRecord | null> {
    const result = await this.database.client.query<DeliveryRow>(
      `UPDATE notification_deliveries
       SET delivery_status = 'delivered',
           provider_message_id = COALESCE($2, provider_message_id),
           delivered_at = COALESCE(delivered_at, now()),
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, providerMessageId ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    nextRetryAt: Date | null,
    deadLettered: boolean,
  ): Promise<NotificationDeliveryRecord | null> {
    const result = await this.database.client.query<DeliveryRow>(
      `UPDATE notification_deliveries
       SET delivery_status = CASE WHEN $5::boolean THEN 'dead_lettered' ELSE 'failed' END,
           attempt_count = attempt_count + 1,
           last_error_code = $2,
           last_error_message = $3,
           next_retry_at = $4,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, errorCode, errorMessage, nextRetryAt, deadLettered],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async markSkipped(id: string, reason: NotificationSkipReason): Promise<NotificationDeliveryRecord | null> {
    const result = await this.database.client.query<DeliveryRow>(
      `UPDATE notification_deliveries
       SET delivery_status = 'skipped',
           skip_reason = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, reason],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private async updateStatus(id: string, status: NotificationDeliveryStatus): Promise<NotificationDeliveryRecord | null> {
    const result = await this.database.client.query<DeliveryRow>(
      `UPDATE notification_deliveries
       SET delivery_status = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}notification_id, ${p}channel, ${p}provider_name, ${p}delivery_status, ${p}recipient_address, ${p}subject,
            ${p}content_snapshot, ${p}attempt_count, ${p}max_attempts, ${p}last_error_code, ${p}last_error_message,
            ${p}provider_message_id, ${p}skip_reason, ${p}next_retry_at, ${p}delivered_at, ${p}created_at, ${p}updated_at`;
  }

  private map(row: DeliveryRow): NotificationDeliveryRecord {
    return {
      id: row.id,
      notificationId: row.notification_id,
      channel: row.channel,
      providerName: row.provider_name,
      deliveryStatus: row.delivery_status,
      recipientAddress: row.recipient_address,
      subject: row.subject,
      contentSnapshot: row.content_snapshot,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      providerMessageId: row.provider_message_id,
      skipReason: row.skip_reason,
      nextRetryAt: row.next_retry_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
