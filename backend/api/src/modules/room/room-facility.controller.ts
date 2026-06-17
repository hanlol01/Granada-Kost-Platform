import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateRoomFacilityDto } from './dto/create-room-facility.dto';
import { RoomService } from './room.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('room-facilities')
export class RoomFacilityController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext) {
    return this.rooms.listFacilities(user);
  }

  @Post()
  @RequireRoles('owner', 'manager')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateRoomFacilityDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.createFacility(user, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
