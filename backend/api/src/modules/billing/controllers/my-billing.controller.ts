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
import { CreateMyPaymentProofDto } from '../dto/create-my-payment-proof.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { InvoiceService } from '../services/invoice.service';
import { PaymentService } from '../services/payment.service';
import { W06BillingService } from '../services/w06-billing.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@RequirePermissions('billing.self.read')
@Controller('my')
export class MyBillingController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
    private readonly w06: W06BillingService,
  ) {}

  @Get('billing')
  billing(@CurrentUser() user: UserAccessContext) {
    return this.w06.myBilling(user);
  }

  @Get('invoices')
  listInvoices(@CurrentUser() user: UserAccessContext, @Query() query: PaginationQueryDto) {
    return this.invoices.listForUser(user.id, query.limit, query.offset);
  }

  @Get('invoices/:invoiceId')
  getInvoice(@CurrentUser() user: UserAccessContext, @Param('invoiceId') invoiceId: string) {
    return this.invoices.getForUser(invoiceId, user.id);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: UserAccessContext, @Query() query: PaginationQueryDto) {
    return this.payments.listForUser(user.id, query.limit, query.offset);
  }

  @Post('payment-proofs')
  createPaymentProof(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateMyPaymentProofDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.w06.submitMyProof(user, dto, key, this.contextFromRequest(user, request));
  }

  @Get('receipts/:receiptId')
  receipt(@CurrentUser() user: UserAccessContext, @Param('receiptId') receiptId: string) {
    return this.w06.myReceipt(user, receiptId);
  }

  @Get('receipts/:receiptId/document')
  @Header('Cache-Control', 'private, no-store')
  async receiptDocument(
    @CurrentUser() user: UserAccessContext,
    @Param('receiptId') receiptId: string,
  ) {
    const document = await this.w06.myReceiptDocument(user, receiptId);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }

  @Get('billing/invoices/:invoiceId/document')
  @Header('Cache-Control', 'private, no-store')
  async invoiceDocument(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId') invoiceId: string,
  ) {
    const document = await this.w06.myInvoiceDocument(user, invoiceId);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }

  private contextFromRequest(user: UserAccessContext, request: RequestWithCorrelationId) {
    return {
      actorUserId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
