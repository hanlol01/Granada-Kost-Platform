import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListMyNotificationsQueryDto } from '../dto/list-my-notifications-query.dto';
import { NotificationService } from '../services/notification.service';
import { auditContext, toNotificationResponse } from './notification-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin', 'technician', 'resident', 'property_owner')
@Controller('my/notifications')
export class MyNotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListMyNotificationsQueryDto) {
    const records = await this.notifications.listForUser(user.id, query.status, query.limit, query.offset);
    return records.map((record) => toNotificationResponse(record));
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: UserAccessContext) {
    return { unread_count: await this.notifications.unreadCountForUser(user.id) };
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: UserAccessContext, @Req() request: RequestWithCorrelationId) {
    return this.notifications.markAllReadForUser(user.id, auditContext(user, request));
  }

  @Post(':notificationId/read')
  async markRead(
    @CurrentUser() user: UserAccessContext,
    @Param('notificationId') notificationId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const record = await this.notifications.markRead(notificationId, user.id, auditContext(user, request));
    return toNotificationResponse(record);
  }

  @Post(':notificationId/archive')
  async archive(
    @CurrentUser() user: UserAccessContext,
    @Param('notificationId') notificationId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const record = await this.notifications.archive(notificationId, user.id, auditContext(user, request));
    return toNotificationResponse(record);
  }
}
