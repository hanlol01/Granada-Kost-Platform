import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

const PUBLIC_ROOM_RATE_LIMIT_WINDOW_SECONDS = 60;
const PUBLIC_ROOM_RATE_LIMIT_MAX_REQUESTS = 120;

@Injectable()
export class PublicRoomRateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async assertAllowed(ipAddress: string | undefined, bucket: string): Promise<void> {
    const key = `rate-limit:public-room:${bucket}:${ipAddress ?? 'unknown'}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, PUBLIC_ROOM_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > PUBLIC_ROOM_RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many public room listing requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
