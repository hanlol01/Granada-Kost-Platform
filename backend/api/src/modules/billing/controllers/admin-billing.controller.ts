import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListAdminInvoicesQueryDto } from '../dto/list-admin-invoices-query.dto';
import { ListAdminPaymentsQueryDto } from '../dto/list-admin-payments-query.dto';
import { AdminBillingService } from '../services/admin-billing.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('billing.read')
@Controller('admin')
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  @Get('invoices')
  listInvoices(@CurrentUser() user: UserAccessContext, @Query() query: ListAdminInvoicesQueryDto) {
    return this.billing.listInvoices(user, query);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: UserAccessContext, @Query() query: ListAdminPaymentsQueryDto) {
    return this.billing.listPayments(user, query);
  }
}
