import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { NOTIFICATION_AUDIT_ACTIONS } from '../constants/notification.constants';
import { NotificationRetryHelper } from '../helpers/notification-retry.helper';
import { NotificationDeliveryRepository } from '../repositories/notification-delivery.repository';
import {
  AuditActorContext,
  CreateNotificationDeliveryInput,
  NotificationChannel,
  NotificationDeliveryRecord,
  NotificationDeliveryStatus,
  NotificationSkipReason,
} from '../types/notification.types';

@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly retry: NotificationRetryHelper,
    private readonly audit: AuditRepository,
  ) {}

  async queue(input: CreateNotificationDeliveryInput, auditContext?: AuditActorContext): Promise<NotificationDeliveryRecord> {
    const delivery = await this.deliveries.create(input);
    await this.audit.write({
      actorUserId: auditContext?.actorUserId,
      action: NOTIFICATION_AUDIT_ACTIONS.deliveryQueued,
      resourceType: 'notification_delivery',
      resourceId: delivery.id,
      afterData: { notificationId: delivery.notificationId, channel: delivery.channel, providerName: delivery.providerName },
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return delivery;
  }

  async markSent(id: string, providerMessageId?: string, auditContext?: AuditActorContext): Promise<NotificationDeliveryRecord> {
    const delivery = await this.deliveries.markDelivered(id, providerMessageId);
    if (!delivery) {
      throw new NotFoundException({ code: 'NOTIFICATION_DELIVERY_NOT_FOUND', message: 'Notification delivery not found' });
    }
    await this.audit.write({
      actorUserId: auditContext?.actorUserId,
      action: NOTIFICATION_AUDIT_ACTIONS.deliverySent,
      resourceType: 'notification_delivery',
      resourceId: delivery.id,
      afterData: { providerMessageId: delivery.providerMessageId },
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return delivery;
  }

  async markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    auditContext?: AuditActorContext,
  ): Promise<NotificationDeliveryRecord> {
    const current = await this.deliveries.findById(id);
    if (!current) {
      throw new NotFoundException({ code: 'NOTIFICATION_DELIVERY_NOT_FOUND', message: 'Notification delivery not found' });
    }

    const deadLettered = this.retry.shouldDeadLetter(current);
    const nextRetryAt = deadLettered ? null : this.retry.nextRetryAt(current.attemptCount);
    const delivery = await this.deliveries.markFailed(id, errorCode, errorMessage, nextRetryAt, deadLettered);
    if (!delivery) {
      throw new NotFoundException({ code: 'NOTIFICATION_DELIVERY_NOT_FOUND', message: 'Notification delivery not found' });
    }

    await this.audit.write({
      actorUserId: auditContext?.actorUserId,
      action: NOTIFICATION_AUDIT_ACTIONS.deliveryFailed,
      resourceType: 'notification_delivery',
      resourceId: delivery.id,
      afterData: { errorCode, retryable: !deadLettered, nextRetryAt },
      resultStatus: 'failed',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return delivery;
  }

  markSkipped(id: string, reason: NotificationSkipReason): Promise<NotificationDeliveryRecord | null> {
    return this.deliveries.markSkipped(id, reason);
  }

  async get(id: string): Promise<NotificationDeliveryRecord> {
    const delivery = await this.deliveries.findById(id);
    if (!delivery) {
      throw new NotFoundException({ code: 'NOTIFICATION_DELIVERY_NOT_FOUND', message: 'Notification delivery not found' });
    }
    return delivery;
  }

  list(
    filters: {
      propertyId?: string;
      propertyIds?: string[];
      status?: NotificationDeliveryStatus;
      channel?: NotificationChannel;
    },
    limit?: number,
    offset?: number,
  ) {
    return this.deliveries.list(filters, limit, offset);
  }

  deadLetters(filters: { propertyId?: string; propertyIds?: string[] }, limit?: number, offset?: number) {
    return this.deliveries.list({ ...filters, deadLetterOnly: true }, limit, offset);
  }

  propertyIdForDelivery(id: string): Promise<string | null> {
    return this.deliveries.propertyIdForDelivery(id);
  }
}
