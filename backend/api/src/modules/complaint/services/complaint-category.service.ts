import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { COMPLAINT_AUDIT_ACTIONS } from '../constants/complaint.constants';
import { ComplaintCategoryRepository } from '../repositories/complaint-category.repository';
import { AuditActorContext, ComplaintCategoryRecord, CreateComplaintCategoryInput } from '../types/complaint.types';

@Injectable()
export class ComplaintCategoryService {
  constructor(
    private readonly categories: ComplaintCategoryRepository,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyId: string, includeInactive = false): Promise<ComplaintCategoryRecord[]> {
    return this.categories.list(propertyId, includeInactive);
  }

  findByCode(propertyId: string, normalizedCode: string): Promise<ComplaintCategoryRecord | null> {
    return this.categories.findByCode(propertyId, normalizedCode);
  }

  async get(categoryId: string): Promise<ComplaintCategoryRecord> {
    const category = await this.categories.findById(categoryId);
    if (!category) {
      throw new NotFoundException({ code: 'COMPLAINT_CATEGORY_NOT_FOUND', message: 'Complaint category not found' });
    }
    return category;
  }

  async create(input: CreateComplaintCategoryInput, context: AuditActorContext = {}): Promise<ComplaintCategoryRecord> {
    const category = await this.categories.create(input);
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: category.propertyId,
      action: COMPLAINT_AUDIT_ACTIONS.create,
      resourceType: 'complaint_category',
      resourceId: category.id,
      afterData: {
        id: category.id,
        normalizedCode: category.normalizedCode,
        defaultPriority: category.defaultPriority,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
    return category;
  }
}
