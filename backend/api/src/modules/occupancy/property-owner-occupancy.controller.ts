import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { OccupancyService } from './occupancy.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions('resident.read')
@Controller('property-owner/properties/:propertyId/occupancies')
export class PropertyOwnerOccupancyController {
  constructor(private readonly occupancies: OccupancyService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Param('propertyId') propertyId: string) {
    return this.occupancies.list(user, { property_id: propertyId });
  }

  @Get('active')
  listActive(@CurrentUser() user: UserAccessContext, @Param('propertyId') propertyId: string) {
    return this.occupancies.listActive(user, propertyId);
  }
}
