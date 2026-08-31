import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import type { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { ActivityLogService } from './activity-log.service';
import {
  AdminActivityLogActorQueryDto,
  AdminActivityLogDetailQueryDto,
  AdminActivityLogQueryDto,
} from './dto/admin-activity-log-query.dto';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('admin')
@RequirePermissions('activity_log.read')
@Controller('admin/activity-logs')
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: AdminActivityLogQueryDto) {
    return this.activityLog.list(user, query);
  }

  @Get('actors')
  actors(@CurrentUser() user: UserAccessContext, @Query() query: AdminActivityLogActorQueryDto) {
    return this.activityLog.actors(user, query);
  }

  @Get(':activityId')
  detail(
    @CurrentUser() user: UserAccessContext,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Query() query: AdminActivityLogDetailQueryDto,
  ) {
    return this.activityLog.detail(user, query.property_id, activityId);
  }
}
