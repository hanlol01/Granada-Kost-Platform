import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { auditContext, toNotificationPreferenceResponse } from './notification-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin', 'technician', 'resident', 'property_owner')
@Controller('my/notification-preferences')
export class MyNotificationPreferenceController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @Get()
  async get(@CurrentUser() user: UserAccessContext) {
    return toNotificationPreferenceResponse(await this.preferences.getForUser(user.id));
  }

  @Patch()
  async update(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: UpdateNotificationPreferencesDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const preference = await this.preferences.update(
      user.id,
      {
        emailEnabled: dto.email_enabled,
        whatsappEnabled: dto.whatsapp_enabled,
        pushEnabled: dto.push_enabled,
        digestMode: dto.digest_mode,
        quietHoursStart: dto.quiet_hours_start,
        quietHoursEnd: dto.quiet_hours_end,
      },
      auditContext(user, request),
    );
    return toNotificationPreferenceResponse(preference);
  }
}
