import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, PoolConfig } from 'pg';

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

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await operation(client);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the operation or commit error; the client is always released below.
        }
      }
      throw error;
    } finally {
      client.release();
    }
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
