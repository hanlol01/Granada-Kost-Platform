import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { ResidentService } from '../../resident/resident.service';
import { RoomService } from '../../room/room.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateSmartLockRestrictionDto } from '../dto/create-smart-lock-restriction.dto';
import { ListSmartLockRestrictionsQueryDto } from '../dto/list-smart-lock-restrictions-query.dto';
import { CancelRestrictionDto, LiftRestrictionDto, RejectRestrictionDto } from '../dto/restriction-action.dto';
import { SmartLockDeviceService } from '../services/smart-lock-device.service';
import { SmartLockRestrictionService } from '../services/smart-lock-restriction.service';
import { auditContext, scopedPropertyIds, toSmartLockRestrictionResponse } from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('smart-lock/restrictions')
export class SmartLockRestrictionController {
  constructor(
    private readonly restrictions: SmartLockRestrictionService,
    private readonly devices: SmartLockDeviceService,
    private readonly properties: PropertyService,
    private readonly rooms: RoomService,
    private readonly residents: ResidentService,
  ) {}

  @Get()
  @RequirePermissions('smart_lock.read')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListSmartLockRestrictionsQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    return (await this.restrictions.listForProperties(propertyIds, query.status, query.limit, query.offset)).map((restriction) =>
      toSmartLockRestrictionResponse(restriction),
    );
  }

  @Get(':restrictionId')
  @RequirePermissions('smart_lock.read')
  async get(@CurrentUser() user: UserAccessContext, @Param('restrictionId') restrictionId: string) {
    const restriction = await this.restrictions.get(restrictionId);
    await this.properties.assertCanReadProperty(user, restriction.propertyId);
    return toSmartLockRestrictionResponse(restriction);
  }

  @Post()
  @RequirePermissions('smart_lock.manage')
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateSmartLockRestrictionDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const device = await this.devices.get(dto.smart_lock_device_id);
    const room = await this.rooms.getRoom(user, dto.room_id);
    const resident = await this.residents.requireResident(dto.resident_id);
    if (device.propertyId !== dto.property_id || room.propertyId !== dto.property_id || resident.propertyId !== dto.property_id) {
      throw new BadRequestException({ code: 'SMART_LOCK_RESTRICTION_PROPERTY_MISMATCH', message: 'Restriction resources must be in selected property' });
    }
    const restriction = await this.restrictions.requestRestriction(
      {
        propertyId: dto.property_id,
        smartLockDeviceId: dto.smart_lock_device_id,
        roomId: dto.room_id,
        residentId: dto.resident_id,
        reasonType: dto.reason_type,
        reasonDescription: dto.reason_description,
        reasonRefType: dto.reason_ref_type,
        reasonRefId: dto.reason_ref_id,
        requestedByUserId: user.id,
      },
      auditContext(user, request),
    );
    return toSmartLockRestrictionResponse(restriction);
  }

  @Post(':restrictionId/approve')
  @RequirePermissions('smart_lock.manage')
  async approve(@CurrentUser() user: UserAccessContext, @Param('restrictionId') restrictionId: string, @Req() request: RequestWithCorrelationId) {
    const restriction = await this.restrictions.get(restrictionId);
    await this.properties.assertCanReadProperty(user, restriction.propertyId);
    return toSmartLockRestrictionResponse(await this.restrictions.approveRestriction(restriction, user.id, auditContext(user, request)));
  }

  @Post(':restrictionId/reject')
  @RequirePermissions('smart_lock.manage')
  async reject(
    @CurrentUser() user: UserAccessContext,
    @Param('restrictionId') restrictionId: string,
    @Body() dto: RejectRestrictionDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const restriction = await this.restrictions.get(restrictionId);
    await this.properties.assertCanReadProperty(user, restriction.propertyId);
    return toSmartLockRestrictionResponse(await this.restrictions.rejectRestriction(restriction, user.id, dto.reason, auditContext(user, request)));
  }

  @Post(':restrictionId/apply')
  @RequirePermissions('smart_lock.manage')
  async apply(@CurrentUser() user: UserAccessContext, @Param('restrictionId') restrictionId: string, @Req() request: RequestWithCorrelationId) {
    const restriction = await this.restrictions.get(restrictionId);
    await this.properties.assertCanReadProperty(user, restriction.propertyId);
    return toSmartLockRestrictionResponse(await this.restrictions.applyRestriction(restriction, auditContext(user, request)));
  }

  @Post(':restrictionId/lift')
  @RequirePermissions('smart_lock.manage')
  async lift(
    @CurrentUser() user: UserAccessContext,
    @Param('restrictionId') restrictionId: string,
    @Body() dto: LiftRestrictionDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const restriction = await this.restrictions.get(restrictionId);
    await this.properties.assertCanReadProperty(user, restriction.propertyId);
    return toSmartLockRestrictionResponse(await this.restrictions.liftRestriction(restriction, user.id, dto.reason, auditContext(user, request)));
  }

  @Post(':restrictionId/cancel')
  @RequirePermissions('smart_lock.manage')
  async cancel(
    @CurrentUser() user: UserAccessContext,
    @Param('restrictionId') restrictionId: string,
    @Body() dto: CancelRestrictionDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const restriction = await this.restrictions.get(restrictionId);
    await this.properties.assertCanReadProperty(user, restriction.propertyId);
    return toSmartLockRestrictionResponse(await this.restrictions.cancelRestriction(restriction, dto.reason, auditContext(user, request)));
  }
}
