import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class LeaseRepository {
  constructor(private readonly database: DatabaseService) {}

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
    return this.database.client.query<T>(text, values);
  }
}
