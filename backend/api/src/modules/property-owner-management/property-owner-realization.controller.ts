import { documentDisposition } from '../../shared/utils/download-filename';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
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
  ChangeOwnerRealizationStatusDto,
  CancelOwnerRealizationDto,
  CreateHistoricalOwnerRealizationDto,
  CreateOwnerRealizationCorrectionDto,
  OwnerRealizationQueryDto,
  PrepareOwnerRealizationDto,
  RecordOwnerRealizationTransferDto,
  RecordOwnerRealizationRecoveryEventDto,
  VoidOwnerRealizationDraftDto,
} from './dto/property-owner-management.dto';
import { PropertyOwnerRealizationService } from './property-owner-realization.service';

const auditContext = (request: RequestWithCorrelationId) => ({
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
  correlationId: request.correlationId,
});

/** Admin-only full-contract Owner realization workspace. */
@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('admin')
@RequirePermissions('property_owner.realization.manage')
@Controller('admin/property-owner-realizations')
export class PropertyOwnerRealizationController {
  constructor(private readonly realizations: PropertyOwnerRealizationService) {}

  @Get()
  list(@CurrentUser() actor: UserAccessContext, @Query() query: OwnerRealizationQueryDto) {
    return this.realizations.list(actor, query);
  }

  @Get('export')
  async exportQueue(
    @CurrentUser() actor: UserAccessContext,
    @Query() query: OwnerRealizationQueryDto,
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.exportQueue(actor, query, format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get('finance-request/export')
  async exportFinanceRequest(
    @CurrentUser() actor: UserAccessContext,
    @Query() query: OwnerRealizationQueryDto,
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.exportFinanceRequest(actor, query, format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get('not-eligible')
  notEligible(@CurrentUser() actor: UserAccessContext, @Query() query: OwnerRealizationQueryDto) {
    return this.realizations.listNotEligible(actor, query);
  }

  @Get('not-eligible/export')
  async exportNotEligible(
    @CurrentUser() actor: UserAccessContext,
    @Query() query: OwnerRealizationQueryDto,
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.exportNotEligible(actor, query, format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get('historical-sources')
  historicalSources(
    @CurrentUser() actor: UserAccessContext,
    @Query('property_id') propertyId: string,
  ) {
    return this.realizations.historicalSources(actor, propertyId);
  }

  @Get('finance-confirmers')
  financeConfirmers(
    @CurrentUser() actor: UserAccessContext,
    @Query('property_id') propertyId: string,
  ) {
    return this.realizations.financeConfirmers(actor, propertyId);
  }

  @Get(':realizationId')
  detail(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Query('property_id') propertyId: string,
  ) {
    return this.realizations.detail(actor, realizationId, propertyId);
  }

  @Post('owners/:ownerId/prepare')
  prepare(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: PrepareOwnerRealizationDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.prepare(actor, ownerId, dto, key, auditContext(request));
  }

  @Post('owners/:ownerId/historical')
  historical(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: CreateHistoricalOwnerRealizationDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.createHistorical(actor, ownerId, dto, key, auditContext(request));
  }

  @Post(':realizationId/void-draft')
  voidDraft(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: VoidOwnerRealizationDraftDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.voidDraft(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/void')
  void(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: CancelOwnerRealizationDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.voidRealization(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/submit-review')
  submitReview(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: ChangeOwnerRealizationStatusDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.submitForReview(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/approve')
  approve(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: ChangeOwnerRealizationStatusDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.approve(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/return-draft')
  returnDraft(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: ChangeOwnerRealizationStatusDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.returnToDraft(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/submit-finance')
  submitFinance(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: ChangeOwnerRealizationStatusDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.submitToFinance(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/awaiting-transfer')
  awaitingTransfer(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: ChangeOwnerRealizationStatusDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.markAwaitingTransfer(
      actor,
      realizationId,
      dto,
      key,
      auditContext(request),
    );
  }

  @Post(':realizationId/corrections')
  correction(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: CreateOwnerRealizationCorrectionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.addCorrection(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/transfers')
  transfer(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: RecordOwnerRealizationTransferDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.recordTransfer(actor, realizationId, dto, key, auditContext(request));
  }

  @Post(':realizationId/corrections/:correctionId/recovery-events')
  recoveryEvent(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Param('correctionId', new ParseUUIDPipe({ version: '4' })) correctionId: string,
    @Body() dto: RecordOwnerRealizationRecoveryEventDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.recordRecoveryEvent(
      actor,
      realizationId,
      correctionId,
      dto,
      key,
      auditContext(request),
    );
  }

  @Post(':realizationId/publish')
  publish(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Body() dto: ChangeOwnerRealizationStatusDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.realizations.publish(actor, realizationId, dto, key, auditContext(request));
  }

  @Get(':realizationId/export')
  async export(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Query('property_id') propertyId: string,
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.export(actor, realizationId, propertyId, format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get(':realizationId/transfers/:transferId/receipt')
  async receipt(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Param('transferId', new ParseUUIDPipe({ version: '4' })) transferId: string,
    @Query('property_id') propertyId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.transferReceipt(
      actor,
      realizationId,
      transferId,
      propertyId,
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }
}
