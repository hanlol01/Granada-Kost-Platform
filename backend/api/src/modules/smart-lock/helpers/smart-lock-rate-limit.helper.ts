import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { SMART_LOCK_DEFAULTS } from '../constants/smart-lock.constants';

@Injectable()
export class SmartLockRateLimitHelper {
  constructor(private readonly redis: RedisService) {}

  async consumeCommandAttempt(deviceId: string, actorUserId: string): Promise<{ allowed: boolean; remaining: number; key: string }> {
    const key = this.commandKey(deviceId, actorUserId);
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    const value = await client.incr(key);
    if (value === 1) {
      await client.expire(key, SMART_LOCK_DEFAULTS.commandRateLimitWindowSeconds);
    }
    const remaining = Math.max(SMART_LOCK_DEFAULTS.commandRateLimitMaxAttempts - value, 0);
    return {
      allowed: value <= SMART_LOCK_DEFAULTS.commandRateLimitMaxAttempts,
      remaining,
      key,
    };
  }

  commandKey(deviceId: string, actorUserId: string): string {
    return `smart-lock:command:${deviceId}:${actorUserId}`;
  }
}
