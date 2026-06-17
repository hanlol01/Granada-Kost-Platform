import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { CreateResidentDto } from './dto/create-resident.dto';
import { ListResidentsQueryDto } from './dto/list-residents-query.dto';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { ResidentRepository } from './repositories/resident.repository';
import { sanitizeResidentForAudit } from './resident-audit.util';

@Injectable()
export class ResidentService {
  constructor(
    private readonly residents: ResidentRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListResidentsQueryDto) {
    if (query.property_id) {
      await this.properties.assertCanReadProperty(user, query.property_id);
    }
    return this.residents.list(query, this.scopeIds(user));
  }

  async get(user: UserAccessContext, residentId: string) {
    const resident = await this.requireResident(residentId);
    await this.properties.assertCanReadProperty(user, resident.propertyId);
    return resident;
  }

  async create(user: UserAccessContext, dto: CreateResidentDto, context: RequestAuditContext) {
    await this.assertCanMutateProperty(user, dto.property_id);
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

  private scopeIds(user: UserAccessContext): string[] | undefined {
    return user.roles.includes('owner') ? undefined : user.propertyIds;
  }

  private async assertCanMutateProperty(user: UserAccessContext, propertyId: string): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate operational data',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }
}
