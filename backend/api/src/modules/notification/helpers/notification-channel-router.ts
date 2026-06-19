import { Injectable } from '@nestjs/common';
import {
  NotificationPreferenceRecord,
  NotificationPriority,
  NotificationRecipientContext,
  NotificationSettingsRecord,
} from '../types/notification.types';
import { NotificationQuotaHelper } from './notification-quota.helper';

export type NotificationRouteDecision = {
  email: boolean;
  whatsapp: boolean;
  push: boolean;
  skipped: Array<{ channel: 'email' | 'whatsapp' | 'push'; reason: string }>;
};

@Injectable()
export class NotificationChannelRouter {
  constructor(private readonly quota: NotificationQuotaHelper) {}

  async route(
    priority: NotificationPriority,
    settings: NotificationSettingsRecord,
    preference: NotificationPreferenceRecord,
    recipient: NotificationRecipientContext,
    templateAllowsEmail: boolean,
  ): Promise<NotificationRouteDecision> {
    const skipped: NotificationRouteDecision['skipped'] = [];
    const emailAllowedByPreference = priority === 'urgent' || preference.emailEnabled;
    const emailAllowedByQuota = await this.quota.canUseBrevo(priority);
    const email =
      templateAllowsEmail &&
      settings.emailEnabled &&
      emailAllowedByPreference &&
      emailAllowedByQuota &&
      recipient.userStatus === 'active' &&
      Boolean(recipient.email);

    if (!email && templateAllowsEmail) {
      skipped.push({ channel: 'email', reason: this.emailSkipReason(settings, preference, recipient, emailAllowedByQuota) });
    }

    const whatsapp = false;
    if (settings.whatsappEnabled && preference.whatsappEnabled) {
      skipped.push({ channel: 'whatsapp', reason: 'provider_disabled' });
    }

    const push = false;
    if (settings.pushEnabled && preference.pushEnabled) {
      skipped.push({ channel: 'push', reason: 'provider_disabled' });
    }

    return { email, whatsapp, push, skipped };
  }

  private emailSkipReason(
    settings: NotificationSettingsRecord,
    preference: NotificationPreferenceRecord,
    recipient: NotificationRecipientContext,
    quotaAvailable: boolean,
  ): string {
    if (recipient.userStatus !== 'active') {
      return 'user_inactive';
    }
    if (!settings.emailEnabled) {
      return 'channel_disabled';
    }
    if (!preference.emailEnabled) {
      return 'preference_disabled';
    }
    if (!recipient.email) {
      return 'invalid_recipient';
    }
    if (!quotaAvailable) {
      return 'quota_exhausted';
    }
    return 'provider_disabled';
  }
}
