import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { RejectPaymentDto } from '../dto/reject-payment.dto';
import { PaymentService } from '../services/payment.service';
import { auditContext, scopedPropertyIds } from './billing-controller.util';

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
      propertyIds.map((propertyId) => this.payments.list(propertyId, query.status, query.limit, query.offset)),
    );
    return results.flat();
  }

  @Get(':paymentId')
  @RequirePermissions('billing.read')
  async get(@CurrentUser() user: UserAccessContext, @Param('paymentId') paymentId: string) {
    const payment = await this.payments.get(paymentId);
    await this.properties.assertCanReadProperty(user, payment.propertyId);
    return payment;
  }

  @Post()
  @RequirePermissions('billing.manage')
  async record(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: RecordPaymentDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.payments.recordPayment(
      {
        propertyId: dto.property_id,
        residentId: dto.resident_id,
        paymentCode: dto.payment_code,
        paymentMethod: dto.payment_method,
        amount: dto.amount,
        receivedByUserId: user.id,
        referenceNumber: dto.reference_number,
        notes: dto.notes,
      },
      auditContext(user, request),
    );
  }

  @Post(':paymentId/verify')
  @RequirePermissions('payment.verify')
  async verify(@CurrentUser() user: UserAccessContext, @Param('paymentId') paymentId: string, @Req() request: RequestWithCorrelationId) {
    const payment = await this.payments.get(paymentId);
    await this.properties.assertCanReadProperty(user, payment.propertyId);
    return this.payments.verifyPayment(paymentId, auditContext(user, request));
  }

  @Post(':paymentId/reject')
  @RequirePermissions('payment.verify')
  async reject(
    @CurrentUser() user: UserAccessContext,
    @Param('paymentId') paymentId: string,
    @Body() _dto: RejectPaymentDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const payment = await this.payments.get(paymentId);
    await this.properties.assertCanReadProperty(user, payment.propertyId);
    return this.payments.rejectPayment(paymentId, auditContext(user, request));
  }
}
