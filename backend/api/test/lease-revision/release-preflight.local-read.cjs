// Local release preflight only: never calls the migration runner or writes data.
require('./register-typescript.cjs');
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { Pool } = require('pg');
const { loadMigrationSources } = require('../../src/infrastructure/database/scripts/migrate.ts');
const { databaseConfigFromEnv } = require('../../src/infrastructure/database/scripts/database-url.ts');

const hash = value => createHash('sha256').update(value).digest('hex');
const ledgerQuery = 'SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version';
// Fixed checkpoint assertions for the official runner's historical aliases.
// The runner remains the authority; this reader cannot baseline or apply SQL.
const legacyAliases = new Map([
  ['069_optional_property_owner_assignment_notes.sql', ['070_optional_property_owner_assignment_notes.sql', '21027d6696a1c261cf56b3178140d79a62710352ec1f8365e910279a4f606457']],
  ['070_permanent_property_ownership.sql', ['071_permanent_property_ownership.sql', 'bda591f4fb50bad861d5013a10cbcc27d25c366ca6463544fa80e0fa7c662e28']],
  ['071_property_owner_earning_recognition.sql', ['072_property_owner_earning_recognition.sql', 'f557b717a23fe254ffbaa9ee90c2691926a78bd9e2c9fd2ffc56614d4b7f4d11']],
  ['072_owner_historical_scope_and_period_close.sql', ['073_owner_historical_scope_and_period_close.sql', '96654bc7cb2f119f3db40f44955eaaf99696a12be35c415a0c5d8d1c4061ebc4']],
  ['073_rename_apart_kost_rooms.sql', ['069_rename_apart_kost_rooms.sql', '9a23cbaa110089ae1acee5211b8c4a9e8eeffe7756b7148cf38e2d705fae9a5a']],
]);
const removedVersion = '074_correct_apart_kost_room_18_22_code.sql';
const removedChecksum = '2f097763a1bf744659e4b53cde40312b2664341c687b7c51f1adf05ad73f2e6b';

async function main() {
  assert.ok(process.argv.includes('--local-read-only'), 'Explicit local read-only opt-in required');
  assert.ok(!['production', 'staging'].includes(process.env.NODE_ENV), 'Development only');
  const config = databaseConfigFromEnv();
  const url = config.connectionString ? new URL(config.connectionString) : null;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url?.hostname ?? config.host), 'Loopback only');
  const database = url ? decodeURIComponent(url.pathname.slice(1)) : config.database;
  assert.doesNotMatch(database, /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i,
    'Refuse production-like databases');

  const sources = await loadMigrationSources(resolve(__dirname, '../../src/infrastructure/database/migrations'));
  for (const source of sources) {
    // Match the official runner's exact LF/CRLF equivalence, never SQL drift.
    const checksums = [
      hash(source.rawBytes),
      hash(Buffer.from(source.sql.replace(/\r\n/g, '\n'))),
      hash(Buffer.from(source.sql.replace(/\r?\n/g, '\r\n'))),
    ];
    assert.ok(checksums.includes(source.checksumSha256), `Source checksum drift: ${source.version}`);
  }
  const pool = new Pool({ ...config, options: '-c default_transaction_read_only=on',
    connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  try {
    let ledger;
    const applied = new Set();
    const reconciled = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
      ledger = (await client.query(ledgerQuery)).rows;
      const byVersion = new Map(sources.map(source => [source.version, source]));
      for (const row of ledger) {
        const alias = legacyAliases.get(row.version);
        if (alias) {
          assert.equal(row.checksum_sha256, alias[1], `Historical alias checksum drift: ${row.version}`);
          assert.ok(byVersion.has(alias[0]), 'Historical alias target must remain in the canonical manifest');
          assert.ok(!applied.has(alias[0]), 'Duplicate canonical migration through historical alias');
          applied.add(alias[0]);
          reconciled.push({ historical: row.version, canonical: alias[0] });
          continue;
        }
        if (row.version === removedVersion) {
          assert.equal(row.checksum_sha256, removedChecksum, 'Removed historical migration checksum drift');
          continue;
        }
        assert.ok(byVersion.has(row.version), `Unknown ledger version: ${row.version}`);
        assert.equal(row.checksum_sha256, byVersion.get(row.version).checksumSha256,
          `Ledger checksum drift: ${row.version}`);
        assert.ok(!applied.has(row.version), 'Duplicate canonical migration ledger row');
        applied.add(row.version);
      }
      assert.equal(ledger.at(-1)?.version, '114_check_in_anchored_lease_period.sql',
        'Re-audit newer schema before relying on this pre-migration checkpoint');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    // A fresh statement outside the snapshot must also observe the same ledger.
    assert.equal(hash(JSON.stringify((await pool.query(ledgerQuery)).rows)), hash(JSON.stringify(ledger)));
    const pending = sources.filter(source => !applied.has(source.version));
    assert.equal(pending.length, 10);
    assert.ok(pending.every(source => /^(11[5-9]|12[0-4])_/.test(source.version)));
    console.log(JSON.stringify({ mode: 'read-only', ledgerRows: ledger.length,
      last: ledger.at(-1).version, sourceChecksumsVerified: sources.length,
      reconciled, pending: pending.map(source => source.version), ledgerUnchanged: true, mutations: 0 }));
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  // Do not emit connection strings, credentials, or resident information.
  console.error(error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : error.code ?? 'Preflight failed');
  process.exitCode = 1;
});
