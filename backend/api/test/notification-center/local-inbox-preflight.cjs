require('./register-typescript.cjs');
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const {
  databaseConfigFromEnv,
} = require('../../src/infrastructure/database/scripts/database-url.ts');
const {
  MIGRATION_MANIFEST,
} = require('../../src/infrastructure/database/scripts/migration-manifest.ts');
const {
  LEGACY_LEDGER_ALIASES,
  LEGACY_REMOVED_MIGRATIONS,
  checksumMatchesManifest,
  loadMigrationSources,
} = require('../../src/infrastructure/database/scripts/migrate.ts');
async function main() {
  assert.equal(process.env.NODE_ENV, 'development', 'Development only');
  const config = databaseConfigFromEnv();
  const url = config.connectionString ? new URL(config.connectionString) : null;
  const hostname = url?.hostname ?? config.host;
  const database = url ? decodeURIComponent(url.pathname.slice(1)) : config.database;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(hostname), 'Loopback only');
  assert.doesNotMatch(database, /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i);
  const pool = new Pool({
    ...config,
    options: '-c default_transaction_read_only=on',
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  try {
    const ledger = (
      await pool.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version')
    ).rows;
    const applied = new Map(ledger.map((e) => [e.version, e.checksum_sha256]));
    const mismatch = MIGRATION_MANIFEST.filter(
      (e) => applied.has(e.version) && applied.get(e.version) !== e.checksumSha256,
    ).map((e) => e.version);
    const effectiveApplied = new Set();
    const acceptedAliases = [];
    const ledgerProblems = [];
    for (const row of ledger) {
      const alias = LEGACY_LEDGER_ALIASES.get(row.version);
      if (alias) {
        if (alias.checksum !== row.checksum_sha256) ledgerProblems.push(row.version);
        else {
          effectiveApplied.add(alias.canonical);
          acceptedAliases.push({
            legacy: row.version,
            canonical: alias.canonical,
            checksumVerified: true,
          });
        }
      } else if (LEGACY_REMOVED_MIGRATIONS.has(row.version)) {
        if (LEGACY_REMOVED_MIGRATIONS.get(row.version) !== row.checksum_sha256)
          ledgerProblems.push(row.version);
      } else effectiveApplied.add(row.version);
    }
    const effectivePending = MIGRATION_MANIFEST.filter((e) => !effectiveApplied.has(e.version));
    const sentinelStates = [];
    for (const entry of effectivePending) {
      const checks = [];
      for (const sentinel of entry.sentinels) {
        try {
          checks.push({
            present: (await pool.query(`SELECT (${sentinel}) AS present`)).rows[0].present,
          });
        } catch (error) {
          checks.push({ present: false, errorCode: error.code });
        }
      }
      sentinelStates.push({ version: entry.version, checks });
    }
    const sources = await loadMigrationSources();
    for (const source of sources) {
      assert.ok(checksumMatchesManifest(source), `Source checksum drift: ${source.version}`);
    }
    console.log(
      JSON.stringify({
        environment: process.env.NODE_ENV,
        hostname,
        database,
        ledgerCount: ledger.length,
        lastMigration: ledger.at(-1)?.version,
        pending: MIGRATION_MANIFEST.filter((e) => !applied.has(e.version)).map((e) => e.version),
        checksumMismatch: mismatch,
        effectivePending: effectivePending.map((e) => e.version),
        acceptedAliases,
        ledgerProblems,
        sentinelStates,
        sourceFilesVerified: sources.length,
        notificationInboxTable: (
          await pool.query("SELECT to_regclass('public.notification_account_states')::text AS name")
        ).rows[0].name,
        mutations: 0,
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    error.code === 'ERR_ASSERTION'
      ? error.message.split('\n')[0]
      : (error.code ?? 'LOCAL_PREFLIGHT_FAILED'),
  );
  process.exitCode = 1;
});
