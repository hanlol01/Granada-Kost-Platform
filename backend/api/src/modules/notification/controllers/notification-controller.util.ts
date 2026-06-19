import { NotFoundException } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import {
  NotificationDeliveryRecord,
  NotificationPreferenceRecord,
  NotificationRecord,
} from '../types/notification.types';

export function auditContext(user: UserAccessContext, request: RequestWithCorrelationId) {
  return {
    actorUserId: user.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

export async function scopedPropertyIds(
  properties: PropertyService,
  user: UserAccessContext,
  propertyId?: string,
): Promise<string[]> {
  if (propertyId) {
    await properties.assertCanReadProperty(user, propertyId);
    return [propertyId];
  }

  if (user.roles.includes('owner')) {
    return (await properties.list(user)).map((property) => property.id);
  }

  return user.propertyIds;
}

export async function assertCanReadDeliveryProperty(
  properties: PropertyService,
  user: UserAccessContext,
  propertyId: string | null,
) {
  if (!propertyId) {
    throw new NotFoundException({
      code: 'NOTIFICATION_DELIVERY_NOT_FOUND',
      message: 'Notification delivery not found',
    });
  }

  await properties.assertCanReadProperty(user, propertyId);
}

export function toNotificationResponse(notification: NotificationRecord) {
  return {
    id: notification.id,
    property_id: notification.propertyId,
    notification_type: notification.notificationType,
    notification_status: notification.notificationStatus,
    priority: notification.priority,
    title: notification.title,
    body: notification.body,
    metadata: notification.metadata,
    source_event_type: notification.sourceEventType,
    source_resource_id: notification.sourceResourceId,
    read_at: notification.readAt,
    expires_at: notification.expiresAt,
    created_at: notification.createdAt,
  };
}

export function toNotificationPreferenceResponse(preference: NotificationPreferenceRecord) {
  return {
    id: preference.id,
    email_enabled: preference.emailEnabled,
    whatsapp_enabled: preference.whatsappEnabled,
    push_enabled: preference.pushEnabled,
    digest_mode: preference.digestMode,
    quiet_hours_start: preference.quietHoursStart,
    quiet_hours_end: preference.quietHoursEnd,
    created_at: preference.createdAt,
    updated_at: preference.updatedAt,
  };
}

export function toNotificationDeliveryResponse(delivery: NotificationDeliveryRecord) {
  return {
    id: delivery.id,
    notification_id: delivery.notificationId,
    channel: delivery.channel,
    provider_name: delivery.providerName,
    delivery_status: delivery.deliveryStatus,
    recipient_address_masked: maskRecipient(delivery.recipientAddress),
    subject: delivery.subject,
    attempt_count: delivery.attemptCount,
    max_attempts: delivery.maxAttempts,
    last_error_code: delivery.lastErrorCode,
    last_error_message: delivery.lastErrorMessage,
    provider_message_id: delivery.providerMessageId,
    skip_reason: delivery.skipReason,
    next_retry_at: delivery.nextRetryAt,
    delivered_at: delivery.deliveredAt,
    created_at: delivery.createdAt,
    updated_at: delivery.updatedAt,
  };
}

function maskRecipient(address: string): string {
  if (address.includes('@')) {
    const [name, domain] = address.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }

  if (address.startsWith('http')) {
    return 'push-endpoint';
  }

  return `${address.slice(0, 4)}***${address.slice(-3)}`;
}
