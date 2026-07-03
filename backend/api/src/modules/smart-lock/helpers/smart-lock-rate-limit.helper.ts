import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { SMART_LOCK_DEFAULTS } from '../constants/smart-lock.constants';

export type SmartLockControlledCommandRateInput = {
  propertyId: string;
  deviceId: string;
  actorUserId: string;
  commandType: 'remote_unlock' | 'emergency_unlock' | 'remote_lock';
  emergency?: boolean;
};

@Injectable()
export class SmartLockRateLimitHelper {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

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

  async consumeControlledCommandAttempt(
    input: SmartLockControlledCommandRateInput,
  ): Promise<{ allowed: boolean; remaining: number; key: string; limit: number; redisAvailable: boolean }> {
    const key = this.controlledCommandKey(input);
    const limit = this.limitFor(input);
    const client = this.redis.client;

    try {
      if (client.status === 'wait') {
        await client.connect();
      }
      const value = await client.incr(key);
      if (value === 1) {
        await client.expire(key, SMART_LOCK_DEFAULTS.commandRateLimitWindowSeconds);
      }
      const remaining = Math.max(limit - value, 0);
      return {
        allowed: value <= limit,
        remaining,
        key,
        limit,
        redisAvailable: true,
      };
    } catch {
      return {
        allowed: false,
        remaining: 0,
        key,
        limit,
        redisAvailable: false,
      };
    }
  }

  controlledCommandKey(input: SmartLockControlledCommandRateInput): string {
    const emergencyScope = input.commandType === 'emergency_unlock' || input.emergency ? 'emergency' : 'standard';
    return `smart-lock:command:controlled:${input.propertyId}:${input.deviceId}:${input.actorUserId}:${input.commandType}:${emergencyScope}`;
  }

  private limitFor(input: SmartLockControlledCommandRateInput): number {
    if (input.commandType === 'remote_lock') {
      return SMART_LOCK_DEFAULTS.commandRateLimitMaxAttempts;
    }

    if (input.commandType === 'emergency_unlock' || input.emergency) {
      const configured = this.config.get<number>('smartLock.maxEmergencyUnlockPerMinute');
      return this.safePositiveInteger(configured, SMART_LOCK_DEFAULTS.controlledEmergencyUnlockMaxPerMinute);
    }

    const configured = this.config.get<number>('smartLock.maxUnlockPerMinute');
    return this.safePositiveInteger(configured, SMART_LOCK_DEFAULTS.controlledUnlockMaxPerMinute);
  }

  private safePositiveInteger(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
