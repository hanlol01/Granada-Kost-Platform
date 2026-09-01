import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { CreateUniversityDto } from './dto/create-university.dto';
import { ListUniversitiesQueryDto } from './dto/list-universities-query.dto';
import { UniversityRepository } from './repositories/university.repository';

@Injectable()
export class UniversityService {
  constructor(
    private readonly universities: UniversityRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListUniversitiesQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const records = await this.universities.list(
      query.property_id,
      query.search,
      query.limit ?? 100,
    );
    return {
      records,
      total: records.length,
      limit: query.limit ?? 100,
      offset: 0,
    };
  }

  async create(
    user: UserAccessContext,
    propertyId: string,
    dto: CreateUniversityDto,
    context: RequestAuditContext,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const name = dto.name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 160) {
      throw new BadRequestException({
        code: 'UNIVERSITY_NAME_INVALID',
        message: 'Nama universitas harus berisi 2 sampai 160 karakter.',
      });
    }
    const result = await this.universities.findOrCreate(propertyId, name, user.id);
    if (result.created) {
      await this.audit.write({
        actorUserId: user.id,
        propertyId,
        action: 'resident.university_create',
        resourceType: 'property_university',
        resourceId: result.record.id,
        afterData: { name: result.record.name },
        resultStatus: 'success',
        ...context,
      });
    }
    return result.record;
  }
}
