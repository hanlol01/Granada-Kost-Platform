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
import { ProvisionResidentAccountDto } from './dto/provision-resident-account.dto';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { ResidentService } from './resident.service';
import { ResidentAccountService } from './resident-account.service';
import { ResidentRecord } from './types/resident.types';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('residents')
export class ResidentController {
  constructor(
    private readonly residents: ResidentService,
    private readonly accounts: ResidentAccountService,
  ) {}

  @Get()
  @RequirePermissions('resident.read')
  async list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListResidentsQueryDto,
    @Headers('accept') accept?: string,
  ) {
    if (!acceptsAdminUxV2(accept)) {
      return this.residents.list(user, query);
    }
    const { records, total } = await this.residents.listPage(user, query);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    return v2List(
      records.map((record) => this.toV2Resident(record, true)),
      limit,
      offset,
      total,
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

  @Post(':residentId/account')
  @RequirePermissions('resident.manage')
  async provisionAccount(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() _dto: ProvisionResidentAccountDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const result = await this.accounts.provision(
      user,
      residentId,
      _dto.property_id,
      idempotencyKey,
      this.contextFromRequest(request),
    );
    return v2Data({
      status: result.status,
      temporary_password: result.temporaryPassword,
    });
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
    if (list) {
      return {
        id: resident.id,
        property_id: resident.propertyId,
        full_name: resident.fullName,
        university: resident.university,
        room_number: resident.roomNumber,
        lease_start: resident.leaseStart,
        lease_end: resident.leaseEnd,
        lease_authority_count: resident.leaseAuthorityCount,
        account_status: resident.accountStatus,
        resident_status: resident.residentStatus,
        created_at: resident.createdAt,
        updated_at: resident.updatedAt,
      };
    }
    const base = {
      id: resident.id,
      property_id: resident.propertyId,
      user_id: resident.userId,
      full_name: resident.fullName,
      phone: resident.phone,
      email: resident.email,
      gender: resident.gender,
      account_status: resident.accountStatus,
      resident_status: resident.residentStatus,
      active_lease: null,
      created_at: resident.createdAt,
      updated_at: resident.updatedAt,
    };
    return {
      ...base,
      ktp_number: resident.ktpNumber,
      date_of_birth: resident.dateOfBirth,
      place_of_birth: resident.placeOfBirth,
      address: resident.address,
      university: resident.university,
      faculty: resident.faculty,
      major: resident.major,
      cohort: resident.cohort,
      instagram: resident.instagram,
      parent_name: resident.parentName,
      parent_phone: resident.parentPhone,
      marital_status: resident.maritalStatus,
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
