import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListSmartLockAccessLogsQueryDto } from '../dto/list-smart-lock-access-logs-query.dto';
import { ListSmartLockAlertsQueryDto } from '../dto/list-smart-lock-alerts-query.dto';
import { SmartLockAccessLogRepository } from '../repositories/smart-lock-access-log.repository';
import { SmartLockAlertService } from '../services/smart-lock-alert.service';
import { auditContext, scopedPropertyIds, toSmartLockAccessLogResponse, toSmartLockAlertResponse } from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('smart_lock.read')
@Controller('smart-lock')
export class SmartLockLogAlertController {
  constructor(
    private readonly accessLogs: SmartLockAccessLogRepository,
    private readonly alerts: SmartLockAlertService,
    private readonly properties: PropertyService,
  ) {}

  @Get('access-logs')
  async listAccessLogs(@CurrentUser() user: UserAccessContext, @Query() query: ListSmartLockAccessLogsQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    return (await this.accessLogs.listForProperties(propertyIds, query.action_type, query.limit, query.offset)).map((log) =>
      toSmartLockAccessLogResponse(log),
    );
  }

  @Get('alerts')
  async listAlerts(@CurrentUser() user: UserAccessContext, @Query() query: ListSmartLockAlertsQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    return (await this.alerts.listForProperties(propertyIds, query.status, query.limit, query.offset)).map((alert) =>
      toSmartLockAlertResponse(alert),
    );
  }

  @Post('alerts/:alertId/acknowledge')
  @RequirePermissions('smart_lock.manage')
  async acknowledge(@CurrentUser() user: UserAccessContext, @Param('alertId') alertId: string, @Req() request: RequestWithCorrelationId) {
    const alert = await this.alerts.get(alertId);
    await this.properties.assertCanReadProperty(user, alert.propertyId);
    return toSmartLockAlertResponse((await this.alerts.acknowledge(alertId, user.id, auditContext(user, request))) ?? alert);
  }

  @Post('alerts/:alertId/resolve')
  @RequirePermissions('smart_lock.manage')
  async resolve(@CurrentUser() user: UserAccessContext, @Param('alertId') alertId: string, @Req() request: RequestWithCorrelationId) {
    const alert = await this.alerts.get(alertId);
    await this.properties.assertCanReadProperty(user, alert.propertyId);
    return toSmartLockAlertResponse((await this.alerts.resolve(alertId, user.id, auditContext(user, request))) ?? alert);
  }
}
