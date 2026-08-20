import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListNotificationCenterQueryDto } from '../dto/list-notification-center-query.dto';
import { AdminNotificationCenterService } from '../services/admin-notification-center.service';
import { auditContext } from './notification-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('notification.manage')
@Controller('admin/notifications/center')
export class AdminNotificationCenterController {
  constructor(private readonly notifications: AdminNotificationCenterService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListNotificationCenterQueryDto) {
    return this.notifications.list(user, query);
  }

  @Get('unread-count')
  unreadCount(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
  ) {
    return this.notifications.unreadCount(user, propertyId);
  }

  @Post('read-all')
  markAllRead(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.markAllRead(
      user,
      propertyId,
      idempotencyKey,
      auditContext(user, request),
    );
  }

  @Post(':notificationId/read')
  markRead(
    @CurrentUser() user: UserAccessContext,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.markRead(
      user,
      propertyId,
      notificationId,
      idempotencyKey,
      auditContext(user, request),
    );
  }

  @Post(':notificationId/archive')
  archive(
    @CurrentUser() user: UserAccessContext,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Query('property_id', new ParseUUIDPipe()) propertyId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.archive(
      user,
      propertyId,
      notificationId,
      idempotencyKey,
      auditContext(user, request),
    );
  }
}
