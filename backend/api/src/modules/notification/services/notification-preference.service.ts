import { Injectable } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { NOTIFICATION_AUDIT_ACTIONS } from '../constants/notification.constants';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { AuditActorContext, NotificationPreferenceRecord, UpdateNotificationPreferenceInput } from '../types/notification.types';

@Injectable()
export class NotificationPreferenceService {
  constructor(
    private readonly preferences: NotificationPreferenceRepository,
    private readonly audit: AuditRepository,
  ) {}

  async getForUser(userId: string): Promise<NotificationPreferenceRecord> {
    return (await this.preferences.findByUserId(userId)) ?? this.preferences.defaultForUser(userId);
  }

  async update(
    userId: string,
    input: UpdateNotificationPreferenceInput,
    auditContext?: AuditActorContext,
  ): Promise<NotificationPreferenceRecord> {
    const before = await this.getForUser(userId);
    const after = await this.preferences.upsert(userId, input);
    await this.audit.write({
      actorUserId: auditContext?.actorUserId ?? userId,
      action: NOTIFICATION_AUDIT_ACTIONS.preferenceUpdate,
      resourceType: 'notification_preference',
      resourceId: after.id,
      beforeData: before,
      afterData: after,
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return after;
  }
}
