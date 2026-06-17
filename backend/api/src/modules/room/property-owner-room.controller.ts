import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RoomService } from './room.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions('room.read')
@Controller('property-owner/properties/:propertyId/rooms')
export class PropertyOwnerRoomController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Param('propertyId') propertyId: string) {
    return this.rooms.listRooms(user, { property_id: propertyId });
  }
}
