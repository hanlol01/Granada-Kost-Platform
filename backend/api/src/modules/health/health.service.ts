import { Injectable } from '@nestjs/common';
import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        await this.database.ping();
        return { database: { status: 'up' } };
      },
      async () => {
        await this.redis.ping();
        return { redis: { status: 'up' } };
      },
    ]);
  }
}
