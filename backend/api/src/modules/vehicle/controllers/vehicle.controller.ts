import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { ResidentService } from '../../resident/resident.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { ListVehiclesQueryDto } from '../dto/list-vehicles-query.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { VehicleReasonDto } from '../dto/vehicle-reason.dto';
import { VehicleService } from '../services/vehicle.service';
import { auditContext, scopedPropertyIds } from './vehicle-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('vehicle.manage')
@Controller('vehicles')
export class VehicleController {
  constructor(
    private readonly vehicles: VehicleService,
    private readonly properties: PropertyService,
    private readonly residents: ResidentService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListVehiclesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    if (propertyIds.length === 1) {
      return this.vehicles.list(propertyIds[0], query.status, query.vehicle_type, query.limit, query.offset);
    }
    return this.vehicles.listForProperties(propertyIds, query.status, query.vehicle_type, query.limit, query.offset);
  }

  @Get(':vehicleId')
  async get(@CurrentUser() user: UserAccessContext, @Param('vehicleId') vehicleId: string) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return vehicle;
  }

  @Post()
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateVehicleDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const resident = await this.residents.requireResident(dto.resident_id);
    if (resident.propertyId !== dto.property_id) {
      throw new BadRequestException({ code: 'RESIDENT_PROPERTY_MISMATCH', message: 'Resident is not in selected property' });
    }
    const property = await this.properties.get(user, dto.property_id);
    return this.vehicles.registerVehicle(
      {
        propertyId: dto.property_id,
        residentId: dto.resident_id,
        vehicleCode: dto.vehicle_code ?? (await this.vehicles.generateCode(property.name, property.id)),
        plateNumber: dto.plate_number,
        vehicleType: dto.vehicle_type,
        brand: dto.brand,
        color: dto.color,
        year: dto.year,
        notes: dto.notes,
        snapshotResidentName: resident.fullName,
        createdByUserId: user.id,
        adminCreated: true,
      },
      auditContext(user, request),
    );
  }

  @Patch(':vehicleId')
  async update(
    @CurrentUser() user: UserAccessContext,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return this.vehicles.updateVehicle(vehicleId, this.updateInput(dto), auditContext(user, request));
  }

  @Post(':vehicleId/approve')
  async approve(@CurrentUser() user: UserAccessContext, @Param('vehicleId') vehicleId: string, @Req() request: RequestWithCorrelationId) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return this.vehicles.approve(vehicleId, auditContext(user, request));
  }

  @Post(':vehicleId/reject')
  async reject(
    @CurrentUser() user: UserAccessContext,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: VehicleReasonDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return this.vehicles.reject(vehicleId, dto.reason, auditContext(user, request));
  }

  @Post(':vehicleId/suspend')
  async suspend(
    @CurrentUser() user: UserAccessContext,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: VehicleReasonDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return this.vehicles.suspend(vehicleId, dto.reason, auditContext(user, request));
  }

  @Post(':vehicleId/reactivate')
  async reactivate(
    @CurrentUser() user: UserAccessContext,
    @Param('vehicleId') vehicleId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return this.vehicles.reactivate(vehicleId, auditContext(user, request));
  }

  @Post(':vehicleId/deactivate')
  async deactivate(
    @CurrentUser() user: UserAccessContext,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: VehicleReasonDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const vehicle = await this.vehicles.get(vehicleId);
    await this.properties.assertCanReadProperty(user, vehicle.propertyId);
    return this.vehicles.deactivate(vehicleId, dto.reason, auditContext(user, request));
  }

  private updateInput(dto: UpdateVehicleDto) {
    return {
      plateNumber: dto.plate_number,
      vehicleType: dto.vehicle_type,
      brand: dto.brand,
      color: dto.color,
      year: dto.year,
      notes: dto.notes,
    };
  }
}
