import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { databaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

async function main(): Promise<void> {
  const pool = new Pool(databaseConfigFromEnv());
  const migrationsDir = join(process.cwd(), 'src/infrastructure/database/migrations');
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  try {
    for (const file of migrationFiles) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      console.log(`${file} applied.`);
    }
  } finally {
    await pool.end();
  }
}

void main();
