import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { ListOccupanciesQueryDto } from './dto/list-occupancies-query.dto';
import { OccupancyService } from './occupancy.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('resident.read')
@Controller('occupancies')
export class OccupancyController {
  constructor(private readonly occupancies: OccupancyService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListOccupanciesQueryDto) {
    return this.occupancies.list(user, query);
  }

  @Get('active')
  active(@CurrentUser() user: UserAccessContext, @Query('property_id') propertyId?: string) {
    return this.occupancies.listActive(user, propertyId);
  }

  @Get(':occupancyId')
  get(@CurrentUser() user: UserAccessContext, @Param('occupancyId') occupancyId: string) {
    return this.occupancies.get(user, occupancyId);
  }
}
