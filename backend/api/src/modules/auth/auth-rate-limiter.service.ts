import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class AuthRateLimiterService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async assertLoginAllowed(identifier: string, ipAddress?: string): Promise<void> {
    const windowSeconds = this.config.getOrThrow<number>('auth.loginRateLimitWindowSeconds');
    const maxAttempts = this.config.getOrThrow<number>('auth.loginRateLimitMaxAttempts');
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const key = `rate-limit:login:${ipAddress ?? 'unknown'}:${normalizedIdentifier}`;

    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, windowSeconds);
    }

    if (count > maxAttempts) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async clearLoginAttempts(identifier: string, ipAddress?: string): Promise<void> {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const key = `rate-limit:login:${ipAddress ?? 'unknown'}:${normalizedIdentifier}`;
    await this.redis.client.del(key);
  }
}
