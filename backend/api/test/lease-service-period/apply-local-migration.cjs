// Explicit opt-in local setup; never deploys or connects to a remote database.
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { Pool } = require('pg');
const {
  loadMigrationSources,
  runMigrations,
} = require('../../.checkin-proof-build/infrastructure/database/scripts/migrate');
assert.equal(
  process.env.KOSTATION_CHECKIN_APPLY_LOCAL_MIGRATION,
  '1',
  'Explicit local opt-in required',
);
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const config = url
  ? {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'granada_kost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    };
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(config.host),
  'Remote databases are forbidden',
);
const datesSql = 'SELECT id,start_date::text,end_date::text FROM leases ORDER BY id';
async function main() {
  const sources = await loadMigrationSources(resolve('src/infrastructure/database/migrations'));
  assert.equal(sources.at(-1).version, '114_check_in_anchored_lease_period.sql');
  const pool = new Pool(config);
  const client = await pool.connect();
  try {
    const before = (await client.query(datesSql)).rows;
    const backup = join(
      mkdtempSync(join(tmpdir(), 'kostation-pre-checkin-114-')),
      'local-database.dump',
    );
    const dump = spawnSync(
      'pg_dump',
      [
        '--host',
        config.host,
        '--port',
        String(config.port),
        '--username',
        config.user,
        '--dbname',
        config.database,
        '--format=custom',
        '--file',
        backup,
        '--no-password',
      ],
      { env: { ...process.env, PGPASSWORD: config.password || '' }, encoding: 'utf8' },
    );
    assert.equal(dump.status, 0, 'Local database backup failed; migration was not started');
    const verify = spawnSync('pg_restore', ['--list', backup], { encoding: 'utf8' });
    assert.equal(verify.status, 0, 'Backup is unreadable; migration was not started');
    assert.ok(verify.stdout.includes('TABLE DATA'), 'Backup must contain data');
    console.log(
      JSON.stringify({
        backup,
        sha256: createHash('sha256').update(readFileSync(backup)).digest('hex'),
        verified: true,
      }),
    );
    const result = await runMigrations(client, sources);
    assert.deepEqual(
      (await client.query(datesSql)).rows,
      before,
      'Migration must not shift any existing lease dates',
    );
    const replay = await runMigrations(client, sources);
    assert.equal(replay.applied, 0, 'Official migration replay must be a no-op');
    console.log(JSON.stringify({ migration: result, replay, existingLeaseDates: 'unchanged' }));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
