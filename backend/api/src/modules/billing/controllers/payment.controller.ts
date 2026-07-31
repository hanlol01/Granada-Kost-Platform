import {
  Body,
  Controller,
  Get,
  GoneException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { PaymentService } from '../services/payment.service';
import { scopedPropertyIds } from './billing-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  @RequirePermissions('billing.read')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListPaymentsQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const results = await Promise.all(
      propertyIds.map((propertyId) =>
        this.payments.list(propertyId, query.status, query.limit, query.offset),
      ),
    );
    return results.flat();
  }

  @Get(':paymentId')
  @RequirePermissions('billing.read')
  async get(
    @CurrentUser() user: UserAccessContext,
    @Param('paymentId') paymentId: string,
    @Query('property_id') propertyId?: string,
  ) {
    if (!propertyId)
      throw new GoneException({
        code: 'PROPERTY_SCOPE_REQUIRED',
        message: 'Use the scoped W06 payment detail endpoint',
      });
    await this.properties.assertCanReadProperty(user, propertyId);
    const payment = await this.payments.get(paymentId);
    if (payment.propertyId !== propertyId)
      throw new GoneException({
        code: 'PAYMENT_SCOPE_MISMATCH',
        message: 'Payment is unavailable',
      });
    return payment;
  }

  @Post()
  @RequirePermissions('billing.manage')
  async record(@CurrentUser() user: UserAccessContext, @Body() dto: RecordPaymentDto) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    throw new GoneException({
      code: 'LEGACY_PAYMENT_WRITE_DISABLED',
      message: 'Use the W06 manual payment workspace',
    });
  }

  @Post(':paymentId/verify')
  @RequirePermissions('payment.verify')
  verify() {
    throw new GoneException({
      code: 'LEGACY_PAYMENT_WRITE_DISABLED',
      message: 'Use the scoped W06 verification endpoint',
    });
  }

  @Post(':paymentId/reject')
  @RequirePermissions('payment.verify')
  reject() {
    throw new GoneException({
      code: 'LEGACY_PAYMENT_WRITE_DISABLED',
      message: 'Use the scoped W06 proof rejection endpoint',
    });
  }
}
