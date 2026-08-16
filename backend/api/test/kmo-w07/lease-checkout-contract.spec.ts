import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { LeaseCheckoutService } from '../../src/modules/lease/lease-checkout.service';

const root = resolve(__dirname, '../..');
const source = (path: string) => readFile(resolve(root, path), 'utf8');

async function reserveLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return port;
}

test('W07D wiring exports the checkout authority', () => {
  assert.equal(typeof LeaseCheckoutService, 'function');
});

test('W07D migration creates sole checkout authority, evidence, credit evidence, and deny-by-default gate', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/040_lease_checkout_w07d.sql',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_checkout_commands/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_checkout_evidence/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_checkout_invoice_credits/);
  assert.match(migration, /uq_lease_checkout_commands_open_lease/);
  assert.match(migration, /lease_checkout BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /refund_due_date DATE/);
  assert.match(migration, /refund_due_date DATE/);
  assert.match(migration, /lease_checkout_invoice_credits/);
  assert.doesNotMatch(migration, /property_owner_earnings/);
  assert.doesNotMatch(migration, /payment_allocations\s+SET/i);
  assert.match(migration, /contract_settlement_deposit_offsets/);
  assert.match(migration, /lease_checkout_invoice_credits/);
});

test('W07D migration is registered with checksum and sentinels', () => {
  const entry = MIGRATION_MANIFEST.find((item) => item.version === '040_lease_checkout_w07d.sql');
  assert.ok(entry);
  assert.equal(entry.checksumSha256.length, 64);
  assert.ok(entry.sentinels.some((value) => value.includes('lease_checkout_commands')));
  assert.ok(entry.sentinels.some((value) => value.includes('refund_due_date')));
});

test('W07D routes are Admin-only and completion is financially authorised', async () => {
  const controller = await source('src/modules/lease/lease-checkout.controller.ts');
  assert.match(controller, /@RequireRoles\('admin'\)/);
  assert.match(controller, /@RequirePermissions\('lease.manage'\)/);
  const completion = controller.slice(controller.indexOf("@Post(':commandId/complete')"));
  assert.match(completion, /@RequirePermissions\('lease.manage', 'billing.manage'\)/);
  const legacy = await source('src/modules/lease/lease.service.ts');
  assert.match(legacy, /LEGACY_CHECKOUT_DISABLED/);
  assert.match(legacy, /assertLegacyCheckoutEnabled/);
});

test('W07D notice handles the open-command unique race with a stable business conflict', async () => {
  const checkout = await source('src/modules/lease/lease-checkout.service.ts');
  assert.match(checkout, /INSERT INTO lease_checkout_commands[\s\S]*ON CONFLICT DO NOTHING/);
  assert.match(checkout, /code: 'CHECKOUT_ALREADY_OPEN'/);
});

void test(
  'migration 040 applies, replays, and rolls back on a disposable PostgreSQL cluster',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w07d-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w07d-rollback-'));
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
    const w07dIndex = files.indexOf('040_lease_checkout_w07d.sql');
    assert.notEqual(w07dIndex, -1, 'migration 040 must remain in the manifest sequence');
    const prior = files
      .slice(0, w07dIndex)
      .map((name) => {
        const sql = readFileSync(resolve(migrationDirectory, name), 'utf8');
        return name === '022_kost_type_commercial_authority.sql'
          ? `${sql}\nALTER TABLE kost_type_rules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`
          : sql;
      })
      .join('\n');
    const migration = readFileSync(
      resolve(migrationDirectory, '040_lease_checkout_w07d.sql'),
      'utf8',
    );
    const exactProbe = `
      DO $proof$
      BEGIN
        IF to_regclass('public.lease_checkout_commands') IS NULL
           OR to_regclass('public.lease_checkout_evidence') IS NULL
           OR to_regclass('public.lease_checkout_invoice_credits') IS NULL
           OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='property_feature_flags_checkout_dependency_check')
           OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lease_deposit_transactions_refund_due_date_check')
           OR NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='uq_lease_checkout_commands_open_lease')
           OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='property_feature_flags' AND column_name='lease_checkout')
        THEN RAISE EXCEPTION 'W07D_MIGRATION_AUTHORITY_MISSING'; END IF;
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
      assert.equal(priorResult.status, 0, 'pre-W07D migration sequence failed');
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        `DO $$ BEGIN RAISE EXCEPTION 'W07D_SYNTHETIC_ROLLBACK'; END $$; COMMIT;`,
      );
      const failed = run(rollbackPort, failedMigration);
      assert.notEqual(failed.status, 0, 'synthetic W07D migration failure was not triggered');
      const rollbackProbe = run(
        rollbackPort,
        `DO $rollback$
         BEGIN
           IF to_regclass('public.lease_checkout_commands') IS NOT NULL
              OR to_regclass('public.lease_checkout_evidence') IS NOT NULL
              OR to_regclass('public.lease_checkout_invoice_credits') IS NOT NULL
              OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='property_feature_flags' AND column_name='lease_checkout')
           THEN RAISE EXCEPTION 'W07D_MIGRATION_ROLLBACK_INCOMPLETE'; END IF;
         END
         $rollback$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'W07D rollback probe failed');
    } finally {
      stop(replayDirectory);
      stop(rollbackDirectory);
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
