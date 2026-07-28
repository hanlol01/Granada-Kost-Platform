import { Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { TechnicianService } from '../services/technician.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('maintenance.manage')
@Controller('maintenance/technicians')
export class TechnicianController {
  constructor(
    private readonly technicians: TechnicianService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    return { data: await this.technicians.listReferences(propertyId) };
  }
}
