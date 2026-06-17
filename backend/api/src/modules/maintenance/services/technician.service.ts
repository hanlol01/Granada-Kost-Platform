import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateTechnicianProfileInput, TechnicianProfileRecord } from '../types/maintenance.types';
import { TechnicianProfileRepository } from '../repositories/technician-profile.repository';

@Injectable()
export class TechnicianService {
  constructor(private readonly technicians: TechnicianProfileRepository) {}

  list(propertyId: string, activeOnly = true): Promise<TechnicianProfileRecord[]> {
    return this.technicians.list(propertyId, activeOnly);
  }

  findByUser(propertyId: string, userId: string): Promise<TechnicianProfileRecord | null> {
    return this.technicians.findByUser(propertyId, userId);
  }

  async ensureActive(propertyId: string, userId: string): Promise<TechnicianProfileRecord> {
    const technician = await this.technicians.findByUser(propertyId, userId);
    if (!technician || !technician.isActive) {
      throw new BadRequestException({ code: 'TECHNICIAN_NOT_ACTIVE', message: 'Technician is not active for this property' });
    }
    return technician;
  }

  upsert(input: CreateTechnicianProfileInput): Promise<TechnicianProfileRecord> {
    return this.technicians.upsert(input);
  }
}
