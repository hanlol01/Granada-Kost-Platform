import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListAccountNotificationCenterQueryDto } from '../dto/list-account-notification-center-query.dto';
import { AccountNotificationCenterService } from '../services/account-notification-center.service';
import { auditContext } from './notification-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin', 'resident', 'property_owner')
@Controller('my/notification-center')
export class AccountNotificationCenterController {
  constructor(private readonly notifications: AccountNotificationCenterService) {}
  @Get()
  list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListAccountNotificationCenterQueryDto,
  ) {
    return this.notifications.list(user, query);
  }
  @Get('unread-count')
  count(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListAccountNotificationCenterQueryDto,
  ) {
    return this.notifications.unreadCount(user, query.property_id);
  }
  @Post('read-all')
  readAll(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListAccountNotificationCenterQueryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.change(
      user,
      query.property_id,
      'read-all',
      undefined,
      auditContext(user, request),
    );
  }
  @Post('archive-read')
  archiveRead(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListAccountNotificationCenterQueryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.change(
      user,
      query.property_id,
      'archive-read',
      undefined,
      auditContext(user, request),
    );
  }
  @Patch(':id/read')
  read(
    @CurrentUser() user: UserAccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListAccountNotificationCenterQueryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.change(
      user,
      query.property_id,
      'read',
      id,
      auditContext(user, request),
    );
  }
  @Patch(':id/archive')
  archive(
    @CurrentUser() user: UserAccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListAccountNotificationCenterQueryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.notifications.change(
      user,
      query.property_id,
      'archive',
      id,
      auditContext(user, request),
    );
  }
}
