import { documentDisposition } from '../../shared/utils/download-filename';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { PropertyOwnerPortalService } from './property-owner-portal.service';
import { PropertyOwnerRealizationService } from './property-owner-realization.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions(
  'property_owner.asset.read',
  'property_owner.finance.read',
  'property_owner.complaint.read',
  'property_owner.maintenance.read',
  'property_owner.notification.read',
  'property_owner.report.view',
)
@Controller('my/property-owner')
export class PropertyOwnerPortalController {
  constructor(
    private readonly portal: PropertyOwnerPortalService,
    private readonly realizations: PropertyOwnerRealizationService,
  ) {}

  @Get('portal')
  getPortal(@CurrentUser() actor: UserAccessContext) {
    return this.portal.getPortal(actor);
  }

  @Get('assets')
  getAssets(
    @CurrentUser() actor: UserAccessContext,
    @Query('q') query: string | undefined,
    @Query('room_status') roomStatus: string | undefined,
    @Query('lease_status') leaseStatus: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.portal.listAssets(actor, { query, roomStatus, leaseStatus, offset, limit });
  }

  @Get('occupancy')
  getOccupancy(
    @CurrentUser() actor: UserAccessContext,
    @Query('q') query: string | undefined,
    @Query('room_status') roomStatus: string | undefined,
    @Query('lease_status') leaseStatus: string | undefined,
    @Query('billing_state') billingState: string | undefined,
    @Query('ending_within_days') endingWithinDays: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.portal.listOccupancy(actor, {
      query,
      roomStatus,
      leaseStatus,
      billingState,
      endingWithinDays,
      offset,
      limit,
    });
  }

  @Get('occupancy/:roomCode/resident')
  getOccupancyResidentDetail(
    @CurrentUser() actor: UserAccessContext,
    @Param('roomCode') roomCode: string,
  ) {
    return this.portal.getOccupancyResidentDetail(actor, roomCode);
  }

  @Get('assets/:roomCode')
  getAssetDetail(@CurrentUser() actor: UserAccessContext, @Param('roomCode') roomCode: string) {
    return this.portal.getAssetDetail(actor, roomCode);
  }

  @Get('reports/preview')
  preview(@CurrentUser() actor: UserAccessContext, @Query('period') period: string | undefined) {
    return this.portal.preview(actor, period ?? '');
  }

  @Get('finance')
  finance(@CurrentUser() actor: UserAccessContext, @Query('period') period: string | undefined) {
    return this.portal.finance(actor, period ?? '');
  }

  @Get('collection-progress')
  collectionProgress(@CurrentUser() actor: UserAccessContext) {
    return this.portal.collectionProgress(actor);
  }

  /** Only documents explicitly published to the authenticated Owner appear here. */
  @Get('realizations')
  realizationsList(@CurrentUser() actor: UserAccessContext) {
    return this.realizations.listPublishedForOwner(actor);
  }

  @Get('realizations/progress')
  realizationProgress(
    @CurrentUser() actor: UserAccessContext,
    @Query('period') period: string | undefined,
  ) {
    return this.realizations.portalProgress(actor, period ?? this.realizations.currentPeriod());
  }

  @Get('realizations/progress/export')
  async realizationProgressExport(
    @CurrentUser() actor: UserAccessContext,
    @Query('period') period: string | undefined,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.portalProgressExport(
      actor,
      period ?? this.realizations.currentPeriod(),
      format ?? '',
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get('realizations/:realizationId/transfers/:transferId/receipt')
  async realizationReceipt(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId') realizationId: string,
    @Param('transferId') transferId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.ownerReceipt(actor, realizationId, transferId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get('realizations/:realizationId/export')
  async realizationExport(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.ownerExport(actor, realizationId, format ?? '');
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content);
  }

  @Get('realizations/:realizationId/transfers/:transferId/evidence/:fileId')
  async realizationEvidence(
    @CurrentUser() actor: UserAccessContext,
    @Param('realizationId', new ParseUUIDPipe({ version: '4' })) realizationId: string,
    @Param('transferId', new ParseUUIDPipe({ version: '4' })) transferId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.realizations.ownerEvidence(actor, realizationId, transferId, fileId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', documentDisposition(file.filename, 'inline'));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(file.content);
  }

  @Get('reports/export')
  async export(
    @CurrentUser() actor: UserAccessContext,
    @Query('period') period: string | undefined,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exportResult = await this.portal.export(actor, period ?? '', format ?? '');
    response.setHeader('Content-Type', exportResult.contentType);
    response.setHeader('Content-Disposition', documentDisposition(exportResult.filename));
    response.setHeader('X-Report-Scope-Checksum', exportResult.checksum);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(exportResult.content);
  }
}
