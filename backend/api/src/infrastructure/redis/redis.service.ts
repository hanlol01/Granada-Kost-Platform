import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('redis.url');

    this.redis = url
      ? new Redis(url, {
          keyPrefix: this.config.getOrThrow<string>('redis.keyPrefix'),
          lazyConnect: true,
        })
      : new Redis({
          host: this.config.getOrThrow<string>('redis.host'),
          port: this.config.getOrThrow<number>('redis.port'),
          password: this.config.get<string>('redis.password') || undefined,
          db: this.config.getOrThrow<number>('redis.db'),
          keyPrefix: this.config.getOrThrow<string>('redis.keyPrefix'),
          lazyConnect: true,
        });
  }

  get client(): Redis {
    return this.redis;
  }

  async ping(): Promise<void> {
    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }

    await this.redis.ping();
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
