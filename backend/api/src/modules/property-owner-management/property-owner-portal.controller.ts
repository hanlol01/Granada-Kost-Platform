import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { PropertyOwnerPortalService } from './property-owner-portal.service';

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
  constructor(private readonly portal: PropertyOwnerPortalService) {}

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

  @Get('reports/export')
  async export(
    @CurrentUser() actor: UserAccessContext,
    @Query('period') period: string | undefined,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exportResult = await this.portal.export(actor, period ?? '', format ?? '');
    response.setHeader('Content-Type', exportResult.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    response.setHeader('X-Report-Scope-Checksum', exportResult.checksum);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(exportResult.content);
  }
}
