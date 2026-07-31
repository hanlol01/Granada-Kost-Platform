import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { FileRepository } from '../file/file.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { CreateResidentDto } from './dto/create-resident.dto';
import { ListResidentsQueryDto } from './dto/list-residents-query.dto';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { ResidentRepository } from './repositories/resident.repository';
import { sanitizeResidentForAudit } from './resident-audit.util';
import { ResidentRecord } from './types/resident.types';

export function selectSingleResidentContext<T>(contexts: readonly T[]): T | null {
  if (contexts.length > 1) {
    throw new ConflictException({
      code: 'RESIDENT_CONTEXT_AMBIGUOUS',
      message: 'Multiple active resident contexts are available',
    });
  }
  return contexts[0] ?? null;
}

@Injectable()
export class ResidentService {
  constructor(
    private readonly residents: ResidentRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly files: FileRepository,
  ) {}

  async list(user: UserAccessContext, query: ListResidentsQueryDto) {
    if (query.property_id) {
      await this.properties.assertCanReadProperty(user, query.property_id);
    }
    const scopeIds = this.scopeIds(user);
    if (scopeIds?.length === 0) return [];
    const records = await this.residents.list(query, scopeIds);
    return records.map((record) => this.maskForList(record));
  }

  async listPage(user: UserAccessContext, query: ListResidentsQueryDto) {
    if (query.property_id) {
      await this.properties.assertCanReadProperty(user, query.property_id);
    }
    const scopeIds = this.scopeIds(user);
    if (scopeIds?.length === 0) return { records: [], total: 0 };
    const [records, total] = await Promise.all([
      this.residents.list(query, scopeIds),
      this.residents.count(query, scopeIds),
    ]);
    return { records: records.map((record) => this.maskForList(record)), total };
  }

  async get(user: UserAccessContext, residentId: string) {
    const resident = await this.requireResident(residentId);
    await this.properties.assertCanReadProperty(user, resident.propertyId);
    return resident;
  }

  async myContext(userId: string) {
    return selectSingleResidentContext(await this.residents.findActiveContextsForUser(userId));
  }

  async listPropertyOwnerSummary(user: UserAccessContext, propertyId: string) {
    await this.properties.assertCanReadProperty(user, propertyId);
    return this.residents.listPropertyOwnerSummary(propertyId);
  }

  async create(user: UserAccessContext, dto: CreateResidentDto, context: RequestAuditContext) {
    await this.assertCanMutateProperty(user, dto.property_id);
    await this.assertResidentFiles(dto.property_id, dto.ktp_file_id, dto.profile_photo_file_id);
    const resident = await this.residents.create(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: resident.propertyId,
      action: 'resident.create',
      resourceType: 'resident',
      resourceId: resident.id,
      afterData: sanitizeResidentForAudit(resident),
      resultStatus: 'success',
      ...context,
    });
    return resident;
  }

  async update(
    user: UserAccessContext,
    residentId: string,
    dto: UpdateResidentDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireResident(residentId);
    await this.assertCanMutateProperty(user, before.propertyId);
    await this.assertResidentFiles(before.propertyId, dto.ktp_file_id, dto.profile_photo_file_id);
    const updated = await this.residents.update(residentId, dto, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'RESIDENT_NOT_FOUND', message: 'Resident not found' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'resident.update',
      resourceType: 'resident',
      resourceId: residentId,
      beforeData: sanitizeResidentForAudit(before),
      afterData: sanitizeResidentForAudit(updated),
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async updateStatus(
    user: UserAccessContext,
    residentId: string,
    dto: UpdateResidentStatusDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireResident(residentId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.residents.updateStatus(residentId, dto.status, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'RESIDENT_NOT_FOUND', message: 'Resident not found' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'resident.status_update',
      resourceType: 'resident',
      resourceId: residentId,
      beforeData: sanitizeResidentForAudit(before),
      afterData: sanitizeResidentForAudit(updated),
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async requireResident(residentId: string) {
    const resident = await this.residents.findById(residentId);
    if (!resident) {
      throw new NotFoundException({ code: 'RESIDENT_NOT_FOUND', message: 'Resident not found' });
    }
    return resident;
  }

  async ktpDocument(user: UserAccessContext, residentId: string) {
    const resident = await this.requireResident(residentId);
    await this.properties.assertCanReadProperty(user, resident.propertyId);
    if (!user.roles.some((role) => ['owner', 'manager', 'admin'].includes(role))) {
      throw new ForbiddenException({
        code: 'KTP_ACCESS_DENIED',
        message: 'KTP document access is restricted.',
      });
    }
    if (!resident.ktpFileId) {
      throw new NotFoundException({
        code: 'KTP_DOCUMENT_NOT_FOUND',
        message: 'Resident has no KTP document.',
      });
    }
    const file = await this.files.findById(resident.ktpFileId);
    if (
      !file ||
      file.isDeleted ||
      file.propertyId !== resident.propertyId ||
      file.filePurpose !== 'ktp'
    ) {
      throw new NotFoundException({
        code: 'KTP_DOCUMENT_NOT_FOUND',
        message: 'KTP document is unavailable.',
      });
    }
    return {
      data: {
        id: file.id,
        file_purpose: file.filePurpose,
        mime_type: file.mimeType,
        content_url: '/api/v1/files/' + file.id + '/content',
      },
    };
  }

  private async assertResidentFiles(
    propertyId: string,
    ktpFileId?: string,
    profilePhotoFileId?: string,
  ): Promise<void> {
    if (ktpFileId) {
      await this.assertResidentFile(ktpFileId, propertyId, 'ktp', false);
    }
    if (profilePhotoFileId) {
      await this.assertResidentFile(profilePhotoFileId, propertyId, 'profile_photo', true);
    }
  }

  private async assertResidentFile(
    fileId: string,
    propertyId: string,
    purpose: 'ktp' | 'profile_photo',
    imageOnly: boolean,
  ): Promise<void> {
    const file = await this.files.findById(fileId);
    if (
      !file ||
      file.isDeleted ||
      file.propertyId !== propertyId ||
      file.filePurpose !== purpose ||
      (imageOnly && !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType))
    ) {
      throw new BadRequestException({
        code: 'RESIDENT_FILE_INVALID',
        message: 'Resident file must be active, purpose-matched, and in the same property.',
      });
    }
  }

  private maskForList(resident: ResidentRecord): ResidentRecord {
    return {
      ...resident,
      ktpNumber: this.maskKtp(resident.ktpNumber),
      ktpFileId: null,
      profilePhotoFileId: null,
    };
  }

  private maskKtp(value: string | null): string | null {
    if (!value) return null;
    return value.slice(0, 4) + '********' + value.slice(-4);
  }

  private scopeIds(user: UserAccessContext): string[] | undefined {
    return user.roles.includes('owner') ? undefined : user.propertyIds;
  }

  private async assertCanMutateProperty(
    user: UserAccessContext,
    propertyId: string,
  ): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate operational data',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }
}
