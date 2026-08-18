import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

const SHARE_LINK_WINDOW_SECONDS = 60;
const SHARE_LINK_MAX_REQUESTS = 20;

/**
 * Share URLs are intentionally public bearer links. Keep their online guessing
 * surface bounded even though the persisted token is only a SHA-256 hash.
 */
@Injectable()
export class ReminderShareRateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async assertAllowed(ipAddress: string | undefined): Promise<void> {
    const key = `rate-limit:reminder-invoice-share:${ipAddress ?? 'unknown'}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, SHARE_LINK_WINDOW_SECONDS);
    if (count > SHARE_LINK_MAX_REQUESTS) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak percobaan membuka tautan tagihan. Coba lagi sebentar lagi.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
