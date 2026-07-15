import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListAdminNotificationsQueryDto } from '../dto/list-admin-notifications-query.dto';
import { AdminNotificationService } from '../services/admin-notification.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('notification.manage')
@Controller('admin/notifications')
export class AdminNotificationController {
  constructor(private readonly notifications: AdminNotificationService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListAdminNotificationsQueryDto) {
    return this.notifications.list(user, query);
  }
}
