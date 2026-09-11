import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { ReportService } from './report.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get(':type/preview')
  @RequirePermissions('report.view')
  preview(
    @CurrentUser() actor: UserAccessContext,
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.preview(actor, type, query);
  }

  @Get(':type/export')
  @RequirePermissions('report.export')
  async export(
    @CurrentUser() actor: UserAccessContext,
    @Param('type') type: string,
    @Query() query: ReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.reports.export(actor, type, query);
    response.setHeader('Content-Type', result.content_type);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('X-Report-Filter-Checksum', result.filter_checksum);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(result.content);
  }
}
