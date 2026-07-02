import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { PaymentProofService } from '../services/payment-proof.service';
import { PaymentService } from '../services/payment.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@RequirePermissions('billing.self.read')
@Controller('my')
export class MyBillingController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
    private readonly proofs: PaymentProofService,
  ) {}

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
  async createPaymentProof(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateMyPaymentProofDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const invoice = await this.invoices.getForUser(dto.invoice_id, user.id);
    return this.proofs.submitProof(
      {
        propertyId: invoice.propertyId,
        residentId: invoice.residentId,
        invoiceId: invoice.id,
        paymentAccountId: dto.payment_account_id,
        claimedAmount: dto.claimed_amount,
        paymentMethod: dto.payment_method,
        uploadedByUserId: user.id,
        notes: dto.notes,
        fileIds: dto.file_ids,
      },
      this.contextFromRequest(user, request),
    );
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
