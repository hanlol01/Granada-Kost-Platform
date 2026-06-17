import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { auditContext } from '../../vehicle/controllers/vehicle-controller.util';
import { AssignParkingSlotDto } from '../dto/assign-parking-slot.dto';
import { CreateParkingSlotDto } from '../dto/create-parking-slot.dto';
import { CreateParkingZoneDto } from '../dto/create-parking-zone.dto';
import { ListParkingSlotsQueryDto } from '../dto/list-parking-slots-query.dto';
import { ListParkingZonesQueryDto } from '../dto/list-parking-zones-query.dto';
import { ParkingService } from '../services/parking.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('parking.manage')
@Controller('parking')
export class ParkingController {
  constructor(
    private readonly parking: ParkingService,
    private readonly properties: PropertyService,
  ) {}

  @Get('zones')
  async listZones(@CurrentUser() user: UserAccessContext, @Query() query: ListParkingZonesQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    return this.parking.listZones(query.property_id, query.active_only);
  }

  @Post('zones')
  async createZone(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateParkingZoneDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.parking.createZone(
      {
        propertyId: dto.property_id,
        zoneCode: dto.zone_code,
        zoneName: dto.zone_name,
        zoneType: dto.zone_type,
        capacity: dto.capacity,
        locationDescription: dto.location_description,
        sortOrder: dto.sort_order,
        createdByUserId: user.id,
      },
      auditContext(user, request),
    );
  }

  @Get('slots')
  async listSlots(@CurrentUser() user: UserAccessContext, @Query() query: ListParkingSlotsQueryDto) {
    const zone = await this.parking.getZone(query.zone_id);
    await this.properties.assertCanReadProperty(user, zone.propertyId);
    return this.parking.listSlots(query.zone_id, query.status);
  }

  @Post('slots')
  async createSlot(@CurrentUser() user: UserAccessContext, @Body() dto: CreateParkingSlotDto) {
    const zone = await this.parking.getZone(dto.zone_id);
    await this.properties.assertCanReadProperty(user, zone.propertyId);
    return this.parking.createSlot({
      zoneId: dto.zone_id,
      slotNumber: dto.slot_number,
      slotType: dto.slot_type,
    });
  }

  @Post('slots/:slotId/assign')
  async assignSlot(
    @CurrentUser() user: UserAccessContext,
    @Param('slotId') slotId: string,
    @Body() dto: AssignParkingSlotDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const slot = await this.parking.getSlot(slotId);
    const zone = await this.parking.getZone(slot.zoneId);
    await this.properties.assertCanReadProperty(user, zone.propertyId);
    return this.parking.assignSlot(slotId, dto.vehicle_id, auditContext(user, request));
  }

  @Post('slots/:slotId/release')
  async releaseSlot(
    @CurrentUser() user: UserAccessContext,
    @Param('slotId') slotId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const slot = await this.parking.getSlot(slotId);
    const zone = await this.parking.getZone(slot.zoneId);
    await this.properties.assertCanReadProperty(user, zone.propertyId);
    return this.parking.releaseSlot(slotId, auditContext(user, request));
  }
}
