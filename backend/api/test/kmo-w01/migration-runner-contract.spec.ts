import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { explicitDatabaseConfigFromEnv } from '../../src/infrastructure/database/scripts/database-url';
import {
  executableSql,
  loadMigrationSources,
  runMigrations,
  type MigrationSource,
} from '../../src/infrastructure/database/scripts/migrate';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const LEDGER_VERSION = '021_schema_migration_ledger.sql';
const MANIFEST_COUNT = MIGRATION_MANIFEST.length;
const LEDGER_INDEX = MIGRATION_MANIFEST.findIndex((entry) => entry.version === LEDGER_VERSION);
const PRE_LEDGER_COUNT = LEDGER_INDEX;
const POST_LEDGER_COUNT = MANIFEST_COUNT - LEDGER_INDEX - 1;
const NON_LEDGER_COUNT = MIGRATION_MANIFEST.filter(
  (entry) => entry.version !== LEDGER_VERSION,
).length;

type LedgerRow = { version: string; checksum_sha256: string };

type FakeDatabaseState = {
  bodyWrites: number;
  ledger: Map<string, string>;
  ledgerPresent: boolean;
};

type TransactionSnapshot = {
  bodyWrites: number;
  ledger: Map<string, string>;
  ledgerPresent: boolean;
};

function fakeDatabase(rows: LedgerRow[] = []): FakeDatabaseState {
  return {
    bodyWrites: 0,
    ledger: new Map(rows.map((row) => [row.version, row.checksum_sha256])),
    ledgerPresent: rows.length > 0,
  };
}

class FakeClient {
  readonly calls: string[] = [];
  readonly state: FakeDatabaseState;
  sentinelPresence: boolean[] = [];
  failLedgerVersion: string | null = null;
  failRollback = false;
  failSqlIncludes: string | null = null;
  maxSentinelQueries = 0;
  private sentinelQueries = 0;
  private transaction: TransactionSnapshot | null = null;

  constructor(rows: LedgerRow[] = [], state?: FakeDatabaseState) {
    this.state = state ?? fakeDatabase(rows);
  }

  get ledger(): Map<string, string> {
    return this.state.ledger;
  }

  get ledgerPresent(): boolean {
    return this.state.ledgerPresent;
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.calls.push(text);

    if (text === 'BEGIN') {
      this.transaction = {
        bodyWrites: this.state.bodyWrites,
        ledger: new Map(this.state.ledger),
        ledgerPresent: this.state.ledgerPresent,
      };
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      if (this.transaction) {
        this.state.bodyWrites = this.transaction.bodyWrites;
        this.state.ledger = new Map(this.transaction.ledger);
        this.state.ledgerPresent = this.transaction.ledgerPresent;
        this.transaction = null;
      }
      if (this.failRollback) throw new Error('synthetic rollback failure');
      return { rows: [] };
    }
    if (text === 'COMMIT') {
      this.transaction = null;
      return { rows: [] };
    }
    if (this.failSqlIncludes && text.includes(this.failSqlIncludes)) {
      throw new Error('synthetic migration failure');
    }
    if (text.includes("to_regclass('public.schema_migrations')") && text.includes('AS present')) {
      return { rows: [{ present: this.state.ledgerPresent } as T] };
    }
    if (text.startsWith('SELECT ') && text.endsWith(' AS present')) {
      this.sentinelQueries += 1;
      this.maxSentinelQueries = Math.max(this.maxSentinelQueries, this.sentinelQueries);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const present = this.sentinelPresence.shift() ?? false;
      this.sentinelQueries -= 1;
      return { rows: [{ present } as T] };
    }
    if (text.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
      this.state.bodyWrites += 1;
      this.state.ledgerPresent = true;
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO schema_migrations')) {
      const version = String(values[0]);
      if (version === this.failLedgerVersion) throw new Error('synthetic ledger failure');
      this.state.ledger.set(version, String(values[1]));
      return { rows: [] };
    }
    if (text.startsWith('SELECT version, checksum_sha256')) {
      return {
        rows: [...this.state.ledger.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([version, checksum_sha256]) => ({ version, checksum_sha256 }) as T),
      };
    }
    if (!text.includes('pg_advisory_')) this.state.bodyWrites += 1;
    return { rows: [] };
  }
}

class AdvisoryLockState {
  held = false;
  holders = 0;
  maxHolders = 0;
  entries = 0;
  private readonly waiters: Array<() => void> = [];

  async lock(): Promise<void> {
    if (this.held) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.held = true;
    this.holders += 1;
    this.entries += 1;
    this.maxHolders = Math.max(this.maxHolders, this.holders);
  }

  unlock(): void {
    this.holders -= 1;
    this.held = false;
    this.waiters.shift()?.();
  }
}

class SerializingClient extends FakeClient {
  constructor(
    private readonly lockState: AdvisoryLockState,
    state: FakeDatabaseState,
  ) {
    super([], state);
  }

  override async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    if (text.includes('pg_advisory_lock')) {
      this.calls.push(text);
      await this.lockState.lock();
      await new Promise<void>((resolve) => setImmediate(resolve));
      return { rows: [] };
    }
    if (text.includes('pg_advisory_unlock')) {
      this.calls.push(text);
      this.lockState.unlock();
      return { rows: [] };
    }
    return super.query<T>(text, values);
  }
}

function completeLedger(): LedgerRow[] {
  return MIGRATION_MANIFEST.map((entry) => ({
    version: entry.version,
    checksum_sha256: entry.checksumSha256,
  }));
}

void test('KMO-W01 manifest matches portable source bytes and uses strong legacy sentinels', async () => {
  const sources = await loadMigrationSources();
  assert.equal(sources.length, MANIFEST_COUNT);
  assert.deepEqual(
    sources.map((source) => source.version),
    MIGRATION_MANIFEST.map((entry) => entry.version),
  );
  for (const entry of MIGRATION_MANIFEST.filter((entry) => entry.version !== LEDGER_VERSION)) {
    assert.ok(entry.sentinels.length >= 2, `${entry.version} must not use a single weak sentinel`);
  }

  const verified = new FakeClient(completeLedger());
  assert.deepEqual(await runMigrations(verified as never, sources), {
    applied: 0,
    baselined: 0,
    alreadyApplied: MANIFEST_COUNT,
  });

  const linuxArchiveSources = sources.map((source) => {
    const sql = source.sql.replace(/\r\n/g, '\n');
    return { ...source, sql, rawBytes: Buffer.from(sql, 'utf8') };
  });
  const linuxArchive = new FakeClient(completeLedger());
  assert.deepEqual(await runMigrations(linuxArchive as never, linuxArchiveSources), {
    applied: 0,
    baselined: 0,
    alreadyApplied: MANIFEST_COUNT,
  });
});

void test('KMO-W01 disk inventory rejects a missing or extra migration file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kostation-migrations-'));
  try {
    for (const entry of MIGRATION_MANIFEST) {
      await writeFile(join(directory, entry.version), '-- synthetic inventory fixture\n', 'utf8');
    }
    await rm(join(directory, MIGRATION_MANIFEST[0]!.version));
    await assert.rejects(loadMigrationSources(directory), /inventory does not match/);

    await writeFile(join(directory, MIGRATION_MANIFEST[0]!.version), '-- restored\n', 'utf8');
    await writeFile(join(directory, '999_unexpected.sql'), '-- unexpected\n', 'utf8');
    await assert.rejects(loadMigrationSources(directory), /inventory does not match/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('KMO-W01 unwraps only documented outer transactions without changing inner SQL', () => {
  const wrapped = '-- legacy wrapper\nBEGIN;\nSELECT 1;\nSELECT 2;\nCOMMIT;';
  assert.equal(executableSql(wrapped), '-- legacy wrapper\nSELECT 1;\nSELECT 2;');

  const nonCanonical = 'BEGIN;\nSELECT 1;\nCOMMIT;\n-- trailing authority';
  assert.equal(executableSql(nonCanonical), nonCanonical);
});

void test('KMO-W01 fresh, atomic baseline, and immediate replay execute each body once', async () => {
  const sources = await loadMigrationSources();

  const fresh = new FakeClient();
  fresh.sentinelPresence = Array(NON_LEDGER_COUNT).fill(false);
  assert.deepEqual(await runMigrations(fresh as never, sources), {
    applied: MANIFEST_COUNT,
    baselined: 0,
    alreadyApplied: 0,
  });
  assert.equal(fresh.ledger.size, MANIFEST_COUNT);
  assert.equal(fresh.state.bodyWrites, MANIFEST_COUNT);
  assert.equal(fresh.maxSentinelQueries, 1);

  const freshWrites = fresh.state.bodyWrites;
  assert.deepEqual(await runMigrations(fresh as never, sources), {
    applied: 0,
    baselined: 0,
    alreadyApplied: MANIFEST_COUNT,
  });
  assert.equal(fresh.state.bodyWrites, freshWrites);

  const existing = new FakeClient();
  existing.sentinelPresence = [
    ...Array(PRE_LEDGER_COUNT).fill(true),
    ...Array(POST_LEDGER_COUNT).fill(false),
  ];
  assert.deepEqual(await runMigrations(existing as never, sources), {
    applied: POST_LEDGER_COUNT + 1,
    baselined: PRE_LEDGER_COUNT,
    alreadyApplied: 0,
  });
  assert.equal(existing.ledger.size, MANIFEST_COUNT);
  assert.equal(existing.state.bodyWrites, POST_LEDGER_COUNT + 1);
  assert.equal(existing.maxSentinelQueries, 1);
  const bootstrapBegin = existing.calls.indexOf('BEGIN');
  const bootstrapCommit = existing.calls.indexOf('COMMIT', bootstrapBegin);
  const baselineWrites = existing.calls
    .slice(bootstrapBegin, bootstrapCommit + 1)
    .filter((call) => call.startsWith('INSERT INTO schema_migrations'));
  assert.equal(baselineWrites.length, PRE_LEDGER_COUNT + 1);
});

void test('KMO-W01 locks before validation and rejects partial, order, and checksum drift', async () => {
  const sources = await loadMigrationSources();
  const partial = new FakeClient();
  partial.sentinelPresence = [true, ...Array(PRE_LEDGER_COUNT - 1).fill(false)];
  await assert.rejects(runMigrations(partial as never, sources), /Partial unledgered schema/);
  assert.equal(partial.ledgerPresent, false);
  assert.match(partial.calls[0]!, /pg_advisory_lock/);
  assert.match(partial.calls.at(-1)!, /pg_advisory_unlock/);

  const reordered = [...sources].reverse();
  const orderClient = new FakeClient();
  await assert.rejects(runMigrations(orderClient as never, reordered), /manifest mismatch/);
  assert.match(orderClient.calls[0]!, /pg_advisory_lock/);
  assert.match(orderClient.calls.at(-1)!, /pg_advisory_unlock/);
  assert.equal(orderClient.state.bodyWrites, 0);

  const drifted = sources.map((source, index) =>
    index === 0
      ? ({ ...source, rawBytes: Buffer.from(`${source.sql}\n-- drift`) } as MigrationSource)
      : source,
  );
  const drift = new FakeClient();
  await assert.rejects(runMigrations(drift as never, drifted), /checksum drift/);
  assert.match(drift.calls[0]!, /pg_advisory_lock/);
  assert.match(drift.calls.at(-1)!, /pg_advisory_unlock/);
  assert.equal(drift.state.bodyWrites, 0);
});

void test('KMO-W01 body and ledger failures roll back atomically and preserve the original error', async () => {
  const sources = await loadMigrationSources();

  const bodyFailure = new FakeClient();
  bodyFailure.sentinelPresence = Array(NON_LEDGER_COUNT).fill(false);
  bodyFailure.failSqlIncludes = 'CREATE TABLE IF NOT EXISTS roles';
  await assert.rejects(runMigrations(bodyFailure as never, sources), /synthetic migration failure/);
  assert.equal(bodyFailure.ledger.has(MIGRATION_MANIFEST[0]!.version), false);
  assert.equal(bodyFailure.ledger.has(LEDGER_VERSION), true);

  const ledgerFailure = new FakeClient();
  ledgerFailure.sentinelPresence = Array(NON_LEDGER_COUNT).fill(false);
  ledgerFailure.failLedgerVersion = MIGRATION_MANIFEST[0]!.version;
  ledgerFailure.failRollback = true;
  await assert.rejects(runMigrations(ledgerFailure as never, sources), /synthetic ledger failure/);
  assert.equal(ledgerFailure.ledger.has(MIGRATION_MANIFEST[0]!.version), false);
  assert.equal(ledgerFailure.state.bodyWrites, 1);

  const baselineFailure = new FakeClient();
  baselineFailure.sentinelPresence = Array(PRE_LEDGER_COUNT).fill(true);
  baselineFailure.failLedgerVersion = MIGRATION_MANIFEST[9]!.version;
  await assert.rejects(
    runMigrations(baselineFailure as never, sources),
    /synthetic ledger failure/,
  );
  assert.equal(baselineFailure.ledgerPresent, false);
  assert.equal(baselineFailure.ledger.size, 0);
  assert.equal(baselineFailure.state.bodyWrites, 0);
});

void test('KMO-W01 concurrent fresh runners share state and serialize all decisions and writes', async () => {
  const sources = await loadMigrationSources();
  const lockState = new AdvisoryLockState();
  const state = fakeDatabase();
  const results = await Promise.all([
    runMigrations(new SerializingClient(lockState, state) as never, sources),
    runMigrations(new SerializingClient(lockState, state) as never, sources),
  ]);

  assert.deepEqual(results, [
    { applied: MANIFEST_COUNT, baselined: 0, alreadyApplied: 0 },
    { applied: 0, baselined: 0, alreadyApplied: MANIFEST_COUNT },
  ]);
  assert.equal(state.bodyWrites, MANIFEST_COUNT);
  assert.equal(state.ledger.size, MANIFEST_COUNT);
  assert.equal(lockState.entries, 2);
  assert.equal(lockState.maxHolders, 1);
  assert.equal(lockState.holders, 0);
});

void test('KMO-W01 migration commands reject implicit database defaults', () => {
  const keys = [
    'DATABASE_URL',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'DB_SSL',
  ];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.DB_SSL = 'false';
    assert.throws(() => explicitDatabaseConfigFromEnv(), /DB_PORT/);

    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'qa-user';
    process.env.DB_PASSWORD = 'process-only-secret';
    process.env.DB_NAME = 'qa-database';
    assert.deepEqual(explicitDatabaseConfigFromEnv(), {
      host: '127.0.0.1',
      port: 5432,
      user: 'qa-user',
      password: 'process-only-secret',
      database: 'qa-database',
      ssl: undefined,
    });
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
