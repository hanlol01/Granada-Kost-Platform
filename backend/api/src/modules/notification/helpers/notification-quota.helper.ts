import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { NOTIFICATION_DEFAULTS } from '../constants/notification.constants';
import { NotificationPriority } from '../types/notification.types';

@Injectable()
export class NotificationQuotaHelper {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canUseBrevo(priority: NotificationPriority, date = new Date()): Promise<boolean> {
    if (priority === 'urgent') {
      return true;
    }

    const used = await this.dailyBrevoUsed(date);
    const limit = this.dailyLimit();
    const urgentReserve = Math.ceil(limit * 0.1);
    const highReserve = Math.ceil(limit * 0.33);

    if (used >= limit) {
      return false;
    }
    if (priority === 'high') {
      return used < limit - urgentReserve;
    }
    return used < limit - urgentReserve - highReserve;
  }

  async incrementBrevoUsage(date = new Date()): Promise<number> {
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    const key = this.brevoDailyKey(date);
    const value = await client.incr(key);
    await client.expire(key, 60 * 60 * 48);
    return value;
  }

  async dailyBrevoUsed(date = new Date()): Promise<number> {
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    const value = await client.get(this.brevoDailyKey(date));
    return Number(value ?? 0);
  }

  dailyLimit(): number {
    return Number(this.config.get<number>('notification.brevoDailyLimit') ?? NOTIFICATION_DEFAULTS.brevoDailyLimit);
  }

  private brevoDailyKey(date: Date): string {
    return `brevo:daily:${date.toISOString().slice(0, 10)}`;
  }
}
