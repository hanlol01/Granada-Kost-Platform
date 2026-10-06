// Deliberate local-only upgrade. Never targets a remote/production database.
// Uses the official runner (checksum, ledger, advisory lock, atomic migration).
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { explicitDatabaseConfigFromEnv } from '../../src/infrastructure/database/scripts/database-url';
import {
  loadMigrationSources,
  runMigrations,
} from '../../src/infrastructure/database/scripts/migrate';

async function main() {
  assert.equal(
    process.env.KOSTATION_TRANSFER_MIGRATE_LOCAL,
    '1',
    'Explicit local migration opt-in required',
  );
  loadEnv({ path: resolve('.env'), quiet: true });
  loadEnv({ path: resolve('.env.local'), override: true, quiet: true });
  const config = explicitDatabaseConfigFromEnv();
  const host = config.connectionString ? new URL(config.connectionString).hostname : config.host;
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(host!),
    'Only a local database is allowed',
  );
  assert.ok(
    !['production', 'staging'].includes(process.env.NODE_ENV ?? ''),
    'Not for deployment environments',
  );
  const sources = await loadMigrationSources(resolve('src/infrastructure/database/migrations'));
  const pool = new Pool(config);
  const client = await pool.connect();
  try {
    const {
      rows: [preflight],
    } = await client.query(`SELECT
      EXISTS(SELECT 1 FROM schema_migrations WHERE version='112_room_single_plot_identifier.sql') AS baseline_ready,
      (SELECT count(*)::int FROM room_transfer_records) AS records`);
    assert.equal(
      preflight.baseline_ready,
      true,
      'Local database must already be upgraded through 112',
    );
    const result = await runMigrations(client, sources);
    assert.ok(result.applied <= 1, 'Only the new addendum migration should be applied');
    const {
      rows: [after],
    } = await client.query(`SELECT
      (SELECT count(*)::int FROM room_transfer_records) AS records,
      (SELECT count(*)::int FROM pg_constraint WHERE conrelid='room_transfer_records'::regclass
        AND conname IN('room_transfer_records_from_lease_unique','room_transfer_records_to_lease_unique')) AS obsolete_constraints`);
    assert.equal(after.records, preflight.records, 'Historic transfers must remain unchanged');
    assert.equal(after.obsolete_constraints, 0);
    console.log(JSON.stringify({ status: 'ok', ...result, historicRecordsPreserved: true }));
  } finally {
    client.release();
    await pool.end();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Local migration failed');
  process.exitCode = 1;
});
