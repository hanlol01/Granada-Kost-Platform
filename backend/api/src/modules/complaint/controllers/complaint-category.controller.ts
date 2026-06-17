import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ComplaintCategoryService } from '../services/complaint-category.service';
import { scopedPropertyIds } from './complaint-controller.util';

class ListComplaintCategoriesQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('complaint.manage')
@Controller('complaint-categories')
export class ComplaintCategoryController {
  constructor(
    private readonly categories: ComplaintCategoryService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListComplaintCategoriesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const result = await Promise.all(propertyIds.map((propertyId) => this.categories.list(propertyId)));
    return result.flat();
  }
}
