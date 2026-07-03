import { Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { SmartLockAccessGrantService } from '../services/smart-lock-access-grant.service';
import { SmartLockCredentialService } from '../services/smart-lock-credential.service';
import { SmartLockDeviceService } from '../services/smart-lock-device.service';
import { toSmartLockCredentialResponse, toSmartLockDeviceResponse } from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@Controller('my/smart-lock')
export class MySmartLockController {
  constructor(
    private readonly grants: SmartLockAccessGrantService,
    private readonly devices: SmartLockDeviceService,
    private readonly credentials: SmartLockCredentialService,
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
  unlock() {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Resident Smart Lock commands are disabled in M13F',
    });
  }

  @Get('credentials')
  async listCredentials(@CurrentUser() user: UserAccessContext) {
    return (await this.credentials.listForUser(user.id)).map((credential) => toSmartLockCredentialResponse(credential));
  }
}
