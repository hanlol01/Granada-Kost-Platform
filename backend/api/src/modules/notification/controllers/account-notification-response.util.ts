import { AccountNotificationCenterService } from '../services/account-notification-center.service';

type AccountItem = Awaited<ReturnType<AccountNotificationCenterService['list']>>['items'][number];
export function toLegacyNotification(item: AccountItem) {
  return {
    id: item.id,
    property_id: item.propertyId,
    notification_type: item.notificationType,
    notification_status: item.status,
    priority: item.priority,
    title: item.title,
    body: item.body,
    read_at: item.readAt,
    created_at: item.createdAt,
    expires_at: item.expiresAt,
    deep_link: item.relatedHref,
    metadata: null,
    source_event_type: null,
    source_resource_id: null,
  };
}
