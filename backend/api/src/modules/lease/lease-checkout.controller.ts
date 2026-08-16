import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import {
  CancelLeaseCheckoutDto,
  CompleteLeaseCheckoutDto,
  CreateLeaseCheckoutNoticeDto,
  RecordLeaseCheckoutHandoverDto,
  RecordLeaseCheckoutInspectionDto,
  SettleRefundDto,
  WaiveRefundDto,
} from './lease.dto';
import { LeaseCheckoutService } from './lease-checkout.service';

function auditContext(request: RequestWithCorrelationId) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

/** W07D explicit Admin-only checkout authority; never handles W07A termination. */
@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('admin')
@RequirePermissions('lease.manage')
@Controller('leases/:leaseId/checkout')
export class LeaseCheckoutController {
  constructor(private readonly checkout: LeaseCheckoutService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Param('leaseId') leaseId: string) {
    return this.checkout.list(user, leaseId);
  }

  @Post()
  async notice(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateLeaseCheckoutNoticeDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.notice(user, leaseId, dto, key, auditContext(request)),
    );
  }

  @Post(':commandId/schedule')
  async schedule(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.schedule(user, leaseId, commandId, key, auditContext(request)),
    );
  }

  @Post(':commandId/handover')
  async handover(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: RecordLeaseCheckoutHandoverDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.handover(user, leaseId, commandId, dto, key, auditContext(request)),
    );
  }

  @Post(':commandId/inspection')
  async inspection(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: RecordLeaseCheckoutInspectionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.inspection(user, leaseId, commandId, dto, key, auditContext(request)),
    );
  }

  @Post(':commandId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('lease.manage', 'billing.manage')
  async complete(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: CompleteLeaseCheckoutDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.complete(user, leaseId, commandId, dto, key, auditContext(request)),
    );
  }

  @Post(':commandId/refunds/:refundId/settle')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('lease.manage', 'billing.manage')
  async settleRefund(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Param('refundId') refundId: string,
    @Body() dto: SettleRefundDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.settleRefund(user, leaseId, commandId, refundId, dto, key, auditContext(request)),
    );
  }

  @Post(':commandId/refunds/:refundId/waive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('lease.manage', 'billing.manage')
  async waiveRefund(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Param('refundId') refundId: string,
    @Body() dto: WaiveRefundDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.waiveRefund(user, leaseId, commandId, refundId, dto, key, auditContext(request)),
    );
  }

  @Post(':commandId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: CancelLeaseCheckoutDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.checkout.cancel(user, leaseId, commandId, dto, key, auditContext(request)),
    );
  }

  private respond<T>(response: Response, result: { status: number; body: T; replayed: boolean }) {
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    response.status(result.status);
    return result.body;
  }
}
