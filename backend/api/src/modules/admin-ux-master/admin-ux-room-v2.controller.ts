import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import {
  CreateRoomV2Dto,
  ListRoomsV2QueryDto,
  UpdateRoomV2Dto,
  UpdateRoomV2StatusDto,
} from './admin-ux-room-v2.dto';
import { AdminUxRoomV2Service } from './admin-ux-room-v2.service';

function requestContext(request: RequestWithCorrelationId) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

// This controller is registered ahead of the legacy RoomController.  Requests
// without the v2 media type are deliberately rejected here only after the
// app-level adapter has delegated legacy requests to the established controller.
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('rooms')
export class AdminUxRoomV2Controller {
  constructor(private readonly rooms: AdminUxRoomV2Service) {}

  @Get()
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListRoomsV2QueryDto) {
    return this.rooms.list(user, query);
  }

  @Get(':roomId')
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  get(
    @CurrentUser() user: UserAccessContext,
    @Param('roomId') roomId: string,
    @Query('include_active_lease') includeActiveLease?: string,
  ) {
    return this.rooms.get(user, roomId, includeActiveLease === 'true');
  }

  @Post()
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateRoomV2Dto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.create(user, dto, requestContext(request));
  }

  @Patch(':roomId')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomV2Dto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.update(user, roomId, dto, requestContext(request));
  }

  @Patch(':roomId/status')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomV2StatusDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.rooms.updateStatus(user, roomId, dto, requestContext(request));
  }
}
