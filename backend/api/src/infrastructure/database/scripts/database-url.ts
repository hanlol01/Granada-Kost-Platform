import { PoolConfig } from 'pg';

export function databaseConfigFromEnv(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    };
  }

  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'granada_kost',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  };
}
