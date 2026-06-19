export type NotificationStatus = 'unread' | 'read' | 'archived';
export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low';
export type NotificationChannel = 'email' | 'whatsapp' | 'push';
export type NotificationProviderName = 'brevo' | 'fonnte' | 'web_push';
export type NotificationDeliveryStatus = 'pending' | 'sending' | 'delivered' | 'failed' | 'dead_lettered' | 'skipped';
export type NotificationSkipReason =
  | 'quota_exhausted'
  | 'preference_disabled'
  | 'invalid_recipient'
  | 'channel_disabled'
  | 'deferred_to_digest'
  | 'provider_disabled'
  | 'user_inactive';

export type NotificationRecord = {
  id: string;
  propertyId: string;
  recipientUserId: string;
  notificationType: string;
  notificationStatus: NotificationStatus;
  priority: NotificationPriority;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  sourceEventType: string | null;
  sourceResourceId: string | null;
  correlationId: string | null;
  readAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type NotificationDeliveryRecord = {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  providerName: NotificationProviderName;
  deliveryStatus: NotificationDeliveryStatus;
  recipientAddress: string;
  subject: string | null;
  contentSnapshot: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  providerMessageId: string | null;
  skipReason: NotificationSkipReason | null;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationPreferenceRecord = {
  id: string;
  userId: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  digestMode: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationSettingsRecord = {
  propertyId: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  digestEnabled: boolean;
  digestHour: number;
  retentionDays: number;
};

export type CreateNotificationInput = {
  propertyId: string;
  recipientUserId: string;
  notificationType: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  sourceEventType?: string;
  sourceResourceId?: string;
  correlationId?: string;
  retentionDays?: number;
};

export type CreateNotificationDeliveryInput = {
  notificationId: string;
  channel: NotificationChannel;
  providerName: NotificationProviderName;
  deliveryStatus?: NotificationDeliveryStatus;
  recipientAddress: string;
  subject?: string;
  contentSnapshot?: string;
  maxAttempts?: number;
  skipReason?: NotificationSkipReason;
  nextRetryAt?: Date;
};

export type UpdateNotificationPreferenceInput = {
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
  pushEnabled?: boolean;
  digestMode?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
};

export type AuditActorContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type NotificationTemplateVariables = Record<string, string | number | boolean | null | undefined>;

export type RenderedNotificationTemplate = {
  title: string;
  body: string;
  subject?: string;
  htmlContent?: string;
  textContent: string;
};

export type ProviderSendRequest = {
  channel: NotificationChannel;
  providerName: NotificationProviderName;
  recipientAddress: string;
  subject?: string;
  htmlContent?: string;
  textContent: string;
  metadata?: Record<string, string>;
};

export type ProviderSendResult = {
  success: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
};

export type NotificationRecipientContext = {
  userId: string;
  propertyId: string;
  email?: string | null;
  phone?: string | null;
  userStatus: 'active' | 'inactive' | 'suspended';
};
