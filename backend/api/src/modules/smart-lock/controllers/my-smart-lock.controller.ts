import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { SmartLockRateLimitHelper } from '../helpers/smart-lock-rate-limit.helper';
import { SmartLockAccessGrantService } from '../services/smart-lock-access-grant.service';
import { SmartLockCredentialService } from '../services/smart-lock-credential.service';
import { SmartLockDeviceService } from '../services/smart-lock-device.service';
import { auditContext, toSmartLockCredentialResponse, toSmartLockDeviceResponse } from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@Controller('my/smart-lock')
export class MySmartLockController {
  constructor(
    private readonly grants: SmartLockAccessGrantService,
    private readonly devices: SmartLockDeviceService,
    private readonly credentials: SmartLockCredentialService,
    private readonly rateLimit: SmartLockRateLimitHelper,
  ) {}

  @Get()
  async current(@CurrentUser() user: UserAccessContext) {
    const grant = await this.grants.activeGrantForUser(user.id);
    const device = await this.devices.get(grant.smartLockDeviceId);
    return {
      device: toSmartLockDeviceResponse(device, false),
      access_grant: {
        id: grant.id,
        grant_type: grant.grantType,
        grant_status: grant.grantStatus,
        valid_from: grant.validFrom,
        valid_until: grant.validUntil,
      },
    };
  }

  @Post('unlock')
  async unlock(@CurrentUser() user: UserAccessContext, @Req() request: RequestWithCorrelationId) {
    const grant = await this.grants.activeGrantForUser(user.id);
    const rate = await this.rateLimit.consumeCommandAttempt(grant.smartLockDeviceId, user.id);
    if (!rate.allowed) {
      return { accepted: false, result_status: 'denied', reason: 'SMART_LOCK_COMMAND_RATE_LIMITED', remaining: rate.remaining };
    }
    return this.devices.executeCommand(grant.smartLockDeviceId, 'unlock', {
      source: 'resident_app',
      residentId: grant.residentId ?? undefined,
      context: auditContext(user, request),
    });
  }

  @Get('credentials')
  async listCredentials(@CurrentUser() user: UserAccessContext) {
    return (await this.credentials.listForUser(user.id)).map((credential) => toSmartLockCredentialResponse(credential));
  }
}
