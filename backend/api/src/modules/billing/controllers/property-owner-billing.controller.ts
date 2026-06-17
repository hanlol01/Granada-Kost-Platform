import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListInvoicesQueryDto } from '../dto/list-invoices-query.dto';
import { BillingService } from '../services/billing.service';
import { InvoiceService } from '../services/invoice.service';
import { scopedPropertyIds } from './billing-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions('billing.read')
@Controller('property-owner/billing')
export class PropertyOwnerBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly invoices: InvoiceService,
    private readonly properties: PropertyService,
  ) {}

  @Get('summary')
  async summary(@CurrentUser() user: UserAccessContext, @Query('property_id') propertyId?: string) {
    const propertyIds = await scopedPropertyIds(this.properties, user, propertyId);
    return this.billing.billingSummaryForProperties(propertyIds);
  }

  @Get('invoices')
  async listInvoices(@CurrentUser() user: UserAccessContext, @Query() query: ListInvoicesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    return this.invoices.listForProperties(propertyIds, query.status, query.limit, query.offset);
  }
}
