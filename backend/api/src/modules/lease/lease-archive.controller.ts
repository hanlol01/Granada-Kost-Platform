import { Body, Controller, DefaultValuePipe, Get, Headers, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { LeaseArchiveQueryDto, RestoreArchivedLeaseDto } from './lease-archive.dto';
import { LeaseArchiveService } from './lease-archive.service';
import { LeaseArchiveRestorationService } from './lease-archive-restoration.service';
import { LeaseArchiveFileInventoryService } from './lease-archive-file-inventory.service';
import { LeaseArchiveFilePurgeService } from './lease-archive-file-purge.service';
import { PurgeArchivedLeaseFilesDto, RetryArchivedLeaseFilePurgeDto } from './lease-archive-file-purge.dto';

@Controller('lease-archives')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('admin')
@RequirePermissions('lease.read')
export class LeaseArchiveController {
  constructor(private readonly archives: LeaseArchiveService, private readonly restoration: LeaseArchiveRestorationService,
    private readonly fileInventory: LeaseArchiveFileInventoryService, private readonly filePurge: LeaseArchiveFilePurgeService) {}

  @Get(':archiveId/files')
  inventory(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) { return this.fileInventory.inventory(user, archiveId, propertyId); }

  @Post(':archiveId/file-purge')
  @RequirePermissions('lease.manage')
  purgeFiles(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Body() dto: PurgeArchivedLeaseFilesDto,
    @Headers('idempotency-key') key?: string,
  ) { return this.filePurge.purge(user, archiveId, dto, key); }

  @Get(':archiveId/file-purge-commands/:commandId')
  async filePurgeResult(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Param('commandId', new ParseUUIDPipe({ version: '4' })) commandId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) { return { data: await this.filePurge.read(user, archiveId, commandId, propertyId) }; }

  @Get(':archiveId/file-purge-commands')
  filePurgeHistory(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) { return this.filePurge.list(user, archiveId, propertyId, limit, offset); }

  @Post(':archiveId/file-purge-commands/:commandId/retry')
  @RequirePermissions('lease.manage')
  retryFilePurge(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Param('commandId', new ParseUUIDPipe({ version: '4' })) commandId: string,
    @Body() dto: RetryArchivedLeaseFilePurgeDto,
  ) { return this.filePurge.retry(user, archiveId, commandId, dto); }

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: LeaseArchiveQueryDto) {
    return this.archives.list(user, query);
  }

  @Get(':archiveId')
  detail(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    return this.archives.detail(user, archiveId, propertyId);
  }

  @Get(':archiveId/restoration-preview')
  @RequirePermissions('lease.manage')
  previewRestoration(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    return this.restoration.preview(user, archiveId, propertyId);
  }

  @Post(':archiveId/restore')
  @RequirePermissions('lease.manage')
  restore(
    @CurrentUser() user: UserAccessContext,
    @Param('archiveId', new ParseUUIDPipe({ version: '4' })) archiveId: string,
    @Body() dto: RestoreArchivedLeaseDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.restoration.restore(user, archiveId, dto, key);
  }
}
