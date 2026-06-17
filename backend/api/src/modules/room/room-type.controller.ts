import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { RoomService } from './room.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('room-types')
export class RoomTypeController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext) {
    return this.rooms.listRoomTypes(user);
  }

  @Post()
  @RequireRoles('owner', 'manager')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateRoomTypeDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.createRoomType(user, dto, this.contextFromRequest(request));
  }

  @Patch(':roomTypeId')
  @RequireRoles('owner', 'manager')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: UpdateRoomTypeDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.updateRoomType(user, roomTypeId, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
