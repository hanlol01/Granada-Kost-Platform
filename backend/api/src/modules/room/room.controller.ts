import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { UpdateRoomDto, UpdateRoomStatusDto } from './dto/update-room.dto';
import { RoomService } from './room.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('rooms')
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListRoomsQueryDto) {
    return this.rooms.listRooms(user, query);
  }

  @Get('availability')
  @RequirePermissions('room.read')
  availability(@CurrentUser() user: UserAccessContext, @Query('property_id') propertyId?: string) {
    return this.rooms.availability(user, propertyId);
  }

  @Post()
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateRoomDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.createRoom(user, dto, this.contextFromRequest(request));
  }

  @Get(':roomId')
  @RequirePermissions('room.read')
  get(@CurrentUser() user: UserAccessContext, @Param('roomId') roomId: string) {
    return this.rooms.getRoom(user, roomId);
  }

  @Patch(':roomId')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.updateRoom(user, roomId, dto, this.contextFromRequest(request));
  }

  @Patch(':roomId/status')
  @RequirePermissions('room.manage')
  updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomStatusDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.updateRoomStatus(user, roomId, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
