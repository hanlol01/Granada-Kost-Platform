import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { ListPaymentTransactionsQueryDto } from './dto/list-payment-transactions-query.dto';
import { PaymentGatewayService } from './payment-gateway.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('manager', 'admin')
@RequirePermissions('billing.read')
@Controller('admin/payment-transactions')
export class PaymentGatewayAdminController {
  constructor(
    private readonly paymentGateway: PaymentGatewayService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListPaymentTransactionsQueryDto) {
    const propertyIds = await this.scopedPropertyIds(user, query.property_id);
    return this.paymentGateway.listAdminTransactions(propertyIds, query.status, query.limit, query.offset);
  }

  @Get(':transactionId')
  async get(@CurrentUser() user: UserAccessContext, @Param('transactionId') transactionId: string) {
    const transaction = await this.paymentGateway.getAdminTransaction(transactionId);
    await this.properties.assertCanReadProperty(user, transaction.propertyId);
    return transaction;
  }

  private async scopedPropertyIds(user: UserAccessContext, propertyId?: string): Promise<string[]> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return [propertyId];
    }
    return user.propertyIds;
  }
}
