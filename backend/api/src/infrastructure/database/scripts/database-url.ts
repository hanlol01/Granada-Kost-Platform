import { PoolConfig } from 'pg';

function requiredEnvironmentValue(key: string): string {
  const value = process.env[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Explicit database configuration is required: ${key}`);
  }
  return value;
}

/** Fail-closed configuration for migration and reconciliation commands. */
export function explicitDatabaseConfigFromEnv(): PoolConfig {
  const sslValue = requiredEnvironmentValue('DB_SSL');
  if (sslValue !== 'true' && sslValue !== 'false') {
    throw new Error('Explicit database configuration is invalid: DB_SSL');
  }
  const ssl = sslValue === 'true' ? { rejectUnauthorized: true } : undefined;

  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl };
  }

  const rawPort = requiredEnvironmentValue('DB_PORT');
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Explicit database configuration is invalid: DB_PORT');
  }

  return {
    host: requiredEnvironmentValue('DB_HOST'),
    port,
    user: requiredEnvironmentValue('DB_USER'),
    password: requiredEnvironmentValue('DB_PASSWORD'),
    database: requiredEnvironmentValue('DB_NAME'),
    ssl,
  };
}

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
