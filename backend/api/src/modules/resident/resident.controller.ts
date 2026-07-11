import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { acceptsAdminUxV2, v2Data, v2List } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateResidentDto } from './dto/create-resident.dto';
import { ListResidentsQueryDto } from './dto/list-residents-query.dto';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { ResidentService } from './resident.service';
import { ResidentRecord } from './types/resident.types';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('residents')
export class ResidentController {
  constructor(private readonly residents: ResidentService) {}

  @Get()
  @RequirePermissions('resident.read')
  async list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListResidentsQueryDto,
    @Headers('accept') accept?: string,
  ) {
    const records = await this.residents.list(user, query);
    if (!acceptsAdminUxV2(accept)) {
      return records;
    }
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    return v2List(
      records.slice(offset, offset + limit).map((record) => this.toV2Resident(record, true)),
      limit,
      offset,
      records.length,
    );
  }

  @Post()
  @RequirePermissions('resident.manage')
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateResidentDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const resident = await this.residents.create(user, dto, this.contextFromRequest(request));
    return acceptsAdminUxV2(request.headers.accept)
      ? v2Data(this.toV2Resident(resident))
      : resident;
  }

  @Get(':residentId/ktp-document')
  @RequirePermissions('resident.read')
  ktpDocument(@CurrentUser() user: UserAccessContext, @Param('residentId') residentId: string) {
    return this.residents.ktpDocument(user, residentId);
  }

  @Get(':residentId')
  @RequirePermissions('resident.read')
  async get(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Headers('accept') accept?: string,
  ) {
    const resident = await this.residents.get(user, residentId);
    return acceptsAdminUxV2(accept) ? v2Data(this.toV2Resident(resident)) : resident;
  }

  @Patch(':residentId')
  @RequirePermissions('resident.manage')
  async update(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Body() dto: UpdateResidentDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const resident = await this.residents.update(
      user,
      residentId,
      dto,
      this.contextFromRequest(request),
    );
    return acceptsAdminUxV2(request.headers.accept)
      ? v2Data(this.toV2Resident(resident))
      : resident;
  }

  @Patch(':residentId/status')
  @RequirePermissions('resident.manage')
  updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Body() dto: UpdateResidentStatusDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.residents.updateStatus(user, residentId, dto, this.contextFromRequest(request));
  }

  private toV2Resident(resident: ResidentRecord, list = false) {
    const base = {
      id: resident.id,
      property_id: resident.propertyId,
      user_id: resident.userId,
      full_name: resident.fullName,
      phone: resident.phone,
      email: resident.email,
      gender: resident.gender,
      resident_status: resident.residentStatus,
      active_lease: null,
      created_at: resident.createdAt,
      updated_at: resident.updatedAt,
    };
    if (list) {
      return {
        ...base,
        ktp_number_masked: resident.ktpNumber,
        date_of_birth: resident.dateOfBirth,
        profile_photo_file_id: null,
      };
    }
    return {
      ...base,
      ktp_number: resident.ktpNumber,
      date_of_birth: resident.dateOfBirth,
      place_of_birth: resident.placeOfBirth,
      address: resident.address,
      emergency_phone: resident.emergencyPhone,
      emergency_contacts: resident.emergencyContacts.map((contact) => ({
        id: contact.id,
        contact_name: contact.contactName,
        relationship: contact.relationship,
        phone: contact.phone,
      })),
      ktp_document: resident.ktpFileId
        ? {
            file_id: resident.ktpFileId,
            content_url: '/api/v1/files/' + resident.ktpFileId + '/content',
          }
        : null,
      profile_photo_file_id: resident.profilePhotoFileId,
    };
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
