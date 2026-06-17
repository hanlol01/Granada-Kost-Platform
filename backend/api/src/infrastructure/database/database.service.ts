import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolConfig } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool(this.createPoolConfig());
  }

  get client(): Pool {
    return this.pool;
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private createPoolConfig(): PoolConfig {
    const url = this.config.get<string>('database.url');

    if (url) {
      return {
        connectionString: url,
        ssl: this.config.get<boolean>('database.ssl') ? { rejectUnauthorized: true } : undefined,
      };
    }

    return {
      host: this.config.getOrThrow<string>('database.host'),
      port: this.config.getOrThrow<number>('database.port'),
      user: this.config.getOrThrow<string>('database.user'),
      password: this.config.getOrThrow<string>('database.password'),
      database: this.config.getOrThrow<string>('database.name'),
      ssl: this.config.get<boolean>('database.ssl') ? { rejectUnauthorized: true } : undefined,
    };
  }
}
