import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateSmartLockCredentialDto } from '../dto/create-smart-lock-credential.dto';
import { DisableCredentialDto } from '../dto/credential-action.dto';
import { SmartLockCredentialHelper } from '../helpers/smart-lock-credential.helper';
import { SmartLockPinGenerator } from '../helpers/smart-lock-pin-generator';
import { SmartLockCredentialService } from '../services/smart-lock-credential.service';
import { SmartLockDeviceService } from '../services/smart-lock-device.service';
import { auditContext, toSmartLockCredentialResponse } from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('smart-lock')
export class SmartLockCredentialController {
  constructor(
    private readonly credentials: SmartLockCredentialService,
    private readonly devices: SmartLockDeviceService,
    private readonly properties: PropertyService,
  ) {}

  @Get('devices/:deviceId/credentials')
  @RequirePermissions('smart_lock.read')
  async list(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return (await this.credentials.listForDevice(deviceId)).map((credential) => toSmartLockCredentialResponse(credential));
  }

  @Post('devices/:deviceId/credentials')
  @RequirePermissions('smart_lock.manage')
  async create(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: CreateSmartLockCredentialDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    const generatedPin = dto.credential_type === 'pin' ? SmartLockPinGenerator.generate() : undefined;
    const credential = await this.credentials.createCredential(
      {
        smartLockDeviceId: deviceId,
        accessGrantId: dto.access_grant_id,
        credentialType: dto.credential_type,
        credentialLabel: dto.credential_label,
        pinDisplayHash: generatedPin ? SmartLockCredentialHelper.displayHash(generatedPin) : undefined,
        validFrom: dto.valid_from,
        validUntil: dto.valid_until,
        fingerIndex: dto.finger_index,
        cardNumberMasked: dto.card_number ? SmartLockCredentialHelper.maskCardNumber(dto.card_number) : undefined,
        createdByUserId: user.id,
      },
      auditContext(user, request),
    );
    return toSmartLockCredentialResponse(credential);
  }

  @Post('credentials/:credentialId/disable')
  @RequirePermissions('smart_lock.manage')
  async disable(
    @CurrentUser() user: UserAccessContext,
    @Param('credentialId') credentialId: string,
    @Body() dto: DisableCredentialDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const credential = await this.credentials.get(credentialId);
    const device = await this.devices.get(credential.smartLockDeviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockCredentialResponse(await this.credentials.disableCredential(credential, user.id, dto.reason, auditContext(user, request)));
  }

  @Post('credentials/:credentialId/re-enable')
  @RequirePermissions('smart_lock.manage')
  async reEnable(@CurrentUser() user: UserAccessContext, @Param('credentialId') credentialId: string, @Req() request: RequestWithCorrelationId) {
    const credential = await this.credentials.get(credentialId);
    const device = await this.devices.get(credential.smartLockDeviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockCredentialResponse(await this.credentials.reEnableCredential(credential, auditContext(user, request)));
  }

  @Post('credentials/:credentialId/delete')
  @RequirePermissions('smart_lock.manage')
  async delete(@CurrentUser() user: UserAccessContext, @Param('credentialId') credentialId: string, @Req() request: RequestWithCorrelationId) {
    const credential = await this.credentials.get(credentialId);
    const device = await this.devices.get(credential.smartLockDeviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockCredentialResponse(await this.credentials.deleteCredential(credential, auditContext(user, request)));
  }
}
