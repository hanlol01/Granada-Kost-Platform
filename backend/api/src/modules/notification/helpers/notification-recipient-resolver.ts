import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { NotificationRecipientContext } from '../types/notification.types';

@Injectable()
export class NotificationRecipientResolver {
  constructor(private readonly database: DatabaseService) {}

  async resolveUsers(userIds: string[], propertyId: string): Promise<NotificationRecipientContext[]> {
    if (!userIds.length) {
      return [];
    }

    const result = await this.database.client.query<{
      id: string;
      email: string | null;
      phone: string | null;
      user_status: NotificationRecipientContext['userStatus'];
    }>(
      `SELECT id, email, phone, user_status
       FROM users
       WHERE id = ANY($1::uuid[])`,
      [userIds],
    );

    return result.rows.map((row) => ({
      userId: row.id,
      propertyId,
      email: row.email,
      phone: row.phone,
      userStatus: row.user_status,
    }));
  }
}
