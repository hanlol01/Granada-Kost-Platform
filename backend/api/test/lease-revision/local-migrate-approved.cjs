// Approved local entry point for the freshly built official migration runner.
// SQL is read from src because Nest's runtime build does not copy migrations.
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { createConnection } = require('node:net');
const { resolve, sep } = require('node:path');
const { Pool } = require('pg');
const { loadMigrationSources, runMigrations } = require('../../dist/infrastructure/database/scripts/migrate');
const { explicitDatabaseConfigFromEnv } = require('../../dist/infrastructure/database/scripts/database-url');

async function main() {
  assert.ok(process.argv.includes('--approved-local-migration'), 'Explicit approved local migration required');
  assert.ok(!['production', 'staging'].includes(process.env.NODE_ENV), 'Development only');
  const config = explicitDatabaseConfigFromEnv();
  const url = config.connectionString ? new URL(config.connectionString) : null;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url?.hostname ?? config.host), 'Loopback only');
  assert.doesNotMatch(url ? decodeURIComponent(url.pathname.slice(1)) : config.database,
    /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i, 'Refuse production-like databases');
  const backupIndex = process.argv.indexOf('--backup');
  const hashIndex = process.argv.indexOf('--sha256');
  assert.ok(backupIndex > 0 && hashIndex > 0, 'Verified backup path and checksum required');
  const path = await realpath(process.argv[backupIndex + 1]);
  const backupRoot = await realpath(resolve(__dirname, '../../../../backups'));
  assert.ok(path.startsWith(`${backupRoot}${sep}`), 'Backup must belong to this workspace');
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(0, 5).toString(), 'PGDMP');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), process.argv[hashIndex + 1], 'Backup checksum changed');

  await new Promise((accept, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3000 });
    socket.once('connect', () => { socket.destroy(); reject(new Error('Old API is still listening; stop before migration')); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? accept() : reject(error));
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('API stop could not be verified')); });
  });
  const sources = await loadMigrationSources(resolve(__dirname, '../../src/infrastructure/database/migrations'));
  const pool = new Pool({ ...config, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      const before = (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows;
      assert.equal(before.at(-1)?.version, '114_check_in_anchored_lease_period.sql', 'Re-audit changed local ledger before migration');
      const result = await runMigrations(client, sources);
      assert.equal(result.applied, 10);
      assert.equal(result.baselined, 0);
      const after = (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows;
      assert.equal(after.length, before.length + 10);
      assert.equal(after.at(-1)?.version, '124_journal_authorized_correction_charges.sql');
      console.log(JSON.stringify({ status: 'ok', ...result, ledgerRows: after.length,
        last: after.at(-1).version, backupVerified: true, oldApiStopped: true,
        runner: 'built official runMigrations; canonical source SQL' }));
    } finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(error => {
  console.error(error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : error.code ?? error.message);
  process.exitCode = 1;
});
