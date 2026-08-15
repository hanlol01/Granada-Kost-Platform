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
  ApproveLeaseRenewalDto,
  AuthorizeLeaseRenewalActivationDto,
  CancelLeaseRenewalDto,
  CancelScheduledTransferDto,
  CloseLeaseDto,
  CollectDepositDto,
  CreateLeaseDto,
  CreateLeaseRenewalIntentDto,
  ListLeaseResidentOptionsQueryDto,
  ListLeasesQueryDto,
  PrepareLeaseRenewalFinancialsDto,
  ScheduleTransferLeaseDto,
  SettleRefundDto,
  TransferLeaseDto,
  TransferLeasePreviewDto,
  UpdateLeaseDto,
  WaiveRefundDto,
} from './lease.dto';
import { LeaseService } from './lease.service';
import { LeaseRenewalService } from './lease-renewal.service';
import { LeaseTransferService } from './lease-transfer.service';

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
  constructor(
    private readonly leases: LeaseService,
    private readonly transfers: LeaseTransferService,
    private readonly renewals: LeaseRenewalService,
  ) {}

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

  @Get('resident-options')
  @RequirePermissions('lease.read')
  residentOptions(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListLeaseResidentOptionsQueryDto,
  ) {
    return this.leases.listResidentOptions(user, query);
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

  // W07B transfer authority is Admin-only (lead decision 3). Property owners
  // keep read-only access through the owner portal; they never mutate transfers.
  @Post(':leaseId/transfer/preview')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  previewTransfer(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: TransferLeasePreviewDto,
  ) {
    return this.transfers.preview(user, leaseId, dto);
  }

  /** W07B same-day exception path. Requires exception_reason in the body. */
  @Post(':leaseId/transfer')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  async transfer(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: TransferLeaseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.transfers.transfer(
      user,
      leaseId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  /** W07B normal path: persists a command executed only at the billing boundary. */
  @Post(':leaseId/transfer/schedule')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  async scheduleTransfer(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: ScheduleTransferLeaseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.transfers.schedule(
      user,
      leaseId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  @Get(':leaseId/transfers')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  listTransferCommands(@CurrentUser() user: UserAccessContext, @Param('leaseId') leaseId: string) {
    return this.transfers.listTransferCommands(user, leaseId);
  }

  @Post(':leaseId/transfers/:commandId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  async cancelScheduledTransfer(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: CancelScheduledTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.transfers.cancelScheduledTransfer(
      user,
      leaseId,
      commandId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
    return this.commandResponse(response, result);
  }

  // W07C is intentionally separate from generic activation and checkout.
  // Intent/approval/cancellation require Admin + lease.manage; financial work
  // and activation authorization also require billing.manage.
  @Post(':leaseId/renewals')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  async createRenewalIntent(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateLeaseRenewalIntentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commandResponse(
      response,
      await this.renewals.createIntent(user, leaseId, dto, idempotencyKey, auditContext(request)),
    );
  }

  @Get(':leaseId/renewals')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  listRenewals(@CurrentUser() user: UserAccessContext, @Param('leaseId') leaseId: string) {
    return this.renewals.listRenewalCommands(user, leaseId);
  }

  @Get(':leaseId/renewals/eligibility')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  renewalEligibility(@CurrentUser() user: UserAccessContext, @Param('leaseId') leaseId: string) {
    return this.renewals.renewalEligibility(user, leaseId);
  }

  @Post(':leaseId/renewals/:commandId/approve')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  async approveRenewal(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: ApproveLeaseRenewalDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commandResponse(
      response,
      await this.renewals.approve(
        user,
        leaseId,
        commandId,
        dto,
        idempotencyKey,
        auditContext(request),
      ),
    );
  }

  @Post(':leaseId/renewals/:commandId/financials')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage', 'billing.manage')
  async prepareRenewalFinancials(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: PrepareLeaseRenewalFinancialsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commandResponse(
      response,
      await this.renewals.prepareFinancials(
        user,
        leaseId,
        commandId,
        dto,
        idempotencyKey,
        auditContext(request),
      ),
    );
  }

  @Post(':leaseId/renewals/:commandId/authorize-activation')
  @RequireRoles('admin')
  @RequirePermissions('lease.manage', 'billing.manage')
  async authorizeRenewalActivation(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: AuthorizeLeaseRenewalActivationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commandResponse(
      response,
      await this.renewals.authorizeActivation(
        user,
        leaseId,
        commandId,
        dto,
        idempotencyKey,
        auditContext(request),
      ),
    );
  }

  @Post(':leaseId/renewals/:commandId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('admin')
  @RequirePermissions('lease.manage')
  async cancelRenewal(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: CancelLeaseRenewalDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commandResponse(
      response,
      await this.renewals.cancel(
        user,
        leaseId,
        commandId,
        dto,
        idempotencyKey,
        auditContext(request),
      ),
    );
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
