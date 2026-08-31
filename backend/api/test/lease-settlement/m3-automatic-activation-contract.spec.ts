import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { LeaseCheckInService } from '../../src/modules/lease/lease-check-in.service';

const root = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migrationPath =
  'src/infrastructure/database/migrations/050_automatic_activation_physical_check_in.sql';

void test('M3 schema is manifest-bound, opt-in, and does not backfill legacy leases', () => {
  const migration = read(migrationPath);
  const manifest = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '050_automatic_activation_physical_check_in.sql',
  );
  assert.ok(manifest);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifest.checksumSha256);
  assert.match(migration, /'awaiting_check_in'/);
  assert.match(migration, /lease_activation_scheduler BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_activation_lifecycles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_activation_attempts/);
  assert.match(migration, /'technical_retry'/);
  assert.match(migration, /'check_in_confirmation_required'/);
  assert.doesNotMatch(migration, /INSERT INTO lease_activation_lifecycles[\s\S]*?SELECT/i);
});

void test('contract activation reserves the room without claiming physical occupancy', () => {
  const source = read('src/modules/lease/lease-activation.service.ts');
  assert.match(source, /payment\.paid_at <= \$3::timestamptz/);
  assert.match(source, /SET lease_status='active',occupancy_id=NULL/);
  assert.match(source, /UPDATE rooms SET room_status='awaiting_check_in'/);
  assert.match(source, /occupancyStatus: 'awaiting_check_in'/);
  assert.doesNotMatch(source, /INSERT INTO occupancies/);
});

void test('physical check-in alone creates occupancy and marks the room occupied', () => {
  const source = read('src/modules/lease/lease-check-in.service.ts');
  const controller = read('src/modules/lease/lease-activation.controller.ts');
  assert.match(controller, /@Post\(':leaseId\/check-in'\)/);
  assert.match(source, /INSERT INTO occupancies/);
  assert.match(source, /'check_in'/);
  assert.match(source, /UPDATE rooms SET room_status='occupied'/);
  assert.match(source, /SET state='checked_in',checked_in_at=/);
  assert.match(source, /LEASE_CHECK_IN_WRITE_CONFLICT/);
  assert.match(source, /LEASE_CHECK_IN_ROOM_CONFLICT/);
});

void test('automatic cutoff and H+1 reconciliation are double-gated and idempotent', () => {
  const scheduler = read('src/modules/lease/lease-activation.scheduler.ts');
  const features = read('src/modules/lease/lease-feature.service.ts');
  const configuration = read('src/infrastructure/config/configuration.ts');
  assert.match(scheduler, /pg_try_advisory_lock/);
  assert.match(scheduler, /lifecycle\.state='scheduled'/);
  assert.match(scheduler, /lifecycle\.state='awaiting_check_in'/);
  assert.match(scheduler, /reconcileNoShow/);
  assert.match(features, /lease_activation_scheduler/);
  assert.match(configuration, /activationSchedulerProcessEnabled/);
  assert.match(configuration, /LEASE_ACTIVATION_SCHEDULER_PROCESS_ENABLED/);
});

void test('new commitments schedule Jakarta cutoff while one full month remains mandatory', () => {
  const issuance = read('src/modules/billing/services/contract-schedule-issuance.service.ts');
  const onboarding = read('src/modules/resident/onboarding.service.ts');
  assert.match(issuance, /INSERT INTO lease_activation_lifecycles/);
  assert.match(issuance, /\$3::date \+ TIME '00:05'/);
  assert.match(issuance, /\$3::date \+ 1 \+ TIME '00:05'/);
  assert.match(onboarding, /initialRentCredit < room\.monthly_price/);
});

void test('physical check-in transaction creates one occupancy after authority and conflict checks', async () => {
  const propertyId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const leaseId = '33333333-3333-4333-8333-333333333333';
  const residentId = '44444444-4444-4444-8444-444444444444';
  const roomId = '55555555-5555-4555-8555-555555555555';
  const occupancyId = '66666666-6666-4666-8666-666666666666';
  const lifecycleId = '77777777-7777-4777-8777-777777777777';
  const checkedInAt = new Date('2026-08-29T03:00:00.000Z');
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      await Promise.resolve();
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (/INSERT INTO idempotency_commands/.test(normalized))
        return { rows: [{ id: 'command' }], rowCount: 1 };
      if (/SELECT lifecycle\.id AS lifecycle_id/.test(normalized))
        return {
          rows: [
            {
              lifecycle_id: lifecycleId,
              lifecycle_state: 'awaiting_check_in',
              lease_status: 'active',
              activated_at: new Date('2026-08-29T00:00:00.000Z'),
              occupancy_id: null,
              resident_id: residentId,
              resident_status: 'pending_activation',
              room_id: roomId,
              room_number: 'AK-18-01',
              room_status: 'awaiting_check_in',
              start_date: '2026-08-29',
            },
          ],
          rowCount: 1,
        };
      if (/WITH chosen AS/.test(normalized))
        return { rows: [{ checked_in_at: checkedInAt, valid: true }], rowCount: 1 };
      if (/AS occupancy_count/.test(normalized))
        return { rows: [{ occupancy_count: '0', lease_count: '0' }], rowCount: 1 };
      if (/INSERT INTO occupancies/.test(normalized))
        return { rows: [{ id: occupancyId }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new LeaseCheckInService(
    {
      transaction: async (operation: (value: typeof client) => Promise<unknown>) => operation(client),
    } as never,
    {
      assertCanReadProperty: async () => {
        await Promise.resolve();
      },
    } as never,
    {
      write: async () => {
        await Promise.resolve();
      },
    } as never,
  );
  const result = await service.confirm(
    {
      id: actorId,
      roles: ['admin'],
      permissions: ['lease.manage'],
      propertyIds: [propertyId],
    } as never,
    leaseId,
    { property_id: propertyId },
    'm3-check-in-idempotency-key',
    {},
  );

  assert.deepEqual(result.data, {
    leaseId,
    occupancyId,
    occupancyStatus: 'active',
    roomStatus: 'occupied',
    checkedInAt: checkedInAt.toISOString(),
  });
  const authorityIndex = queries.findIndex((sql) => /SELECT lifecycle\.id/.test(sql));
  const conflictIndex = queries.findIndex((sql) => /AS occupancy_count/.test(sql));
  const occupancyIndex = queries.findIndex((sql) => /INSERT INTO occupancies/.test(sql));
  assert.ok(authorityIndex >= 0 && conflictIndex > authorityIndex && occupancyIndex > conflictIndex);
  assert.equal(
    queries.some((sql) => /UPDATE rooms SET room_status='occupied'/.test(sql)),
    true,
  );
  assert.equal(
    queries.some((sql) => /SET state='checked_in',checked_in_at=/.test(sql)),
    true,
  );
});
