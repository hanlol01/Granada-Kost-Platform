import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FileService } from '../../file/file.service';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { AssignComplaintDto } from '../dto/assign-complaint.dto';
import { CancelComplaintDto } from '../dto/cancel-complaint.dto';
import { ListComplaintsQueryDto } from '../dto/list-complaints-query.dto';
import { ComplaintService } from '../services/complaint.service';
import { auditContext, scopedPropertyIds } from './complaint-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('complaint.manage')
@Controller('complaints')
export class ComplaintController {
  constructor(
    private readonly complaints: ComplaintService,
    private readonly properties: PropertyService,
    private readonly fileService: FileService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListComplaintsQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    if (propertyIds.length === 1) {
      return this.complaints.list(propertyIds[0], query.status, query.limit, query.offset);
    }
    return this.complaints.listForProperties(propertyIds, query.status, query.limit, query.offset);
  }

  @Get(':complaintId')
  async get(@CurrentUser() user: UserAccessContext, @Param('complaintId') complaintId: string) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return complaint;
  }

  /** Returns safe file metadata for a complaint's attachments (no storage_path). */
  @Get(':complaintId/files')
  async listFiles(@CurrentUser() user: UserAccessContext, @Param('complaintId') complaintId: string) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    const records = await this.complaints.listFileRecords(complaintId);
    return records.map((r) => this.fileService.toResponse(r));
  }

  @Post(':complaintId/acknowledge')
  async acknowledge(
    @CurrentUser() user: UserAccessContext,
    @Param('complaintId') complaintId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return this.complaints.acknowledge(complaintId, auditContext(user, request));
  }

  @Post(':complaintId/assign')
  async assign(
    @CurrentUser() user: UserAccessContext,
    @Param('complaintId') complaintId: string,
    @Body() dto: AssignComplaintDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return this.complaints.assign(complaintId, dto.assigned_to_user_id, auditContext(user, request));
  }

  @Post(':complaintId/resolve')
  async resolve(
    @CurrentUser() user: UserAccessContext,
    @Param('complaintId') complaintId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return this.complaints.resolve(complaintId, auditContext(user, request));
  }

  @Post(':complaintId/close')
  async close(
    @CurrentUser() user: UserAccessContext,
    @Param('complaintId') complaintId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return this.complaints.close(complaintId, auditContext(user, request));
  }

  @Post(':complaintId/reopen')
  async reopen(
    @CurrentUser() user: UserAccessContext,
    @Param('complaintId') complaintId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return this.complaints.reopen(complaintId, auditContext(user, request));
  }

  @Post(':complaintId/cancel')
  async cancel(
    @CurrentUser() user: UserAccessContext,
    @Param('complaintId') complaintId: string,
    @Body() dto: CancelComplaintDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const complaint = await this.complaints.get(complaintId);
    await this.properties.assertCanReadProperty(user, complaint.propertyId);
    return this.complaints.cancel(complaintId, dto.reason, auditContext(user, request));
  }
}
