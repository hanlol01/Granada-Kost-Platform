import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { databaseConfigFromEnv } from './database-url';

async function main(): Promise<void> {
  const pool = new Pool(databaseConfigFromEnv());
  const seedPath = join(process.cwd(), 'src/infrastructure/database/seeds/001_rbac_seed.sql');
  const sql = await readFile(seedPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('IAM/RBAC seed applied.');
  } finally {
    await pool.end();
  }
}

void main();
