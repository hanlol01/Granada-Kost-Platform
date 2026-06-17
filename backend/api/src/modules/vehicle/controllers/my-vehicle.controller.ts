import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateMyVehicleDto } from '../dto/create-my-vehicle.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { VehicleService } from '../services/vehicle.service';
import { auditContext } from './vehicle-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@Controller('my/vehicles')
export class MyVehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: PaginationQueryDto) {
    return this.vehicles.listForUser(user.id, query.limit, query.offset);
  }

  @Get(':vehicleId')
  get(@CurrentUser() user: UserAccessContext, @Param('vehicleId') vehicleId: string) {
    return this.vehicles.getForUser(vehicleId, user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateMyVehicleDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const active = await this.vehicles.activeResidentContextForUser(user.id);
    return this.vehicles.registerVehicle(
      {
        propertyId: active.propertyId,
        residentId: active.residentId,
        vehicleCode: await this.vehicles.generateCode('Granada Student House', active.propertyId),
        plateNumber: dto.plate_number,
        vehicleType: dto.vehicle_type,
        brand: dto.brand,
        color: dto.color,
        year: dto.year,
        notes: dto.notes,
        snapshotResidentName: active.residentName,
        snapshotRoomNumber: active.roomNumber,
        createdByUserId: user.id,
      },
      auditContext(user, request),
    );
  }

  @Patch(':vehicleId')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.vehicles.updateVehicleForUser(
      vehicleId,
      user.id,
      {
        plateNumber: dto.plate_number,
        vehicleType: dto.vehicle_type,
        brand: dto.brand,
        color: dto.color,
        year: dto.year,
        notes: dto.notes,
      },
      auditContext(user, request),
    );
  }
}
