// Explicitly approved local release operations only; no migration or file purge.
require('./register-typescript.cjs');
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { mkdir, readFile, stat } = require('node:fs/promises');
const { resolve, join, sep } = require('node:path');
const { Pool } = require('pg');
const { databaseConfigFromEnv } = require('../../src/infrastructure/database/scripts/database-url.ts');

async function main() {
  const backup = process.argv.includes('--approved-local-backup');
  assert.ok(backup || process.argv.includes('--local-read-only-fingerprint'), 'Explicit local operation required');
  assert.ok(!['production', 'staging'].includes(process.env.NODE_ENV), 'Development only');
  const config = databaseConfigFromEnv();
  const url = config.connectionString ? new URL(config.connectionString) : null;
  const host = url?.hostname ?? config.host;
  const database = url ? decodeURIComponent(url.pathname.slice(1)) : config.database;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Loopback only');
  assert.doesNotMatch(database, /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i, 'Refuse production-like databases');
  const pool = new Pool({ ...config, options: '-c default_transaction_read_only=on',
    statement_timeout: 15000, connectionTimeoutMillis: 5000 });
  try {
    const ledger = (await pool.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version')).rows;
    if (!backup) {
      const fingerprints = {};
      for (const table of ['residents', 'leases', 'rooms', 'occupancies', 'onboarding_commitments',
        'booking_lead_holds', 'payments', 'invoices', 'payment_receipts',
        'owner_sponsored_lease_terms', 'property_owner_realizations']) {
        const content = (await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb)::text AS content FROM ${table} row`)).rows[0].content;
        fingerprints[table] = createHash('sha256').update(content).digest('hex');
      }
      console.log(JSON.stringify({ mode: 'read-only', lastMigration: ledger.at(-1)?.version, fingerprints, mutations: 0 }));
      return;
    }
    assert.equal(ledger.at(-1)?.version, '114_check_in_anchored_lease_period.sql', 'Re-audit changed ledger before backup');
    const repoRoot = resolve(__dirname, '../../../..');
    const directory = join(repoRoot, 'backups');
    const filename = `h08-pre-115-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.dump`;
    const path = join(directory, filename);
    assert.ok(resolve(path).startsWith(`${resolve(directory)}${sep}`));
    await mkdir(directory, { recursive: true });
    const pgEnv = { ...process.env, PGHOST: host.replace(/^\[|\]$/g, ''),
      PGPORT: String(url?.port || config.port || 5432),
      PGUSER: url ? decodeURIComponent(url.username) : config.user,
      PGPASSWORD: url ? decodeURIComponent(url.password) : config.password };
    const dump = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl',
      '--serializable-deferrable', '--file', path, '--dbname', database],
      { env: pgEnv, timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    assert.equal(dump.status, 0, 'Local database backup failed; diagnostic credentials are not printed');
    const bytes = await readFile(path);
    assert.equal(bytes.subarray(0, 5).toString(), 'PGDMP', 'Custom backup header required');
    const contents = spawnSync('pg_restore', ['--list', path],
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    assert.equal(contents.status, 0, 'Backup catalog validation failed');
    const entries = contents.stdout.toString().split('\n').filter(line => /^\d+;/.test(line)).length;
    assert.ok(entries > 100, 'Substantive backup catalog required');
    console.log(JSON.stringify({ backup: path, bytes: (await stat(path)).size,
      sha256: createHash('sha256').update(bytes).digest('hex'), catalogEntries: entries,
      lastMigration: ledger.at(-1).version, databaseMutations: 0 }));
  } finally {
    await pool.end();
  }
}
main().catch(error => {
  console.error(error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : error.code ?? 'Local checkpoint failed');
  process.exitCode = 1;
});
