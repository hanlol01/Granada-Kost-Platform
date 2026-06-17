import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from './property.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions('property.read')
@Controller('property-owner/properties')
export class PropertyOwnerController {
  constructor(private readonly properties: PropertyService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext) {
    return this.properties.list(user);
  }

  @Get(':propertyId')
  get(@CurrentUser() user: UserAccessContext, @Param('propertyId') propertyId: string) {
    return this.properties.get(user, propertyId);
  }
}
