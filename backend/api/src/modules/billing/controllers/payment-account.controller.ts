import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { BillingService } from '../services/billing.service';
import { scopedPropertyIds } from './billing-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('billing.read')
@Controller('payment-accounts')
export class PaymentAccountController {
  constructor(
    private readonly billing: BillingService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query('property_id') propertyId?: string) {
    const propertyIds = await scopedPropertyIds(this.properties, user, propertyId);
    return this.billing.paymentAccountsForProperties(propertyIds);
  }
}
