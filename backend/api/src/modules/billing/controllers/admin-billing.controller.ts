import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListAdminInvoicesQueryDto } from '../dto/list-admin-invoices-query.dto';
import { ListAdminPaymentsQueryDto } from '../dto/list-admin-payments-query.dto';
import { AdminBillingService } from '../services/admin-billing.service';
import {
  AdminBillingScopeQueryDto,
  AdminBillingWorklistQueryDto,
  AdminW06PaymentsQueryDto,
  AdminW06ProofsQueryDto,
  CreateOtherChargeDto,
  RecordManualPaymentDto,
  RejectManualPaymentDto,
  ReviewPaymentProofDto,
  ReversePaymentDto,
  VerifyManualPaymentDto,
  VoidInvoiceDto,
} from '../dto/w06-billing.dto';
import { W06BillingService } from '../services/w06-billing.service';
import { auditContext } from './billing-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('billing.read')
@Controller('admin')
export class AdminBillingController {
  constructor(
    private readonly billing: AdminBillingService,
    private readonly w06: W06BillingService,
  ) {}

  @Get('invoices')
  listInvoices(@CurrentUser() user: UserAccessContext, @Query() query: ListAdminInvoicesQueryDto) {
    return this.billing.listInvoices(user, query);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: UserAccessContext, @Query() query: ListAdminPaymentsQueryDto) {
    return this.billing.listPayments(user, query);
  }

  @Get('billing/current')
  current(@CurrentUser() user: UserAccessContext, @Query() query: AdminBillingWorklistQueryDto) {
    return this.w06.currentWorklist(user, query);
  }

  @Get('billing/payments')
  payments(@CurrentUser() user: UserAccessContext, @Query() query: AdminW06PaymentsQueryDto) {
    return this.w06.paymentWorkspace(user, query);
  }

  @Get('billing/payment-proofs')
  proofs(@CurrentUser() user: UserAccessContext, @Query() query: AdminW06ProofsQueryDto) {
    return this.w06.proofWorkspace(user, query);
  }

  @Get('billing/residents/:residentId')
  resident(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Query() query: AdminBillingScopeQueryDto,
  ) {
    return this.w06.residentDetail(user, query.property_id, residentId);
  }

  @Get('billing/payments/:paymentId')
  payment(
    @CurrentUser() user: UserAccessContext,
    @Param('paymentId') paymentId: string,
    @Query() query: AdminBillingScopeQueryDto,
  ) {
    return this.w06.paymentDetail(user, query.property_id, paymentId);
  }

  @Get('billing/receipts/:receiptId')
  receipt(
    @CurrentUser() user: UserAccessContext,
    @Param('receiptId') receiptId: string,
    @Query() query: AdminBillingScopeQueryDto,
  ) {
    return this.w06.receipt(user, query.property_id, receiptId);
  }

  @Get('billing/invoices/:invoiceId/document')
  @Header('Cache-Control', 'private, no-store')
  async invoiceDocument(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId') invoiceId: string,
    @Query() query: AdminBillingScopeQueryDto,
  ) {
    const document = await this.w06.invoiceDocument(user, query.property_id, invoiceId);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }

  @Post('billing/payments/manual')
  @RequirePermissions('billing.manage')
  recordManual(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: RecordManualPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.recordManualPayment(user, dto, key, auditContext(user, request));
  }

  @Post('billing/payments/:paymentId/verify')
  @RequirePermissions('payment.verify')
  verifyManual(
    @CurrentUser() user: UserAccessContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: VerifyManualPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.verifyManualPayment(user, paymentId, dto, key, auditContext(user, request));
  }

  @Post('billing/payments/:paymentId/reject')
  @RequirePermissions('payment.verify')
  rejectManual(
    @CurrentUser() user: UserAccessContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: RejectManualPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.rejectManualPayment(user, paymentId, dto, key, auditContext(user, request));
  }

  @Post('billing/payment-proofs/:proofId/verify')
  @RequirePermissions('payment.verify')
  verifyProof(
    @CurrentUser() user: UserAccessContext,
    @Param('proofId') proofId: string,
    @Body() dto: VerifyManualPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.verifyProof(user, proofId, dto, key, auditContext(user, request));
  }

  @Post('billing/payment-proofs/:proofId/reject')
  @RequirePermissions('payment.verify')
  rejectProof(
    @CurrentUser() user: UserAccessContext,
    @Param('proofId') proofId: string,
    @Body() dto: ReviewPaymentProofDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.rejectProof(user, proofId, dto, key, auditContext(user, request));
  }

  @Post('billing/payments/:paymentId/reverse')
  @RequirePermissions('billing.manage')
  reverse(
    @CurrentUser() user: UserAccessContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReversePaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.reversePayment(user, paymentId, dto, key, auditContext(user, request));
  }

  @Post('billing/other-charges')
  @RequirePermissions('billing.manage')
  otherCharge(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateOtherChargeDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.createOtherCharge(user, dto, key, auditContext(user, request));
  }

  @Post('billing/invoices/:invoiceId/void')
  @RequirePermissions('billing.manage')
  voidInvoice(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: VoidInvoiceDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.voidInvoice(user, invoiceId, dto, key, auditContext(user, request));
  }
}
