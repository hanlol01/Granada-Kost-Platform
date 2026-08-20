import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test, { type TestContext } from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const root = resolve(__dirname, '../..');

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

test('W09A migration adds append-only parking assignment evidence and vehicle validity metadata', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/043_vehicle_parking_authority_w09a.sql',
  );
  assert.match(migration, /ALTER TABLE vehicle_files[\s\S]*issued_at DATE[\s\S]*valid_until DATE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS parking_assignment_histories/);
  assert.match(migration, /property_id UUID NOT NULL REFERENCES properties/);
  assert.match(migration, /CHECK \(action IN \('assigned', 'released'\)\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON parking_assignment_histories/);
  assert.match(migration, /PARKING_ASSIGNMENT_HISTORY_IMMUTABLE/);
});

test('W09A migration is registered with a content checksum and sentinels', () => {
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '043_vehicle_parking_authority_w09a.sql',
  );
  assert.ok(entry, 'migration 043 must be registered');
  assert.match(entry.checksumSha256, /^[a-f0-9]{64}$/);
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('parking_assignment_histories')));
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('valid_until')));
});

test('W09A vehicle commands are transactional, idempotent, audited, and outbox-backed', async () => {
  const service = await source('src/modules/vehicle/services/vehicle.service.ts');
  assert.match(service, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(service, /this\.database\.transaction/);
  assert.match(service, /INSERT INTO idempotency_commands/);
  assert.match(service, /UPDATE idempotency_commands SET command_status='succeeded'/);
  assert.match(service, /this\.audit\.write/);
  assert.match(service, /INSERT INTO business_events/);
  assert.match(service, /findByIdForUpdate/);
});

test('W09A parking assignment and setup commands preserve transaction history and outbox evidence', async () => {
  const service = await source('src/modules/parking/services/parking.service.ts');
  assert.match(service, /async assignSlot/);
  assert.match(service, /async releaseSlot/);
  assert.match(service, /this\.database\.transaction/);
  assert.match(service, /this\.histories\.record/);
  assert.match(service, /INSERT INTO business_events/);
  assert.match(service, /findByIdForUpdate/);
  assert.match(service, /ParkingCapacityHelper\.assertHasCapacity/);
  assert.match(service, /PARKING_RESIDENT_NOT_IN_ACTIVE_STAY/);
  assert.match(service, /isVehicleCompatibleWithSlot/);
  assert.match(service, /occupancies/);
});

test('W09A checkout release records parking history before clearing the operational slot', async () => {
  const checkout = await source('src/modules/lease/lease-checkout.service.ts');
  const releaseRegion = checkout.slice(
    checkout.indexOf('INSERT INTO parking_assignment_histories'),
  );
  assert.match(releaseRegion, /INSERT INTO parking_assignment_histories/);
  assert.match(releaseRegion, /action, reason, actor_user_id/);
  assert.match(releaseRegion, /UPDATE parking_slots/);
  assert.match(releaseRegion, /lease_checkout/);
});

test('W09A read routes remain property-scoped and expose history only through the canonical services', async () => {
  const vehicles = await source('src/modules/vehicle/controllers/vehicle.controller.ts');
  const parking = await source('src/modules/parking/controllers/parking.controller.ts');
  assert.match(vehicles, /@Get\(':vehicleId\/history'\)/);
  assert.match(vehicles, /assertCanReadProperty\(user, vehicle\.propertyId\)/);
  assert.match(parking, /@Get\('slots\/:slotId\/history'\)/);
  assert.match(parking, /assertCanReadProperty\(user, zone\.propertyId\)/);
});

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

void test(
  'W09A migration applies, replays, and rolls back on a disposable PostgreSQL cluster',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async (context) => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w09a-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w09a-rollback-'));
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
        { encoding: 'utf8', windowsHide: true },
      );
      if (result.status === 0) started.add(directory);
      return result;
    };
    const requireStarted = (
      result: ReturnType<typeof spawnSync>,
      context: TestContext,
    ): boolean => {
      const diagnostic = `${result.error?.message ?? ''} ${result.stderr ?? ''}`;
      if (result.status !== 0 && diagnostic.includes('could not create restricted token')) {
        context.skip('PostgreSQL restricted-token startup is unavailable in this Windows sandbox');
        return false;
      }
      assert.equal(result.status, 0, `disposable PostgreSQL start failed: ${diagnostic}`);
      return true;
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
    const w09aIndex = files.indexOf('043_vehicle_parking_authority_w09a.sql');
    assert.equal(w09aIndex, files.length - 1, 'W09A migration must be the final current migration');
    const prior = files
      .slice(0, w09aIndex)
      .map((name) => {
        const sql = readFileSync(resolve(migrationDirectory, name), 'utf8');
        return name === '022_kost_type_commercial_authority.sql'
          ? `${sql}\nALTER TABLE kost_type_rules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`
          : sql;
      })
      .join('\n');
    const migration = readFileSync(
      resolve(migrationDirectory, '043_vehicle_parking_authority_w09a.sql'),
      'utf8',
    );
    const exactProbe = `
      DO $proof$
      BEGIN
        IF to_regclass('public.parking_assignment_histories') IS NULL
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_parking_assignment_history_append_only' AND tgrelid=to_regclass('public.parking_assignment_histories'))
           OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicle_files' AND column_name='issued_at')
           OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicle_files' AND column_name='valid_until')
        THEN RAISE EXCEPTION 'W09A_MIGRATION_AUTHORITY_MISSING'; END IF;
      END
      $proof$;
    `;
    try {
      initialize(replayDirectory);
      if (!requireStarted(start(replayDirectory, replayPort), context)) return;
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
      if (!requireStarted(start(rollbackDirectory, rollbackPort), context)) return;
      const priorResult = run(rollbackPort, prior);
      assert.equal(priorResult.status, 0, 'pre-W09A migration sequence failed');
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        `DO $$ BEGIN RAISE EXCEPTION 'W09A_SYNTHETIC_ROLLBACK'; END $$; COMMIT;`,
      );
      const failed = run(rollbackPort, failedMigration);
      assert.notEqual(failed.status, 0, 'synthetic W09A migration failure was not triggered');
      const rollbackProbe = run(
        rollbackPort,
        `DO $rollback$
         BEGIN
           IF to_regclass('public.parking_assignment_histories') IS NOT NULL
              OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicle_files' AND column_name IN ('issued_at', 'valid_until'))
           THEN RAISE EXCEPTION 'W09A_MIGRATION_ROLLBACK_INCOMPLETE'; END IF;
         END
         $rollback$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'W09A rollback probe failed');
    } finally {
      stop(replayDirectory);
      stop(rollbackDirectory);
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
