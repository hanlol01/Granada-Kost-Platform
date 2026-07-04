import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { PaymentGatewayService } from './payment-gateway.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@RequirePermissions('billing.self.read')
@Controller('my/invoices')
export class PaymentGatewayController {
  constructor(private readonly paymentGateway: PaymentGatewayService) {}

  @Post(':invoiceId/payment-sessions')
  createPaymentSession(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId') invoiceId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.paymentGateway.createResidentPaymentSession(invoiceId, user, this.contextFromRequest(user, request));
  }

  @Get(':invoiceId/payment-status')
  getPaymentStatus(@CurrentUser() user: UserAccessContext, @Param('invoiceId') invoiceId: string) {
    return this.paymentGateway.getResidentPaymentStatus(invoiceId, user);
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
