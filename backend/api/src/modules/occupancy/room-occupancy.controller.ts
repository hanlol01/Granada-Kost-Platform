import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { OccupancyService } from './occupancy.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('resident.read')
@Controller('rooms/:roomId/occupancy')
export class RoomOccupancyController {
  constructor(private readonly occupancies: OccupancyService) {}

  @Get()
  getActive(@CurrentUser() user: UserAccessContext, @Param('roomId') roomId: string) {
    return this.occupancies.getActiveByRoom(user, roomId);
  }
}
