import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { NotificationPriority, NotificationStatus } from '../types/notification.types';

export type AdminNotificationRow = {
  id: string;
  notification_type: string;
  notification_status: NotificationStatus;
  priority: NotificationPriority;
  created_at: Date;
  expires_at: Date | null;
};

type CountRow = {
  total: string;
};

@Injectable()
export class AdminNotificationRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForProperty(
    propertyId: string,
    status: NotificationStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<{ records: AdminNotificationRow[]; total: number }> {
    const values = [propertyId, status ?? null];
    const [countResult, pageResult] = await Promise.all([
      this.database.client.query<CountRow>(
        `SELECT count(*) AS total
         FROM notifications
         WHERE property_id = $1
           AND ($2::text IS NULL OR notification_status = $2)`,
        values,
      ),
      this.database.client.query<AdminNotificationRow>(
        `SELECT id, notification_type, notification_status, priority, created_at, expires_at
         FROM notifications
         WHERE property_id = $1
           AND ($2::text IS NULL OR notification_status = $2)
         ORDER BY created_at DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [...values, limit, offset],
      ),
    ]);

    return {
      records: pageResult.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  }
}
