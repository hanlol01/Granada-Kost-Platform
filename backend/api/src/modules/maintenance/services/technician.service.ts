import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateInternalTechnicianInput,
  CreateTechnicianProfileInput,
  TechnicianProfileRecord,
  TechnicianReferenceRecord,
} from '../types/maintenance.types';
import { TechnicianProfileRepository } from '../repositories/technician-profile.repository';

@Injectable()
export class TechnicianService {
  constructor(private readonly technicians: TechnicianProfileRepository) {}

  list(propertyId: string, activeOnly = true): Promise<TechnicianProfileRecord[]> {
    return this.technicians.list(propertyId, activeOnly);
  }

  listReferences(propertyId: string): Promise<TechnicianReferenceRecord[]> {
    return this.technicians.listReferences(propertyId);
  }

  async createInternal(input: CreateInternalTechnicianInput): Promise<TechnicianReferenceRecord> {
    const displayName = input.displayName.trim();
    const skillTags = input.skillTags.trim();
    if (!displayName || !skillTags) {
      throw new BadRequestException({
        code: 'TECHNICIAN_PROFILE_FIELDS_REQUIRED',
        message: 'Technician name and work skills are required',
      });
    }
    return this.technicians.createInternal({ ...input, displayName, skillTags });
  }

  async setActive(
    propertyId: string,
    profileId: string,
    isActive: boolean,
    actorUserId: string,
  ): Promise<TechnicianReferenceRecord> {
    const technician = await this.technicians.setActive(
      propertyId,
      profileId,
      isActive,
      actorUserId,
    );
    if (!technician) {
      throw new NotFoundException({
        code: 'TECHNICIAN_PROFILE_NOT_FOUND',
        message: 'Technician profile was not found for this property',
      });
    }
    return technician;
  }

  findByUser(propertyId: string, userId: string): Promise<TechnicianProfileRecord | null> {
    return this.technicians.findByUser(propertyId, userId);
  }

  async ensureActive(propertyId: string, userId: string): Promise<TechnicianProfileRecord> {
    const technician = await this.technicians.findByUser(propertyId, userId);
    if (!technician || !technician.isActive) {
      throw new BadRequestException({
        code: 'TECHNICIAN_NOT_ACTIVE',
        message: 'Technician is not active for this property',
      });
    }
    return technician;
  }

  upsert(input: CreateTechnicianProfileInput): Promise<TechnicianProfileRecord> {
    return this.technicians.upsert(input);
  }
}
