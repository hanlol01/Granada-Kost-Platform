import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { NotificationPriority, NotificationStatus } from '../types/notification.types';

export type AdminNotificationCenterRow = {
  id: string;
  property_id: string;
  notification_type: string;
  notification_status: NotificationStatus;
  priority: NotificationPriority;
  title: string;
  body: string;
  read_at: Date | null;
  created_at: Date;
  expires_at: Date | null;
};

export type AdminNotificationCenterFilters = {
  status?: NotificationStatus;
  priority?: NotificationPriority;
  notification_type?: string;
  search?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

type CountRow = { total: string };
type UnreadRow = { unread_count: string };

@Injectable()
export class AdminNotificationCenterRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForProperty(
    propertyId: string,
    filters: AdminNotificationCenterFilters,
  ): Promise<{ records: AdminNotificationCenterRow[]; total: number; unreadCount: number }> {
    const values: unknown[] = [propertyId];
    const predicates = ['property_id = $1'];
    this.addFilter(predicates, values, 'notification_status', filters.status);
    this.addFilter(predicates, values, 'priority', filters.priority);
    this.addFilter(predicates, values, 'notification_type', filters.notification_type);
    if (filters.search) {
      values.push(`%${filters.search}%`);
      const parameter = `$${values.length}`;
      predicates.push(`(title ILIKE ${parameter} OR body ILIKE ${parameter})`);
    }
    if (filters.status === 'unread') {
      predicates.push('(expires_at IS NULL OR expires_at > now())');
    }
    if (filters.from) {
      values.push(filters.from);
      predicates.push(`created_at >= $${values.length}::timestamptz`);
    }
    if (filters.to) {
      values.push(filters.to);
      predicates.push(`created_at < ($${values.length}::date + interval '1 day')`);
    }

    const where = predicates.join(' AND ');
    const countValues = [...values];
    const pageValues = [...values, filters.limit, filters.offset];
    const [countResult, unreadResult, pageResult] = await Promise.all([
      this.database.client.query<CountRow>(
        `SELECT count(*) AS total FROM notifications WHERE ${where}`,
        countValues,
      ),
      this.database.client.query<UnreadRow>(
        `SELECT count(*) AS unread_count
         FROM notifications
         WHERE property_id = $1
           AND notification_status = 'unread'
           AND (expires_at IS NULL OR expires_at > now())`,
        [propertyId],
      ),
      this.database.client.query<AdminNotificationCenterRow>(
        `SELECT id, property_id, notification_type, notification_status, priority,
                title, body, read_at, created_at, expires_at
         FROM notifications
         WHERE ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues,
      ),
    ]);

    return {
      records: pageResult.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
      unreadCount: Number(unreadResult.rows[0]?.unread_count ?? 0),
    };
  }

  async markRead(
    id: string,
    propertyId: string,
    client?: PoolClient,
  ): Promise<AdminNotificationCenterRow | null> {
    const result = await (client ?? this.database.client).query<AdminNotificationCenterRow>(
      `UPDATE notifications
       SET notification_status = 'read', read_at = COALESCE(read_at, now())
       WHERE id = $1 AND property_id = $2
       RETURNING id, property_id, notification_type, notification_status, priority,
                 title, body, read_at, created_at, expires_at`,
      [id, propertyId],
    );
    return result.rows[0] ?? null;
  }

  async archive(
    id: string,
    propertyId: string,
    client?: PoolClient,
  ): Promise<AdminNotificationCenterRow | null> {
    const result = await (client ?? this.database.client).query<AdminNotificationCenterRow>(
      `UPDATE notifications
       SET notification_status = 'archived'
       WHERE id = $1 AND property_id = $2
       RETURNING id, property_id, notification_type, notification_status, priority,
                 title, body, read_at, created_at, expires_at`,
      [id, propertyId],
    );
    return result.rows[0] ?? null;
  }

  async markAllReadForProperty(propertyId: string, client?: PoolClient): Promise<number> {
    const result = await (client ?? this.database.client).query(
      `UPDATE notifications
       SET notification_status = 'read', read_at = COALESCE(read_at, now())
       WHERE property_id = $1
         AND notification_status = 'unread'
         AND (expires_at IS NULL OR expires_at > now())`,
      [propertyId],
    );
    return result.rowCount ?? 0;
  }

  private addFilter(
    predicates: string[],
    values: unknown[],
    column: string,
    value: string | undefined,
  ): void {
    if (!value) return;
    values.push(value);
    predicates.push(`${column} = $${values.length}`);
  }
}
