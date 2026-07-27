import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { acceptsAdminUxV2, v2Data } from '../../shared/admin-ux-v2';
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
import { AdminUxRoomV2Service } from '../admin-ux-master/admin-ux-room-v2.service';
import type {
  CreateRoomV2Dto,
  UpdateRoomV2StatusDto,
} from '../admin-ux-master/admin-ux-room-v2.dto';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin', 'property_owner')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly rooms: RoomService,
    private readonly roomsV2: AdminUxRoomV2Service,
  ) {}

  @Get()
  @RequirePermissions('room.read')
  list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListRoomsQueryDto,
    @Headers('accept') accept?: string,
  ) {
    if (acceptsAdminUxV2(accept)) {
      return this.roomsV2.list(user, query);
    }
    return this.rooms.listRooms(user, query);
  }

  @Get('availability')
  @RequirePermissions('room.read')
  async availability(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id') propertyId?: string,
    @Headers('accept') accept?: string,
  ) {
    const result = await this.rooms.availability(user, propertyId);
    if (!acceptsAdminUxV2(accept)) return result;
    return v2Data(
      result.map((item) => ({
        property_id: item.propertyId,
        status: item.status,
        total: Math.max(0, Math.trunc(item.total)),
      })),
    );
  }

  @Post()
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateRoomDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.roomsV2.create(user, dto as CreateRoomV2Dto, this.contextFromRequest(request));
    }
    return this.rooms.createRoom(user, dto, this.contextFromRequest(request));
  }

  @Get(':roomId')
  @RequirePermissions('room.read')
  get(
    @CurrentUser() user: UserAccessContext,
    @Param('roomId') roomId: string,
    @Headers('accept') accept?: string,
    @Query('include_active_lease') includeActiveLease?: string,
  ) {
    if (acceptsAdminUxV2(accept)) {
      return this.roomsV2.get(user, roomId, includeActiveLease === 'true');
    }
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
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.roomsV2.update(user, roomId, dto, this.contextFromRequest(request));
    }
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
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.roomsV2.updateStatus(
        user,
        roomId,
        dto as UpdateRoomV2StatusDto,
        this.contextFromRequest(request),
      );
    }
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
