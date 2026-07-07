import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

const BOOKING_LEAD_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const BOOKING_LEAD_RATE_LIMIT_MAX_REQUESTS = 5;

@Injectable()
export class BookingLeadRateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async assertPublicCreateAllowed(ipAddress: string | undefined): Promise<void> {
    const key = `rate-limit:booking-lead:create:${ipAddress ?? 'unknown'}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, BOOKING_LEAD_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > BOOKING_LEAD_RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many booking interest submissions. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
