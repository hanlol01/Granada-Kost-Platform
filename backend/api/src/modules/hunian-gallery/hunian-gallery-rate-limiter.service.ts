import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

const HUNIAN_GALLERY_RATE_LIMIT_WINDOW_SECONDS = 60;
const HUNIAN_GALLERY_RATE_LIMIT_MAX_REQUESTS = 120;

@Injectable()
export class HunianGalleryRateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async assertAllowed(ipAddress: string | undefined, bucket: string): Promise<void> {
    const key = `rate-limit:hunian-gallery:${bucket}:${ipAddress ?? 'unknown'}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, HUNIAN_GALLERY_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > HUNIAN_GALLERY_RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many public gallery requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
