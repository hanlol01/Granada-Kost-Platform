import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListNotificationCenterQueryDto } from '../dto/list-notification-center-query.dto';
import { AccountNotificationCenterService } from '../services/account-notification-center.service';
import { toLegacyNotification } from './account-notification-response.util';
import { auditContext } from './notification-controller.util';

// Compatibility routes share the account-scoped inbox; no property-wide row mutation remains reachable.
@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('notification.manage')
@Controller('admin/notifications/center')
export class AdminNotificationCenterController {
  constructor(private readonly notifications: AccountNotificationCenterService) {}
  @Get()
  async list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListNotificationCenterQueryDto,
  ) {
    const response = await this.notifications.list(user, query);
    return {
      data: response.items.map(toLegacyNotification),
      meta: {
        limit: response.limit,
        offset: response.offset,
        total: response.total,
        unread_count: response.unreadCount,
      },
    };
  }
  @Get('unread-count')
  async unreadCount(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
  ) {
    return { unread_count: (await this.notifications.unreadCount(user, propertyId)).unreadCount };
  }
  @Post('read-all')
  async markAllRead(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const result = await this.notifications.change(
      user,
      propertyId,
      'read-all',
      undefined,
      auditContext(user, request),
    );
    return { updated_count: 'updatedCount' in result ? result.updatedCount : 0 };
  }
  @Post(':notificationId/read')
  async markRead(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
    @Param('notificationId', new ParseUUIDPipe()) id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const result = await this.notifications.change(
      user,
      propertyId,
      'read',
      id,
      auditContext(user, request),
    );
    return 'id' in result ? toLegacyNotification(result) : result;
  }
  @Post(':notificationId/archive')
  async archive(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
    @Param('notificationId', new ParseUUIDPipe()) id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const result = await this.notifications.change(
      user,
      propertyId,
      'archive',
      id,
      auditContext(user, request),
    );
    return 'id' in result ? toLegacyNotification(result) : result;
  }
}
