import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { explicitDatabaseConfigFromEnv } from './database-url';
import { MIGRATION_MANIFEST, type MigrationManifestEntry } from './migration-manifest';

const LEDGER_VERSION = '021_schema_migration_ledger.sql';
const ADVISORY_LOCK_KEY = 4_600_217_001;

// Development databases created from the pre-reconciliation branch may still
// carry the owner/room migrations under their former numbers. Accept those
// exact, checksum-verified rows as aliases so the official runner can advance
// them without rewriting the ledger or replaying already-applied SQL.
const LEGACY_LEDGER_ALIASES = new Map([
  [
    '069_optional_property_owner_assignment_notes.sql',
    {
      canonical: '070_optional_property_owner_assignment_notes.sql',
      checksum: '21027d6696a1c261cf56b3178140d79a62710352ec1f8365e910279a4f606457',
    },
  ],
  [
    '070_permanent_property_ownership.sql',
    {
      canonical: '071_permanent_property_ownership.sql',
      checksum: 'bda591f4fb50bad861d5013a10cbcc27d25c366ca6463544fa80e0fa7c662e28',
    },
  ],
  [
    '071_property_owner_earning_recognition.sql',
    {
      canonical: '072_property_owner_earning_recognition.sql',
      checksum: 'f557b717a23fe254ffbaa9ee90c2691926a78bd9e2c9fd2ffc56614d4b7f4d11',
    },
  ],
  [
    '072_owner_historical_scope_and_period_close.sql',
    {
      canonical: '073_owner_historical_scope_and_period_close.sql',
      checksum: '96654bc7cb2f119f3db40f44955eaaf99696a12be35c415a0c5d8d1c4061ebc4',
    },
  ],
  [
    '073_rename_apart_kost_rooms.sql',
    {
      canonical: '069_rename_apart_kost_rooms.sql',
      checksum: '9a23cbaa110089ae1acee5211b8c4a9e8eeffe7756b7148cf38e2d705fae9a5a',
    },
  ],
]);
const LEGACY_REMOVED_MIGRATIONS = new Map([
  [
    '074_correct_apart_kost_room_18_22_code.sql',
    '2f097763a1bf744659e4b53cde40312b2664341c687b7c51f1adf05ad73f2e6b',
  ],
]);

export type MigrationSource = MigrationManifestEntry & { rawBytes: Buffer; sql: string };
export type MigrationRunResult = { applied: number; baselined: number; alreadyApplied: number };

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function checksumMatchesManifest(source: MigrationSource): boolean {
  if (sha256(source.rawBytes) === source.checksumSha256) return true;

  // Git may materialize a checked-in SQL blob with CRLF on Windows while the
  // canonical ledger checksum was generated from LF (or vice versa). Treat
  // only that exact line-ending conversion as equivalent; any SQL/content
  // drift still fails.
  const canonicalLfBytes = Buffer.from(source.sql.replace(/\r\n/g, '\n'), 'utf8');
  const canonicalCrlfBytes = Buffer.from(source.sql.replace(/\r?\n/g, '\r\n'), 'utf8');
  return (
    sha256(canonicalLfBytes) === source.checksumSha256 ||
    sha256(canonicalCrlfBytes) === source.checksumSha256
  );
}

export function executableSql(sql: string): string {
  const trimmed = sql.trim();
  const match = /^((?:\s*--[^\n]*\n|\s*\n)*)BEGIN\s*;\s*([\s\S]*?)\s*COMMIT\s*;\s*$/i.exec(trimmed);
  return match ? `${match[1] ?? ''}${match[2] ?? ''}`.trim() : trimmed;
}

export async function loadMigrationSources(
  migrationsDir = resolve(__dirname, '../migrations'),
): Promise<MigrationSource[]> {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const expected = MIGRATION_MANIFEST.map((entry) => entry.version);
  if (files.length !== expected.length || files.some((file, index) => file !== expected[index])) {
    throw new Error('Migration source inventory does not match the canonical manifest');
  }

  return Promise.all(
    MIGRATION_MANIFEST.map(async (entry) => {
      const rawBytes = await readFile(resolve(migrationsDir, entry.version));
      return { ...entry, rawBytes, sql: rawBytes.toString('utf8') };
    }),
  );
}

async function ledgerExists(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
  );
  return result.rows[0]?.present === true;
}

async function sentinelPresent(
  client: PoolClient,
  entry: MigrationManifestEntry,
): Promise<boolean> {
  const expression = entry.sentinels.map((sentinel) => `(${sentinel})`).join(' AND ');
  const result = await client.query<{ present: boolean }>(`SELECT ${expression} AS present`);
  return result.rows[0]?.present === true;
}

async function recordLedger(
  client: PoolClient,
  entry: MigrationManifestEntry,
  executionMs: number,
): Promise<void> {
  await client.query(
    `INSERT INTO schema_migrations (version, checksum_sha256, execution_ms, applied_by)
     VALUES ($1, $2, $3, 'kostation-migrate-v1')`,
    [entry.version, entry.checksumSha256, executionMs],
  );
}

async function inTransaction(client: PoolClient, operation: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await operation();
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the migration/body/ledger/commit error that caused rollback.
    }
    throw error;
  }
}

async function applyOne(client: PoolClient, source: MigrationSource): Promise<void> {
  const started = Date.now();
  await inTransaction(client, async () => {
    await client.query(executableSql(source.sql));
    await recordLedger(client, source, Math.max(0, Date.now() - started));
  });
}

async function bootstrapLedger(
  client: PoolClient,
  source: MigrationSource,
  baseline: readonly MigrationSource[],
): Promise<void> {
  const started = Date.now();
  await inTransaction(client, async () => {
    await client.query(executableSql(source.sql));
    await recordLedger(client, source, Math.max(0, Date.now() - started));
    for (const entry of baseline) await recordLedger(client, entry, 0);
  });
}

export async function runMigrations(
  client: PoolClient,
  sources: readonly MigrationSource[],
): Promise<MigrationRunResult> {
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  let result: MigrationRunResult | undefined;
  let runFailed = false;
  let runError: unknown;
  try {
    if (sources.length !== MIGRATION_MANIFEST.length) {
      throw new Error('Migration source inventory is incomplete');
    }
    for (const [index, source] of sources.entries()) {
      const expected = MIGRATION_MANIFEST[index];
      if (
        source.version !== expected.version ||
        source.checksumSha256 !== expected.checksumSha256
      ) {
        throw new Error('Migration source manifest mismatch');
      }
      if (
        !source.rawBytes.equals(Buffer.from(source.sql, 'utf8')) ||
        !checksumMatchesManifest(source)
      ) {
        throw new Error(`Migration checksum drift: ${source.version}`);
      }
    }

    let exists = await ledgerExists(client);
    const ledgerSource = sources.find((source) => source.version === LEDGER_VERSION)!;
    let baselined = 0;
    let applied = 0;

    if (!exists) {
      const ledgerIndex = sources.findIndex((source) => source.version === LEDGER_VERSION);
      if (ledgerIndex < 0) throw new Error('Migration ledger source is missing');
      // Only migrations that predate the ledger may be baselined. Later
      // migrations must still execute through the normal checksum/transaction
      // path, even when the database already contains the legacy schema.
      const legacy = sources.slice(0, ledgerIndex);
      const presence: boolean[] = [];
      for (const entry of legacy) presence.push(await sentinelPresent(client, entry));
      const presentCount = presence.filter(Boolean).length;
      if (presentCount !== 0 && presentCount !== legacy.length) {
        throw new Error('Partial unledgered schema detected; migration aborted');
      }
      const baseline = presentCount === legacy.length ? legacy : [];
      await bootstrapLedger(client, ledgerSource, baseline);
      exists = true;
      applied += 1;
      baselined = baseline.length;
    }

    if (!exists) throw new Error('Migration ledger bootstrap failed');
    const rows = await client.query<{ version: string; checksum_sha256: string }>(
      'SELECT version, checksum_sha256 FROM schema_migrations ORDER BY version',
    );
    const manifestByVersion = new Map(sources.map((source) => [source.version, source]));
    const appliedVersions = new Set<string>();
    for (const row of rows.rows) {
      const legacyAlias = LEGACY_LEDGER_ALIASES.get(row.version);
      if (legacyAlias) {
        if (
          legacyAlias.checksum !== row.checksum_sha256 ||
          appliedVersions.has(legacyAlias.canonical)
        ) {
          throw new Error('Migration ledger checksum or version drift detected');
        }
        appliedVersions.add(legacyAlias.canonical);
        continue;
      }
      const removedMigrationChecksum = LEGACY_REMOVED_MIGRATIONS.get(row.version);
      if (removedMigrationChecksum) {
        if (removedMigrationChecksum !== row.checksum_sha256) {
          throw new Error('Migration ledger checksum or version drift detected');
        }
        continue;
      }
      const expected = manifestByVersion.get(row.version);
      if (!expected || expected.checksumSha256 !== row.checksum_sha256) {
        throw new Error('Migration ledger checksum or version drift detected');
      }
      if (appliedVersions.has(row.version))
        throw new Error('Duplicate migration ledger row detected');
      appliedVersions.add(row.version);
    }

    for (const source of sources) {
      if (appliedVersions.has(source.version)) continue;
      if (await sentinelPresent(client, source)) {
        throw new Error(`Unledgered migration state detected: ${source.version}`);
      }
      await applyOne(client, source);
      appliedVersions.add(source.version);
      applied += 1;
    }
    result = { applied, baselined, alreadyApplied: sources.length - applied - baselined };
  } catch (error) {
    runFailed = true;
    runError = error;
  }

  let unlockFailed = false;
  let unlockError: unknown;
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  } catch (error) {
    unlockFailed = true;
    unlockError = error;
  }
  if (runFailed) throw runError;
  if (unlockFailed) throw unlockError;
  return result!;
}

export async function main(): Promise<void> {
  loadEnv({
    path: resolve(__dirname, '../../../../.env'),
  });
  const sources = await loadMigrationSources();
  const pool = new Pool(explicitDatabaseConfigFromEnv());
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const result = await runMigrations(client, sources);
    process.stdout.write(`${JSON.stringify({ status: 'ok', ...result })}\n`);
  } finally {
    try {
      client?.release();
    } finally {
      await pool.end();
    }
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown migration error';
    process.stderr.write(`${JSON.stringify({ status: 'failed', message })}\n`);
    process.exitCode = 1;
  });
}
