import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { databaseConfigFromEnv } from './database-url';

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
