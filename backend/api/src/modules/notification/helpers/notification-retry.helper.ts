import { Injectable } from '@nestjs/common';
import { NOTIFICATION_DEFAULTS } from '../constants/notification.constants';
import { NotificationDeliveryRecord } from '../types/notification.types';

@Injectable()
export class NotificationRetryHelper {
  shouldDeadLetter(delivery: Pick<NotificationDeliveryRecord, 'attemptCount' | 'maxAttempts'>): boolean {
    return delivery.attemptCount + 1 >= delivery.maxAttempts;
  }

  nextRetryAt(attemptCount: number, baseDelaySeconds = 60): Date {
    const boundedAttempt = Math.min(Math.max(attemptCount, 0), NOTIFICATION_DEFAULTS.maxDeliveryAttempts);
    const delaySeconds = baseDelaySeconds * 2 ** boundedAttempt;
    return new Date(Date.now() + delaySeconds * 1000);
  }
}
