import { BadRequestException, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { NOTIFICATION_TYPES } from '../constants/notification.constants';
import { ListAdminNotificationsQueryDto } from '../dto/list-admin-notifications-query.dto';
import {
  AdminNotificationRepository,
  AdminNotificationRow,
} from '../repositories/admin-notification.repository';

const ADMIN_NOTIFICATION_TYPES = new Set<string>(Object.values(NOTIFICATION_TYPES));

type AdminNotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES] | 'other';

type AdminNotificationResponse = {
  data: Array<{
    id: string;
    notification_type: AdminNotificationType;
    notification_status: AdminNotificationRow['notification_status'];
    priority: AdminNotificationRow['priority'];
    created_at: string;
    expires_at: string | null;
  }>;
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
};

@Injectable()
export class AdminNotificationService {
  constructor(
    private readonly notifications: AdminNotificationRepository,
    private readonly properties: PropertyService,
  ) {}

  async list(
    user: UserAccessContext,
    query: ListAdminNotificationsQueryDto,
  ): Promise<AdminNotificationResponse> {
    if (!query.property_id) {
      throw new BadRequestException({
        code: 'PROPERTY_ID_REQUIRED',
        message: 'property_id is required',
      });
    }

    await this.properties.get(user, query.property_id);

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const result = await this.notifications.listForProperty(
      query.property_id,
      query.status,
      limit,
      offset,
    );

    return {
      data: result.records.map((record) => ({
        id: record.id,
        notification_type: this.normalizeType(record.notification_type),
        notification_status: record.notification_status,
        priority: record.priority,
        created_at: record.created_at.toISOString(),
        expires_at: record.expires_at?.toISOString() ?? null,
      })),
      meta: {
        limit,
        offset,
        total: result.total,
      },
    };
  }

  private normalizeType(value: string): AdminNotificationType {
    return ADMIN_NOTIFICATION_TYPES.has(value) ? (value as AdminNotificationType) : 'other';
  }
}
