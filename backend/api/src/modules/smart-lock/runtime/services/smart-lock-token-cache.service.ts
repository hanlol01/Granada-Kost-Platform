import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../../infrastructure/redis/redis.service';

type CachedToken = {
  token: string;
  expiresAt: string;
};

@Injectable()
export class SmartLockTokenCacheService {
  constructor(private readonly redis: RedisService) {}

  async getToken(gatewayId: string): Promise<string | null> {
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    const value = await client.get(this.tokenKey(gatewayId));
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value) as CachedToken;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await client.del(this.tokenKey(gatewayId));
      return null;
    }
    return parsed.token;
  }

  async setToken(gatewayId: string, token: string, expiresAt: Date): Promise<void> {
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    const ttlSeconds = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
    await client.set(this.tokenKey(gatewayId), JSON.stringify({ token, expiresAt: expiresAt.toISOString() }), 'EX', ttlSeconds);
  }

  async clearToken(gatewayId: string): Promise<void> {
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    await client.del(this.tokenKey(gatewayId));
  }

  async acquireRefreshLock(gatewayId: string, ttlSeconds = 30): Promise<boolean> {
    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }
    const result = await client.set(this.lockKey(gatewayId), '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  private tokenKey(gatewayId: string): string {
    return `granada:smartlock:gw:${gatewayId}:token`;
  }

  private lockKey(gatewayId: string): string {
    return `granada:smartlock:gw:${gatewayId}:token-refresh-lock`;
  }
}
