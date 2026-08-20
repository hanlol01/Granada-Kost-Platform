import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { ResidentService } from './resident.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@Controller('my/resident-context')
export class MyResidentContextController {
  constructor(private readonly residents: ResidentService) {}

  @Get()
  async get(@CurrentUser() user: UserAccessContext) {
    const context = await this.residents.myContext(user.id);
    if (!context) {
      return { data: null };
    }
    return {
      data: {
        display_name: context.displayName,
        phone: context.phone,
        property_name: context.propertyName,
        room_number: context.roomNumber,
        occupancy_start: context.occupancyStart,
        building_name: context.buildingName,
        building_code: context.buildingCode,
        kost_type: context.kostType,
        gender: context.gender,
        lease_status: context.leaseStatus,
        lease_start: context.leaseStart,
        lease_end: context.leaseEnd,
        term_months: context.termMonths,
        payment_plan_type: context.paymentPlanType,
      },
    };
  }
}
