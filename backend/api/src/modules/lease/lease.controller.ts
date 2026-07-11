import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
  CloseLeaseDto,
  CollectDepositDto,
  CreateLeaseDto,
  ListLeasesQueryDto,
  SettleRefundDto,
  UpdateLeaseDto,
  WaiveRefundDto,
} from './lease.dto';
import { LeaseService } from './lease.service';

function auditContext(request: RequestWithCorrelationId) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('leases')
export class LeaseController {
  constructor(private readonly leases: LeaseService) {}

  @Get()
  @RequirePermissions('lease.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListLeasesQueryDto) {
    return this.leases.list(user, query);
  }

  @Get('overdue')
  @RequirePermissions('lease.read')
  overdue(
    @CurrentUser() user: UserAccessContext,
    @Query('property_id') propertyId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.leases.listOverdue(user, propertyId, limit, offset);
  }

  @Get(':leaseId')
  @RequirePermissions('lease.read')
  get(@CurrentUser() user: UserAccessContext, @Param('leaseId') leaseId: string) {
    return this.leases.get(user, leaseId);
  }

  @Get(':leaseId/billing-summary')
  @RequirePermissions('lease.read')
  billingSummary(@CurrentUser() user: UserAccessContext, @Param('leaseId') leaseId: string) {
    return this.leases.billingSummary(user, leaseId);
  }

  @Post()
  @RequirePermissions('lease.manage')
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateLeaseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.leases.create(user, dto, idempotencyKey, auditContext(request));
    return this.commandResponse(response, result);
  }

  @Patch(':leaseId')
  @RequirePermissions('lease.manage')
  async update(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: UpdateLeaseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.leases.update(
      user,
      leaseId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  @Post(':leaseId/deposit/collect')
  @RequireRoles('owner', 'manager')
  @RequirePermissions('lease.manage', 'billing.manage')
  async collectDeposit(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: CollectDepositDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.leases.collectDeposit(
      user,
      leaseId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  @Post(':leaseId/close')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('owner', 'manager')
  @RequirePermissions('lease.manage', 'billing.manage')
  async close(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: CloseLeaseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.leases.close(
      user,
      leaseId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  @Post(':leaseId/refunds/:refundId/settle')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('owner', 'manager')
  @RequirePermissions('billing.manage')
  async settleRefund(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('refundId') refundId: string,
    @Body() dto: SettleRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.leases.settleRefund(
      user,
      leaseId,
      refundId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  @Post(':leaseId/refunds/:refundId/waive')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('owner', 'manager')
  @RequirePermissions('billing.manage')
  async waiveRefund(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('refundId') refundId: string,
    @Body() dto: WaiveRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.leases.waiveRefund(
      user,
      leaseId,
      refundId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  private commandResponse<T>(
    response: Response,
    result: { status: number; body: T; replayed: boolean },
  ): T {
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    response.status(result.status);
    return result.body;
  }
}
