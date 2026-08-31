import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { ActivityLogController } from '../../src/modules/activity-log/activity-log.controller';
import { ActivityLogService } from '../../src/modules/activity-log/activity-log.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const propertyId = '11111111-1111-4111-8111-111111111111';
const activityId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const paymentId = '44444444-4444-4444-8444-444444444444';
const residentId = '55555555-5555-4555-8555-555555555555';
const roomId = '66666666-6666-4666-8666-666666666666';
const leaseId = '77777777-7777-4777-8777-777777777777';

const actor = (properties = [propertyId]): UserAccessContext => ({
  id: actorId,
  email: 'admin@test',
  phone: null,
  displayName: 'Admin Test',
  roles: ['admin'],
  permissions: ['activity_log.read'],
  propertyIds: properties,
  sessionId: 'session',
});

void test('M9 Admin Activity Log route is admin-only and requires explicit read authority', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivityLogController), ['admin']);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, ActivityLogController), [
    'activity_log.read',
  ]);
});

void test('M9 activity list is property scoped and returns only privacy-redacted audit fields', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const service = new ActivityLogService({
    client: {
      query: (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return {
          rows: [
            {
              id: activityId,
              property_id: propertyId,
              action: 'billing.payment_verified',
              resource_type: 'payment',
              resource_id: paymentId,
              before_data: { payment_status: 'pending_confirmation' },
              after_data: {
                payment_status: 'verified',
                amount: 1_800_000,
                reason: 'Transfer bank telah diterima',
                receipt_id: activityId,
                bank_account: 'SHOULD_NOT_LEAK',
                password: 'SHOULD_NOT_LEAK',
                token: 'SHOULD_NOT_LEAK',
                storage_path: 'SHOULD_NOT_LEAK',
              },
              result_status: 'success',
              correlation_id: 'correlation-safe',
              occurred_at: new Date('2026-08-29T03:00:00.000Z'),
              actor_user_id: actorId,
              actor_display_name: 'Diki Karya Permana',
              actor_type: 'admin',
              category: 'payment',
              activity_result: 'succeeded',
              resident_id: residentId,
              resident_name: 'FARHAN',
              room_id: roomId,
              room_number: 'AK-18-06',
              lease_id: leaseId,
              lease_code: 'LEASE-001',
              payment_id: paymentId,
              payment_code: 'PAY-001',
              invoice_id: null,
              invoice_code: null,
              total_count: '1',
            },
          ],
        };
      },
    },
  } as never);

  const result = await service.list(actor(), {
    property_id: propertyId,
    category: 'payment',
    limit: 25,
    offset: 0,
  });
  assert.equal(result.meta.total, 1);
  assert.equal(result.data[0]?.actor.display_name, 'Diki Karya Permana');
  assert.equal(result.data[0]?.actor.type, 'admin');
  assert.equal(result.data[0]?.target.resident?.id, residentId);
  assert.equal(result.data[0]?.target.room?.number, 'AK-18-06');
  assert.equal(result.data[0]?.target.lease?.id, leaseId);
  assert.deepEqual(result.data[0]?.change_summary, [
    { field: 'payment_status', before: 'pending_confirmation', after: 'verified' },
    { field: 'amount', before: null, after: 1_800_000 },
  ]);
  assert.equal(result.data[0]?.reason, 'Transfer bank telah diterima');
  assert.deepEqual(result.data[0]?.evidence_references, [
    { kind: 'receipt_id', reference: activityId },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /SHOULD_NOT_LEAK|bank_account|password|token|storage_path|before_data|after_data/i,
  );
  const [call] = calls;
  assert.ok(call);
  assert.match(call.sql, /WHERE audit\.property_id=\$1/);
  assert.match(call.sql, /payment_reversals/);
  assert.match(call.sql, /lease_settlement_checkpoints/);
  assert.equal(call.params[0], propertyId);
});

void test('M9 unauthorised property and invalid dates fail before any audit query', async () => {
  let calls = 0;
  const service = new ActivityLogService({
    client: { query: () => (calls += 1) },
  } as never);
  await assert.rejects(
    service.list(actor([]), { property_id: propertyId }),
    /not allowed|PROPERTY_SCOPE_DENIED/i,
  );
  await assert.rejects(
    service.list(actor(), { property_id: propertyId, from: '2026-02-30' }),
    /valid calendar dates|ACTIVITY_LOG_DATE_INVALID/i,
  );
  await assert.rejects(
    service.list(actor(), { property_id: propertyId, from: '2026-09-01', to: '2026-08-01' }),
    /start date|ACTIVITY_LOG_DATE_RANGE_INVALID/i,
  );
  assert.equal(calls, 0);
});

void test('M9 migration and manifest preserve explicit Admin-only activity-log authority', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../src/infrastructure/database/migrations/056_admin_activity_log_m9.sql',
    ),
    'utf8',
  );
  const manifest = readFileSync(
    resolve(__dirname, '../../src/infrastructure/database/scripts/migration-manifest.ts'),
    'utf8',
  );
  assert.match(migration, /'activity_log\.read'/);
  assert.match(migration, /WHERE role\.code='admin'/);
  assert.doesNotMatch(migration, /property_owner.*activity_log\.read/i);
  assert.match(manifest, /056_admin_activity_log_m9\.sql/);
  assert.match(manifest, /a13353daeb945329b240c00848f4f9637846a51bc80ac68dabc1068617bb1b98/);
});

void test('M9 lifecycle records System activity only after an idempotent notification is created', () => {
  const scheduler = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/billing/services/contract-settlement-lifecycle.scheduler.ts',
    ),
    'utf8',
  );
  const activityLog = readFileSync(
    resolve(__dirname, '../../src/modules/activity-log/activity-log.service.ts'),
    'utf8',
  );
  const activation = readFileSync(
    resolve(__dirname, '../../src/modules/lease/lease-activation.service.ts'),
    'utf8',
  );
  assert.match(
    scheduler,
    /ON CONFLICT\(checkpoint_id,notification_kind,recipient_user_id\) DO NOTHING/,
  );
  assert.match(scheduler, /notification\.lease_settlement_created/);
  assert.match(scheduler, /resource_type,resource_id,after_data,result_status,correlation_id/);
  assert.match(
    activityLog,
    /'notification\.lease_settlement_created': 'Notifikasi pelunasan dibuat'/,
  );
  assert.match(activityLog, /'lease\.activate': 'Penyewaan diaktifkan'/);
  assert.match(
    activityLog,
    /'booking_lead_hold\.expire': 'Penahanan kamar minat booking kedaluwarsa'/,
  );
  assert.match(
    activityLog,
    /'billing\.onboarding_cash_recorded': 'Pembayaran tunai onboarding dicatat'/,
  );
  assert.match(activityLog, /'reminder\.invoice_share\.issued': 'Pengingat invoice dibagikan'/);
  assert.match(activityLog, /'resident\.onboarding_commit': 'Onboarding penghuni dikonfirmasi'/);
  assert.match(activation, /actorId: null,\s*source: 'automatic_cutoff'/);
  assert.match(activation, /actorUserId: input\.actorId \?\? undefined/);
});
