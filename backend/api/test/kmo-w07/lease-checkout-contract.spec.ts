import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

test('checkout refund permits optional references while retaining payout evidence history', async () => {
  const dto = await source('src/modules/lease/lease.dto.ts');
  const service = await source('src/modules/lease/lease-checkout.service.ts');
  const migration = await source(
    'src/infrastructure/database/migrations/085_optional_checkout_refund_annotations.sql',
  );
  const manifestEntry = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '085_optional_checkout_refund_annotations.sql',
  );

  assert.ok(manifestEntry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifestEntry.checksumSha256);
  assert.match(dto, /external_reference\?: string/);
  assert.match(dto, /reason\?: string/);
  assert.match(service, /exit_refund_evidence_files/);
  assert.match(service, /evidence_category='refund'/);
  assert.match(migration, /evidence_file_id IS NOT NULL/);
  assert.doesNotMatch(migration, /char_length\(trim\(COALESCE\(external_reference/);
  assert.doesNotMatch(migration, /char_length\(trim\(COALESCE\(settlement_reason/);
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

test('checkout Stage 3 deliberately rolls out the gate for existing operational properties', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/083_enable_lease_checkout_for_operational_properties.sql',
  );
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '083_enable_lease_checkout_for_operational_properties.sql',
  );

  assert.match(migration, /UPDATE property_feature_flags/);
  assert.match(migration, /SET lease_checkout = TRUE/);
  assert.match(migration, /WHERE admin_ux_read = TRUE[\s\S]*lease_write = TRUE/);
  assert.match(migration, /lease_checkout = FALSE/);
  assert.doesNotMatch(migration, /UPDATE\s+leases/i);
  assert.doesNotMatch(migration, /UPDATE\s+occupancies/i);
  assert.ok(entry);
  assert.equal(entry.checksumSha256.length, 64);
  assert.ok(entry.sentinels.some((value) => value.includes('migration 083')));
});

test('checkout revision and edit events are accepted by the lease history vocabulary', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/084_lease_checkout_revision_history.sql',
  );
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '084_lease_checkout_revision_history.sql',
  );

  assert.match(migration, /checkout_notice_edited/);
  assert.match(migration, /checkout_approval_edited/);
  assert.match(migration, /checkout_revision_requested/);
  assert.ok(entry);
  assert.equal(entry.checksumSha256.length, 64);
  assert.ok(entry.sentinels.some((value) => value.includes('checkout_revision_requested')));
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

test('Stage 3 links every final amount due to W06 invoice authority and reconciles payment reversals', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/082_lease_checkout_stage3_authority.sql',
  );
  const checkout = await source('src/modules/lease/lease-checkout.service.ts');
  const billing = await source('src/modules/billing/services/w06-billing.service.ts');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_exit_final_invoice_links/);
  assert.match(migration, /component_type IN \('rent_balance','final_adjustment'\)/);
  assert.match(migration, /final_settlement_netting/);
  assert.match(migration, /checkout_final_adjustment/);
  assert.match(migration, /notice_exception','short_notice_waiver/);
  assert.match(checkout, /issueCheckoutFinalChargeInTransaction/);
  assert.match(checkout, /component_type,linked_amount[\s\S]*'rent_balance'/);
  assert.match(checkout, /component_type,linked_amount[\s\S]*'final_adjustment'/);
  assert.match(checkout, /applySettlementNetCredits/);
  assert.match(checkout, /i\.invoice_purpose='rent'/);
  assert.match(billing, /'manual','other_charge'/);
  assert.match(billing, /'checkout_final_adjustment'/);
  assert.match(billing, /UPDATE lease_exit_final_settlements final_settlement/);
  assert.match(billing, /THEN 'amount_due' ELSE 'closed' END/);
  assert.match(billing, /CHECKOUT_FINAL_INVOICE_REQUIRED/);
  assert.match(migration, /earning_source IN \('rent_service','checkout_short_notice'\)/);
  assert.match(migration, /recognize_property_owner_checkout_compensations/);
  assert.match(migration, /NEW\.operator_fee_amount<>0/);
  assert.match(migration, /shortNoticeAmount/);
  assert.match(checkout, /payableShortNoticeAmount/);
  assert.match(checkout, /payableDamageAmount/);
});

test('Stage 3 keeps evidence uploads optional while preserving required confirmations and reasons', async () => {
  const dto = await source('src/modules/lease/lease.dto.ts');
  const checkout = await source('src/modules/lease/lease-checkout.service.ts');

  assert.match(dto, /notice_exception_evidence_file_ids\?: string\[\]/);
  assert.match(dto, /short_notice_waiver_evidence_file_ids\?: string\[\]/);
  assert.match(checkout, /A checkout with less than 14 days notice requires a reason/);
  assert.match(checkout, /Pengurangan kompensasi pemberitahuan singkat memerlukan alasan/);
  assert.match(checkout, /snapshot_monthly_price AS monthly_rate_amount/);
  assert.match(checkout, /SELECT DISTINCT evidence_category/);
  assert.match(checkout, /Checkout \$\{category\} confirmation is required/);
  assert.doesNotMatch(checkout, /CHECKOUT_HANDOVER_FILE_EVIDENCE_REQUIRED/);
  assert.doesNotMatch(checkout, /CHECKOUT_INSPECTION_FILE_EVIDENCE_REQUIRED/);
  assert.doesNotMatch(checkout, /bool_or\(file_id IS NOT NULL\) AS has_file/);
});

test('Stage 3 scopes parking release to the selected lease and preserves unrelated active leases', async () => {
  const checkout = await source('src/modules/lease/lease-checkout.service.ts');

  assert.match(checkout, /other\.id<>lease\.id/);
  assert.match(checkout, /other\.lease_status IN \('awaiting_activation','active'\)/);
  assert.match(checkout, /vehicle\.snapshot_room_number/);
  assert.match(checkout, /scope\.current_room_number/);
  assert.match(checkout, /scope\.snapshot_room_number/);
  assert.match(checkout, /scope\.is_only_current_lease/);
  assert.match(checkout, /'lease_id',\$1::uuid/);
  assert.match(checkout, /'room_id',\$6::uuid/);
});

test('Stage 3 keeps checkout traceable in Admin reports and hides private notes from Owner', async () => {
  const reports = await source('src/modules/report/report.service.ts');
  const reportDto = await source('src/modules/report/dto/report-query.dto.ts');
  const ownerPortal = await source(
    'src/modules/property-owner-management/property-owner-portal.service.ts',
  );

  assert.match(reportDto, /exit_type\?: 'normal_expiry' \| 'resident_early_termination'/);
  assert.match(reportDto, /checkout_status\?:/);
  assert.match(reportDto, /financial_status\?: 'refund_pending' \| 'amount_due' \| 'closed'/);
  assert.match(reports, /lease_checkout_commands command/);
  assert.match(reports, /lease_exit_final_settlements settlement/);
  assert.match(reports, /same_day_departures/);
  assert.match(reports, /documented_damage_amount/);
  assert.match(ownerPortal, /checkout_settlement_status/);
  assert.match(ownerPortal, /checkout_short_notice_amount/);
  assert.match(ownerPortal, /checkout_owner_entitlement_amount/);
  assert.doesNotMatch(ownerPortal, /command\.internal_note/);
  assert.doesNotMatch(ownerPortal, /command\.notice_reason/);
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
