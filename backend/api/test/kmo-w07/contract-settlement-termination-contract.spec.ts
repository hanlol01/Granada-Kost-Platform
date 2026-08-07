import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { ContractSettlementService } from '../../src/modules/billing/services/contract-settlement.service';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const LEASE_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-833333333333';
const SETTLEMENT_ID = '44444444-4444-4444-8444-444444444444';
const INVOICE_ID = '55555555-5555-4555-8555-555555555555';
const root = resolve(__dirname, '../..');

async function reserveLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return port;
}

type HarnessOptions = {
  deadlinePassed?: boolean;
  extensionDueAt?: Date | null;
  outstanding?: number;
  auditFailure?: Error;
};

function contractSettlementHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const queries: string[] = [];
  const client = {
    query: async (statement: string, _params: readonly unknown[] = []) => {
      const normalized = statement.replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (/SELECT id FROM properties/.test(normalized))
        return { rows: [{ id: PROPERTY_ID }], rowCount: 1 };
      if (/INSERT INTO idempotency_commands/.test(normalized))
        return { rows: [{ id: 'command' }], rowCount: 1 };
      if (/FROM lease_contract_settlements settlement/.test(normalized))
        return {
          rows: [
            {
              id: SETTLEMENT_ID,
              property_id: PROPERTY_ID,
              lease_id: LEASE_ID,
              invoice_id: INVOICE_ID,
              state: 'open',
              activated_at: new Date('2026-01-01T00:00:00.000Z'),
              original_due_at: new Date('2026-03-01T00:00:00.000Z'),
              extension_due_at: options.extensionDueAt ?? null,
              total_amount: '10800000',
              credit_amount: '2700000',
              allocated_amount: String(8_100_000 - (options.outstanding ?? 8_100_000)),
              room_id: '66666666-6666-4666-8666-666666666666',
              occupancy_id: '77777777-7777-4777-8777-777777777777',
              lease_status: 'active',
            },
          ],
          rowCount: 1,
        };
      if (
        /SELECT now\(\) > \$1::timestamptz AS passed/.test(normalized) ||
        /SELECT now\(\) > CASE WHEN \$2::timestamptz IS NULL THEN \$1::timestamptz \+ INTERVAL '7 days' ELSE \$2::timestamptz END AS passed/.test(
          normalized,
        )
      )
        return { rows: [{ passed: options.deadlinePassed ?? true }], rowCount: 1 };
      if (/UPDATE lease_contract_settlements SET extension_due_at/.test(normalized))
        return { rows: [{ extension_due_at: new Date('2026-03-15T00:00:00.000Z') }], rowCount: 1 };
      if (/INSERT INTO lease_termination_cases/.test(normalized))
        return { rows: [{ id: '88888888-8888-4888-8888-888888888888' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new ContractSettlementService(
    {
      transaction: async (operation: (transactionClient: typeof client) => Promise<unknown>) => {
        events.push('begin');
        try {
          const result = await operation(client);
          events.push('commit');
          return result;
        } catch (error) {
          events.push('rollback');
          throw error;
        } finally {
          events.push('release');
        }
      },
    } as never,
    {
      assertCanReadProperty: async () => events.push('authorized'),
    } as never,
    {
      write: async (_input: unknown, transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        events.push('audit');
        if (options.auditFailure) throw options.auditFailure;
      },
    } as never,
  );
  return { service, events, queries };
}

const adminActor = {
  id: ACTOR_ID,
  roles: ['admin'],
  permissions: ['lease.manage'],
  propertyIds: [PROPERTY_ID],
};
const idempotencyKey = 'w07-contract-settlement-command-0001';
const auditContext = { correlationId: 'w07-contract-settlement-test' };
const migration = readFileSync(
  resolve(root, 'src/infrastructure/database/migrations/030_contract_settlement_termination.sql'),
  'utf8',
);
const residentBillingProjection = readFileSync(
  resolve(root, 'src/modules/billing/services/w06-billing.service.ts'),
  'utf8',
);

function errorCode(error: unknown) {
  assert.ok(error instanceof Error && 'getResponse' in error);
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

test('migration 030 remains manifest-bound and preserves prior invoice credits when a deposit offsets arrears', () => {
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '030_contract_settlement_termination.sql',
  );
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  for (const authority of [
    'lease_contract_settlements',
    'lease_termination_cases',
    'contract_settlement_deposit_offsets',
    'termination_rent_offset',
  ])
    assert.match(migration, new RegExp(authority));
  assert.match(migration, /invoice_credit_before_amount BIGINT NOT NULL/);
  assert.match(
    migration,
    /contract_settlement_deposit_offsets_settlement_unique UNIQUE \(settlement_id\)/,
  );
  assert.match(
    migration,
    /NEW\.credit_amount <> offset_credit_before_amount \+ backed_offset_amount/,
  );
  assert.doesNotMatch(migration, /DELETE FROM (leases|occupancies|payments|invoices)/i);
});

test('the admin role can record a contract-rent payment from the resident detail workspace', () => {
  const rbacSeed = readFileSync(
    resolve(root, 'src/infrastructure/database/seeds/001_rbac_seed.sql'),
    'utf8',
  );

  assert.match(rbacSeed, /\('admin', 'billing\.manage'\)/);
});

test('resident billing applies the installment filter before casting its next due date', () => {
  assert.equal(
    residentBillingProjection.includes(
      "(min(due_date) FILTER(WHERE installment_status IN('scheduled','issued','partially_paid')))::text AS next_due",
    ),
    true,
  );
  assert.equal(
    residentBillingProjection.includes(
      "min(due_date)::text FILTER(WHERE installment_status IN('scheduled','issued','partially_paid'))",
    ),
    false,
  );
});

test('one 14-day extension is transaction-scoped, audited, and only possible after the original due date', async () => {
  const harness = contractSettlementHarness();
  const result = await harness.service.extend(
    adminActor as never,
    LEASE_ID,
    { property_id: PROPERTY_ID, extension_days: 14, reason: 'Menunggu pelunasan orang tua' },
    idempotencyKey,
    auditContext,
  );
  assert.equal(result.data.extension_days, 14);
  assert.deepEqual(harness.events, ['authorized', 'begin', 'audit', 'commit', 'release']);
  assert.equal(
    harness.queries.some((query) => /\+ \(\$3::int \* INTERVAL '1 day'\)/.test(query)),
    true,
  );

  const alreadyExtended = contractSettlementHarness({
    extensionDueAt: new Date('2026-03-15T00:00:00.000Z'),
  });
  await assert.rejects(
    alreadyExtended.service.extend(
      adminActor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID, extension_days: 14, reason: 'Tidak boleh dua kali' },
      idempotencyKey,
      auditContext,
    ),
    (error) => errorCode(error) === 'CONTRACT_SETTLEMENT_EXTENSION_ALREADY_USED',
  );
  assert.equal(alreadyExtended.events.includes('audit'), false);

  const notDue = contractSettlementHarness({ deadlinePassed: false });
  await assert.rejects(
    notDue.service.extend(
      adminActor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID, extension_days: 7, reason: 'Belum jatuh tempo' },
      idempotencyKey,
      auditContext,
    ),
    (error) => errorCode(error) === 'CONTRACT_SETTLEMENT_EXTENSION_NOT_DUE',
  );
});

test('the partial-payment window closing starts a termination case without evicting the resident or changing the room', async () => {
  const harness = contractSettlementHarness({ deadlinePassed: true, outstanding: 8_100_000 });
  const result = await harness.service.startTermination(
    adminActor as never,
    LEASE_ID,
    {
      property_id: PROPERTY_ID,
      reason: 'Saldo sewa tidak dilunasi setelah tenggat akhir',
      notes: 'Hubungi penghuni sebelum checkout',
      planned_checkout_date: '2026-03-20',
    },
    idempotencyKey,
    auditContext,
  );
  assert.equal(result.data.status, 'pending');
  assert.equal(result.data.outstanding_amount, 8_100_000);
  assert.deepEqual(harness.events, ['authorized', 'begin', 'audit', 'commit', 'release']);
  assert.equal(
    harness.queries.some((query) => /INSERT INTO lease_termination_cases/.test(query)),
    true,
  );
  assert.equal(
    harness.queries.some((query) =>
      /SELECT now\(\) > CASE WHEN \$2::timestamptz IS NULL THEN \$1::timestamptz \+ INTERVAL '7 days' ELSE \$2::timestamptz END AS passed/.test(
        query,
      ),
    ),
    true,
  );
  assert.equal(
    harness.queries.some((query) => /UPDATE occupancies|UPDATE rooms|UPDATE leases/.test(query)),
    false,
  );
});

test('termination is rejected before the partial-payment window closes and audit failure rolls back its case', async () => {
  const beforeDeadline = contractSettlementHarness({ deadlinePassed: false });
  await assert.rejects(
    beforeDeadline.service.startTermination(
      adminActor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID, reason: 'Terlalu awal', planned_checkout_date: '2026-03-20' },
      idempotencyKey,
      auditContext,
    ),
    (error) => errorCode(error) === 'CONTRACT_SETTLEMENT_NOT_FINAL_OVERDUE',
  );
  assert.deepEqual(beforeDeadline.events.slice(-2), ['rollback', 'release']);

  const sentinel = new Error('audit store unavailable');
  const rollback = contractSettlementHarness({ auditFailure: sentinel });
  await assert.rejects(
    rollback.service.startTermination(
      adminActor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID, reason: 'Tunggakan final', planned_checkout_date: '2026-03-20' },
      idempotencyKey,
      auditContext,
    ),
    sentinel,
  );
  assert.deepEqual(rollback.events.slice(-2), ['rollback', 'release']);
});

void test(
  'migration 030 applies, replays, and rolls back on a disposable PostgreSQL cluster',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w07-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w07-rollback-'));
    const replayPort = await reserveLocalPort();
    let rollbackPort = await reserveLocalPort();
    while (rollbackPort === replayPort) rollbackPort = await reserveLocalPort();
    const started = new Set<string>();
    const executable = (name: string) =>
      join(bin, process.platform === 'win32' ? `${name}.exe` : name);
    const initialize = (directory: string) => {
      const result = spawnSync(
        executable('initdb'),
        ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { stdio: 'ignore', windowsHide: true },
      );
      assert.equal(result.status, 0, 'disposable PostgreSQL initialization failed');
    };
    const start = (directory: string, port: number) => {
      const result = spawnSync(
        executable('pg_ctl'),
        [
          '-D',
          directory,
          '-o',
          `-p ${port} -h 127.0.0.1`,
          '-l',
          join(directory, 'server.log'),
          '-w',
          'start',
        ],
        { stdio: 'ignore', windowsHide: true },
      );
      assert.equal(result.status, 0, 'disposable PostgreSQL start failed');
      started.add(directory);
    };
    const run = (port: number, statement: string) =>
      spawnSync(
        executable('psql'),
        [
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-h',
          '127.0.0.1',
          '-p',
          String(port),
          '-U',
          'postgres',
          '-d',
          'postgres',
        ],
        { input: statement, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      );
    const stop = (directory: string) => {
      if (!started.has(directory)) return;
      spawnSync(executable('pg_ctl'), ['-D', directory, '-m', 'immediate', '-w', 'stop'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      started.delete(directory);
    };
    const migrationDirectory = resolve(root, 'src/infrastructure/database/migrations');
    const files = readdirSync(migrationDirectory)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort();
    const w07Index = files.indexOf('030_contract_settlement_termination.sql');
    assert.notEqual(w07Index, -1, 'migration 030 must remain in the manifest sequence');
    const prior = files
      .slice(0, w07Index)
      .map((name) => {
        const source = readFileSync(resolve(migrationDirectory, name), 'utf8');
        // The historical 023 source reads this compatibility column before it
        // exists. Keep historical bytes immutable and supply the test-only
        // predecessor just as the W06 disposable proof does.
        return name === '022_kost_type_commercial_authority.sql'
          ? `${source}\nALTER TABLE kost_type_rules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`
          : source;
      })
      .join('\n');
    const exactProbe = `
      DO $proof$
      BEGIN
        IF to_regclass('public.lease_contract_settlements') IS NULL
           OR to_regclass('public.lease_termination_cases') IS NULL
           OR to_regclass('public.contract_settlement_deposit_offsets') IS NULL
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_w07_contract_settlement_scope' AND NOT tgisinternal)
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_w07_contract_settlement_deposit_offset_scope' AND NOT tgisinternal)
           OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contract_settlement_deposit_offsets_settlement_unique')
           OR NOT EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema='public'
                AND table_name='contract_settlement_deposit_offsets'
                AND column_name='invoice_credit_before_amount'
                AND is_nullable='NO'
           )
        THEN RAISE EXCEPTION 'W07_CONTRACT_SETTLEMENT_AUTHORITY_MISSING'; END IF;
      END
      $proof$;
    `;
    try {
      initialize(replayDirectory);
      start(replayDirectory, replayPort);
      const replay = run(
        replayPort,
        `${prior}\n${migration}\n${exactProbe}\n${migration}\n${exactProbe}`,
      );
      assert.equal(
        replay.status,
        0,
        `disposable first-apply/replay proof failed: ${replay.stderr || replay.stdout}`,
      );

      initialize(rollbackDirectory);
      start(rollbackDirectory, rollbackPort);
      const priorResult = run(rollbackPort, prior);
      assert.equal(priorResult.status, 0, 'pre-W07 migration sequence failed');
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        `DO $$ BEGIN RAISE EXCEPTION 'W07_SYNTHETIC_ROLLBACK'; END $$; COMMIT;`,
      );
      assert.notEqual(failedMigration, migration);
      const failed = run(rollbackPort, failedMigration);
      assert.notEqual(failed.status, 0, 'synthetic W07 migration failure was not triggered');
      const rollbackProbe = run(
        rollbackPort,
        `DO $rollback$
         BEGIN
           IF to_regclass('public.lease_contract_settlements') IS NOT NULL
              OR to_regclass('public.lease_termination_cases') IS NOT NULL
              OR to_regclass('public.contract_settlement_deposit_offsets') IS NOT NULL
           THEN RAISE EXCEPTION 'W07_MIGRATION_ROLLBACK_INCOMPLETE'; END IF;
         END
         $rollback$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'W07 rollback probe failed');
    } finally {
      stop(replayDirectory);
      stop(rollbackDirectory);
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
