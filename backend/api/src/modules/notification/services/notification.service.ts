import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import {
  NOTIFICATION_AUDIT_ACTIONS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_TEMPLATES,
  NotificationTemplateCode,
} from '../constants/notification.constants';
import { NotificationChannelRouter } from '../helpers/notification-channel-router';
import { NotificationTemplateRenderer } from '../helpers/notification-template-renderer';
import { NotificationDeliveryRepository } from '../repositories/notification-delivery.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import {
  AuditActorContext,
  CreateNotificationInput,
  NotificationRecord,
  NotificationRecipientContext,
  NotificationSkipReason,
  NotificationTemplateVariables,
} from '../types/notification.types';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationPreferenceService } from './notification-preference.service';

export type SendTemplateNotificationInput = {
  propertyId: string;
  recipient: NotificationRecipientContext;
  templateCode: NotificationTemplateCode;
  variables: NotificationTemplateVariables;
  metadata?: Record<string, unknown>;
  sourceEventType?: string;
  sourceResourceId?: string;
  correlationId?: string;
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly deliveryService: NotificationDeliveryService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly renderer: NotificationTemplateRenderer,
    private readonly router: NotificationChannelRouter,
    private readonly audit: AuditRepository,
  ) {}

  async create(input: CreateNotificationInput, auditContext?: AuditActorContext): Promise<NotificationRecord> {
    const settings = await this.notifications.settings(input.propertyId);
    const notification = await this.notifications.create({
      ...input,
      retentionDays: input.retentionDays ?? settings?.retentionDays ?? NOTIFICATION_DEFAULTS.retentionDays,
    });

    await this.audit.write({
      actorUserId: auditContext?.actorUserId,
      propertyId: notification.propertyId,
      action: NOTIFICATION_AUDIT_ACTIONS.create,
      resourceType: 'notification',
      resourceId: notification.id,
      afterData: {
        recipientUserId: notification.recipientUserId,
        notificationType: notification.notificationType,
        priority: notification.priority,
      },
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId ?? notification.correlationId ?? undefined,
    });

    return notification;
  }

  async sendTemplate(input: SendTemplateNotificationInput, auditContext?: AuditActorContext): Promise<NotificationRecord> {
    const template = NOTIFICATION_TEMPLATES[input.templateCode];
    if (!template) {
      throw new NotFoundException({ code: 'NOTIFICATION_TEMPLATE_NOT_FOUND', message: 'Notification template not found' });
    }

    const settings = await this.notifications.settings(input.propertyId);
    const rendered = this.renderer.render(input.templateCode, input.variables);
    const notification = await this.create(
      {
        propertyId: input.propertyId,
        recipientUserId: input.recipient.userId,
        notificationType: input.templateCode,
        priority: template.priority,
        title: rendered.title,
        body: rendered.body,
        metadata: input.metadata,
        sourceEventType: input.sourceEventType,
        sourceResourceId: input.sourceResourceId,
        correlationId: input.correlationId,
        retentionDays: settings?.retentionDays,
      },
      auditContext,
    );

    const preference = await this.preferenceService.getForUser(input.recipient.userId);
    const route = await this.router.route(
      template.priority,
      settings ?? {
        propertyId: input.propertyId,
        emailEnabled: true,
        whatsappEnabled: false,
        pushEnabled: false,
        digestEnabled: true,
        digestHour: 8,
        retentionDays: NOTIFICATION_DEFAULTS.retentionDays,
      },
      preference,
      input.recipient,
      template.emailEnabled,
    );

    if (route.email && input.recipient.email) {
      await this.deliveryService.queue(
        {
          notificationId: notification.id,
          channel: 'email',
          providerName: 'brevo',
          recipientAddress: input.recipient.email,
          subject: rendered.subject,
          contentSnapshot: rendered.htmlContent ?? rendered.textContent,
          maxAttempts: NOTIFICATION_DEFAULTS.maxDeliveryAttempts,
        },
        auditContext,
      );
    }

    for (const skipped of route.skipped) {
      await this.deliveryService.queue(
        {
          notificationId: notification.id,
          channel: skipped.channel,
          providerName: skipped.channel === 'email' ? 'brevo' : skipped.channel === 'whatsapp' ? 'fonnte' : 'web_push',
          deliveryStatus: 'skipped',
          recipientAddress: this.recipientAddressFor(input.recipient, skipped.channel),
          skipReason: skipped.reason as NotificationSkipReason,
        },
        auditContext,
      );
    }

    return notification;
  }

  async markRead(id: string, recipientUserId?: string, auditContext?: AuditActorContext): Promise<NotificationRecord> {
    const notification = await this.notifications.markRead(id, recipientUserId);
    if (!notification) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    }
    await this.audit.write({
      actorUserId: auditContext?.actorUserId ?? recipientUserId,
      propertyId: notification.propertyId,
      action: NOTIFICATION_AUDIT_ACTIONS.read,
      resourceType: 'notification',
      resourceId: notification.id,
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return notification;
  }

  async markAllReadForUser(userId: string, auditContext?: AuditActorContext): Promise<{ updatedCount: number }> {
    const updatedCount = await this.notifications.markAllReadForUser(userId);
    await this.audit.write({
      actorUserId: auditContext?.actorUserId ?? userId,
      action: NOTIFICATION_AUDIT_ACTIONS.read,
      resourceType: 'notification',
      afterData: { updatedCount },
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return { updatedCount };
  }

  async archive(id: string, recipientUserId?: string, auditContext?: AuditActorContext): Promise<NotificationRecord> {
    const notification = await this.notifications.archive(id, recipientUserId);
    if (!notification) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    }
    await this.audit.write({
      actorUserId: auditContext?.actorUserId ?? recipientUserId,
      propertyId: notification.propertyId,
      action: NOTIFICATION_AUDIT_ACTIONS.archive,
      resourceType: 'notification',
      resourceId: notification.id,
      resultStatus: 'success',
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      correlationId: auditContext?.correlationId,
    });
    return notification;
  }

  listForUser(userId: string, status?: NotificationRecord['notificationStatus'], limit?: number, offset?: number): Promise<NotificationRecord[]> {
    return this.notifications.listForUser(userId, status, limit, offset);
  }

  unreadCountForUser(userId: string): Promise<number> {
    return this.notifications.unreadCountForUser(userId);
  }

  deliveriesForNotification(notificationId: string) {
    return this.deliveries.listForNotification(notificationId);
  }

  private recipientAddressFor(recipient: NotificationRecipientContext, channel: 'email' | 'whatsapp' | 'push'): string {
    if (channel === 'email') {
      return recipient.email ?? 'missing-email';
    }
    if (channel === 'whatsapp') {
      return recipient.phone ?? 'missing-phone';
    }
    return 'future-push-subscription';
  }
}
