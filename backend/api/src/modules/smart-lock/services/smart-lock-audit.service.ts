import { Injectable } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { SmartLockAccessLogRepository } from '../repositories/smart-lock-access-log.repository';
import {
  CreateSmartLockAccessLogInput,
  SmartLockAccessLogRecord,
  SmartLockAuditContext,
  SmartLockDeviceRecord,
} from '../types/smart-lock.types';

@Injectable()
export class SmartLockAuditService {
  constructor(
    private readonly audit: AuditRepository,
    private readonly accessLogs: SmartLockAccessLogRepository,
  ) {}

  async writeDomainAudit(input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    propertyId?: string;
    beforeData?: unknown;
    afterData?: unknown;
    resultStatus?: 'success' | 'failed' | 'denied';
    context?: SmartLockAuditContext;
  }): Promise<void> {
    await this.audit.write({
      actorUserId: input.context?.actorUserId,
      propertyId: input.propertyId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      beforeData: input.beforeData,
      afterData: input.afterData,
      resultStatus: input.resultStatus ?? 'success',
      ipAddress: input.context?.ipAddress,
      userAgent: input.context?.userAgent,
      correlationId: input.context?.correlationId,
    });
  }

  async writeAccessLog(device: SmartLockDeviceRecord, input: Omit<CreateSmartLockAccessLogInput, 'propertyId' | 'smartLockDeviceId' | 'roomId'>): Promise<SmartLockAccessLogRecord> {
    return this.accessLogs.record({
      ...input,
      propertyId: device.propertyId,
      smartLockDeviceId: device.id,
      roomId: device.roomId,
    });
  }
}
