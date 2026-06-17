import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ComplaintService } from '../services/complaint.service';
import { scopedPropertyIds } from './complaint-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions('property_owner.report.view')
@Controller('property-owner/complaints')
export class PropertyOwnerComplaintController {
  constructor(
    private readonly complaints: ComplaintService,
    private readonly properties: PropertyService,
  ) {}

  @Get('summary')
  async summary(@CurrentUser() user: UserAccessContext, @Query('property_id') propertyId?: string) {
    const propertyIds = await scopedPropertyIds(this.properties, user, propertyId);
    return this.complaints.summaryForProperties(propertyIds);
  }
}
