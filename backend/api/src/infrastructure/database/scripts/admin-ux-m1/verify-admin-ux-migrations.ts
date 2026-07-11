import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import {
  assertDisposableDatabaseConnection,
  disposableDatabasePoolConfig,
  disposableDatabaseTargetFromEnv,
  sanitizedDisposableTarget,
} from './disposable-database';
import {
  defaultEvidencePath,
  safeErrorMessage,
  sha256,
  writeSanitizedEvidence,
} from './sanitized-evidence';

type FingerprintedTable = {
  table: string;
  row_count: number;
  checksum: string;
};

type DatabaseSnapshot = {
  schema_sha256: string;
  business_data_sha256: string;
  tables: FingerprintedTable[];
};

const AUDIT_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by_user_id',
  'updated_by_user_id',
  'deleted_by_user_id',
  'last_login_at',
  'accessed_at',
  'processed_at',
  'sent_at',
]);

function migrationsDirectory(): string {
  return resolve(__dirname, '../../migrations');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function migrationFiles(directory: string): Promise<string[]> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    throw new Error('No migration SQL files were found');
  }
  return files;
}

async function assertNoTruncateMigration(directory: string, files: string[]): Promise<void> {
  for (const file of files) {
    const sql = await readFile(join(directory, file), 'utf8');
    if (/\bTRUNCATE\b/i.test(sql)) {
      throw new Error(`Migration ${file} contains TRUNCATE and is not allowed in the M1 verifier`);
    }
  }
}

/**
 * Mirrors the current migration runner's all-SQL-per-invocation behavior without
 * changing the production runner. It is deliberately run twice by this verifier.
 */
async function runMigrationPass(pool: Pool, directory: string, files: string[]): Promise<void> {
  for (const file of files) {
    const sql = await readFile(join(directory, file), 'utf8');
    await pool.query(sql);
  }
}

async function schemaFingerprint(pool: Pool): Promise<string> {
  const [columns, constraints, indexes] = await Promise.all([
    pool.query(
      `SELECT table_name, column_name, ordinal_position, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    ),
    pool.query(
      `SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
       ORDER BY conrelid::regclass::text, conname`,
    ),
    pool.query(
      `SELECT tablename, indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
       ORDER BY tablename, indexname`,
    ),
  ]);
  return sha256(
    JSON.stringify({
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
    }),
  );
}

async function tableNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  return result.rows.map((row) => row.tablename);
}

async function tableFingerprint(pool: Pool, table: string): Promise<FingerprintedTable> {
  const columns = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  const ignoredColumns = columns.rows
    .map((row) => row.column_name)
    .filter((columnName) => AUDIT_COLUMNS.has(columnName));
  const qualifiedTable = `${quoteIdentifier('public')}.${quoteIdentifier(table)}`;
  const rows = await pool.query<{ business_row: Record<string, unknown> }>(
    `SELECT to_jsonb(source_row) - $1::text[] AS business_row
     FROM ${qualifiedTable} AS source_row
     ORDER BY md5((to_jsonb(source_row) - $1::text[])::text)`,
    [ignoredColumns],
  );
  const serializedRows = rows.rows.map((row) => JSON.stringify(row.business_row));
  return {
    table,
    row_count: serializedRows.length,
    checksum: sha256(serializedRows.join('\n')),
  };
}

async function databaseSnapshot(pool: Pool): Promise<DatabaseSnapshot> {
  const tables = await tableNames(pool);
  const fingerprints: FingerprintedTable[] = [];
  for (const table of tables) {
    fingerprints.push(await tableFingerprint(pool, table));
  }
  return {
    schema_sha256: await schemaFingerprint(pool),
    business_data_sha256: sha256(JSON.stringify(fingerprints)),
    tables: fingerprints,
  };
}

function equivalent(first: DatabaseSnapshot, second: DatabaseSnapshot): boolean {
  return (
    first.schema_sha256 === second.schema_sha256 &&
    first.business_data_sha256 === second.business_data_sha256
  );
}

async function main(): Promise<void> {
  const target = disposableDatabaseTargetFromEnv();
  const directory = migrationsDirectory();
  const files = await migrationFiles(directory);
  await assertNoTruncateMigration(directory, files);

  const pool = new Pool(disposableDatabasePoolConfig(target));
  try {
    await assertDisposableDatabaseConnection(pool, target);
    const firstStartedAt = Date.now();
    await runMigrationPass(pool, directory, files);
    const firstDurationMs = Date.now() - firstStartedAt;
    const firstSnapshot = await databaseSnapshot(pool);

    const secondStartedAt = Date.now();
    await runMigrationPass(pool, directory, files);
    const secondDurationMs = Date.now() - secondStartedAt;
    const secondSnapshot = await databaseSnapshot(pool);

    if (!equivalent(firstSnapshot, secondSnapshot)) {
      throw new Error('Second migration pass changed schema or business-data fingerprints');
    }

    const reportPath = await writeSanitizedEvidence(defaultEvidencePath('migration-verify.json'), {
      gate: 'admin-ux-m1-migration-reentrant',
      passed: true,
      target: sanitizedDisposableTarget(target),
      migration_file_count: files.length,
      migration_files_sha256: sha256(files.join('\n')),
      first_pass_duration_ms: firstDurationMs,
      second_pass_duration_ms: secondDurationMs,
      first_snapshot: firstSnapshot,
      second_snapshot: secondSnapshot,
    });
    console.log(
      JSON.stringify({
        gate: 'admin-ux-m1-migration-reentrant',
        passed: true,
        migration_file_count: files.length,
        report_path: reportPath,
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(`Admin UX M1 migration verifier failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
