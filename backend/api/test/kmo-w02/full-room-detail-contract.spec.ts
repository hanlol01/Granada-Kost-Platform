import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { AdminUxRoomDetailService } from '../../src/modules/admin-ux-master/admin-ux-room-detail.service';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const BUILDING_ID = '33333333-3333-4333-8333-333333333333';
const TYPE_ID = '44444444-4444-4444-8444-444444444444';
const OCCUPANCY_ID = '55555555-5555-4555-8555-555555555555';
const RESIDENT_ID = '66666666-6666-4666-8666-666666666666';
const LEASE_ID = '77777777-7777-4777-8777-777777777777';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function responseCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String(response.code)
    : undefined;
}

function fixture(
  options: {
    occupancies?: number;
    leases?: number;
    activeHold?: boolean;
    activeMaintenance?: boolean;
    timeline?: Array<{ event_type: string; occurred_at: string }>;
  } = {},
) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const identity = {
    id: ROOM_ID,
    property_id: PROPERTY_ID,
    kost_type_id: TYPE_ID,
    number: 'RK-01-01',
    room_code: 'RK-01-01',
    building_id: BUILDING_ID,
    unit_code: '01',
    gender_policy: 'male',
    floor_code: 'B',
    floor_label: 'Lantai Bawah / LT.1',
    size_label: '3 x 4 m',
    room_status: 'occupied',
    public_visible: true,
    import_notes: null,
    updated_at: '2026-07-31T00:00:00.000Z',
    building_code: 'RK-01',
    building_name: 'RuKost 01',
    category: 'rukost',
    kost_type_name: 'Rumah Kost',
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
    deposit_amount: 1_800_000,
    commercial_effective_date: '2026-07-31',
    minimum_dp_percent: 25,
    security_deposit_months: 1,
    payment_schedules: ['annual', 'two_month_installments'],
    active_hold_exists: options.activeHold ?? false,
    active_maintenance_exists: options.activeMaintenance ?? false,
  };
  const occupancy = {
    id: OCCUPANCY_ID,
    resident_id: RESIDENT_ID,
    start_date: '2026-01-01',
    end_date: null,
    occupancy_status: 'active',
    full_name: 'Resident Safe Name',
    account_status: 'active',
  };
  const lease = {
    id: LEASE_ID,
    lease_code: 'LEASE-001',
    lease_status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    billing_cycle: 'yearly',
    occupancy_id: OCCUPANCY_ID,
    resident_id: RESIDENT_ID,
    snapshot_yearly_price: 21_600_000,
    snapshot_deposit_amount: 1_800_000,
    deposit_collected_amount: 1_800_000,
    deposit_refunded_amount: 0,
    deposit_deduction_amount: 0,
  };
  const query = async (sql: string, values: unknown[] = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), values });
    if (sql.startsWith('SET TRANSACTION')) return { rows: [] };
    if (sql.includes('FROM rooms room')) return { rows: [identity] };
    if (sql.includes('FROM kost_type_content_facilities')) {
      return { rows: [{ id: TYPE_ID, name: 'Kasur' }] };
    }
    if (sql.includes('FROM occupancies occupancy')) {
      return { rows: Array.from({ length: options.occupancies ?? 1 }, () => occupancy) };
    }
    if (sql.includes('FROM leases lease')) {
      return { rows: Array.from({ length: options.leases ?? 1 }, () => lease) };
    }
    if (sql.includes('FROM invoices invoice')) {
      return {
        rows: [
          {
            open_invoiced_amount: 21_600_000,
            verified_invoice_allocated: 5_400_000,
            open_verified_invoice_allocated: 5_400_000,
            next_due_date: '2026-08-01',
            next_due_period: '2026-08',
            awaiting_confirmation_amount: 0,
          },
        ],
      };
    }
    if (sql.includes('FROM vehicles vehicle')) return { rows: [] };
    if (sql.includes('FROM complaints complaint')) return { rows: [] };
    if (sql.includes('FROM (') && sql.includes('safe_timeline')) {
      return { rows: options.timeline ?? [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const client = { query };
  const database = {
    client,
    transaction: async <T>(operation: (transactionClient: typeof client) => Promise<T>) =>
      operation(client),
  };
  const properties = {
    assertCanReadProperty: async (_user: unknown, propertyId: string) => {
      if (propertyId !== PROPERTY_ID) throw new Error('PROPERTY_SCOPE_DENIED');
    },
  };
  return {
    service: new AdminUxRoomDetailService(database as never, properties as never),
    calls,
  };
}

const user = {
  id: '88888888-8888-4888-8888-888888888888',
  roles: ['admin'],
  permissions: ['room.read'],
  propertyIds: [PROPERTY_ID],
};

test('live by-number detail returns exact envelope and safe section projection', async () => {
  const current = fixture();
  const response = await current.service.getByNumber(user as never, ' RK-01-01 ', {
    property_id: PROPERTY_ID,
  });
  assert.deepEqual(Object.keys(response), ['data']);
  assert.equal(response.data.number, 'RK-01-01');
  assert.equal(response.data.commercial.minimum_dp_amount, 5_400_000);
  assert.equal(response.data.billing.minimum_dp_amount, 5_400_000);
  assert.equal(response.data.billing.verified_invoice_allocated, 5_400_000);
  assert.equal(response.data.lease?.duration_months, 12);
  assert.equal(response.data.billing.security_deposit_required, 1_800_000);
  assert.equal(response.data.billing.dp_verified_amount, null);
  assert.equal(response.data.ownership.display_name, 'KOSTATION');
  assert.equal(response.data.ownership.source, 'policy_default');
  assert.equal(response.data.ownership.ownership_reconciliation_required, true);
  assert.equal(response.data.links.lease, `/penyewaan/${LEASE_ID}`);
  assert.equal(response.data.links.resident, null);
  assert.equal(JSON.stringify(response).includes('password'), false);
  assert.equal(JSON.stringify(response).includes('ktp'), false);
  assert.equal(JSON.stringify(response).includes('phone'), false);
  assert.equal(JSON.stringify(response).includes('before_data'), false);
  assert.equal(
    current.calls.some((call) => /INSERT|UPDATE|DELETE/.test(call.sql)),
    false,
  );
  assert.equal(current.calls[0]?.sql, 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const projectionCalls = current.calls.filter((call) => call.sql.startsWith('SELECT'));
  assert.equal(projectionCalls.length, 8);
  assert.ok(projectionCalls.every((call) => call.values.includes(PROPERTY_ID)));
});

test('active hold, maintenance, and reconciliation independently lock structural edits', async () => {
  const hold = await fixture({ activeHold: true }).service.getByNumber(user as never, 'RK-01-01', {
    property_id: PROPERTY_ID,
  });
  assert.equal(hold.data.physical.structural_edit_locked, true);

  const maintenance = await fixture({ activeMaintenance: true }).service.getByNumber(
    user as never,
    'RK-01-01',
    { property_id: PROPERTY_ID },
  );
  assert.equal(maintenance.data.physical.structural_edit_locked, true);

  const reconciliation = await fixture({ leases: 0 }).service.getByNumber(
    user as never,
    'RK-01-01',
    { property_id: PROPERTY_ID },
  );
  assert.equal(reconciliation.data.physical.structural_edit_locked, true);
});

test('timeline emits only bounded whitelisted events with server-owned labels', async () => {
  const response = await fixture({
    timeline: [
      { event_type: 'room_updated', occurred_at: '2026-07-31T00:00:00.000Z' },
      { event_type: 'raw_database_event', occurred_at: '2026-07-30T00:00:00.000Z' },
    ],
  }).service.getByNumber(user as never, 'RK-01-01', { property_id: PROPERTY_ID });
  assert.deepEqual(response.data.timeline, [
    {
      event_type: 'room_updated',
      label: 'Inventori kamar diperbarui',
      occurred_at: '2026-07-31T00:00:00.000Z',
    },
  ]);
});

test('zero lease preserves resident and declares legacy reconciliation', async () => {
  const current = fixture({ leases: 0 });
  const response = await current.service.getByNumber(user as never, 'RK-01-01', {
    property_id: PROPERTY_ID,
  });
  assert.equal(response.data.resident?.display_name, 'Resident Safe Name');
  assert.equal(response.data.lease, null);
  assert.equal(response.data.reconciliation.state, 'lease_reconciliation_required');
});

test('active lease without active occupancy remains explicit reconciliation', async () => {
  const current = fixture({ occupancies: 0 });
  const response = await current.service.getByNumber(user as never, 'RK-01-01', {
    property_id: PROPERTY_ID,
  });
  assert.equal(response.data.resident, null);
  assert.equal(response.data.lease?.code, 'LEASE-001');
  assert.equal(response.data.reconciliation.state, 'lease_reconciliation_required');
});

test('multiple active occupancy and lease authorities fail closed', async () => {
  await assert.rejects(
    () =>
      fixture({ occupancies: 2 }).service.getByNumber(user as never, 'RK-01-01', {
        property_id: PROPERTY_ID,
      }),
    (error) => responseCode(error) === 'ROOM_ACTIVE_OCCUPANCY_AMBIGUOUS',
  );
  await assert.rejects(
    () =>
      fixture({ leases: 2 }).service.getByNumber(user as never, 'RK-01-01', {
        property_id: PROPERTY_ID,
      }),
    (error) => responseCode(error) === 'ROOM_ACTIVE_LEASE_AMBIGUOUS',
  );
});

test('role and property authorization happen before section expansion', async () => {
  const denied = fixture();
  await assert.rejects(
    () =>
      denied.service.getByNumber({ ...user, roles: ['property_owner'] } as never, 'RK-01-01', {
        property_id: PROPERTY_ID,
      }),
    (error) => responseCode(error) === 'ROOM_DETAIL_FORBIDDEN',
  );
  assert.equal(denied.calls.length, 0);

  const propertyDenied = fixture();
  await assert.rejects(() =>
    propertyDenied.service.getByNumber(user as never, 'RK-01-01', {
      property_id: '99999999-9999-4999-8999-999999999999',
    }),
  );
  assert.equal(propertyDenied.calls.length, 0);
});

function assertSourceContract(candidate: string) {
  assert.match(candidate, /WHERE room\.property_id = \$1/);
  assert.match(candidate, /room\.number = \$2/);
  assert.doesNotMatch(candidate, /room\.room_code = \$2/);
  assert.match(candidate, /result\.rows\.length > 1/);
  assert.doesNotMatch(candidate, /LIMIT 1/);
  assert.match(candidate, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(candidate, /active_hold_exists/);
  assert.match(candidate, /active_maintenance_exists/);
  assert.match(candidate, /Boolean\(room\.active_hold_exists\)/);
  assert.match(candidate, /Boolean\(room\.active_maintenance_exists\)/);
  assert.equal((candidate.match(/allocation\.target_type = 'invoice'/g) ?? []).length, 2);
  assert.match(candidate, /deposit_collected_amount/);
  assert.match(candidate, /dp_verified_amount: null/);
  assert.match(candidate, /source: 'policy_default'/);
  assert.match(candidate, /audit\.occurred_at/);
  assert.match(candidate, /TIMELINE_LABELS\[eventType\]/);
  assert.doesNotMatch(candidate, /resident\.phone/);
  assert.doesNotMatch(candidate, /before_data|after_data|user_agent|ip_address/);
  assert.doesNotMatch(candidate, /INSERT INTO|UPDATE rooms|DELETE FROM/);
}

test('source contract is mutation-sensitive for property scope, ambiguity, money, ownership, and timeline', () => {
  const detail = source('backend/api/src/modules/admin-ux-master/admin-ux-room-detail.service.ts');
  assertSourceContract(detail);
  for (const mutation of [
    detail.replaceAll('WHERE room.property_id = $1', 'WHERE true'),
    detail.replace('room.number = $2', 'room.number = $2 OR room.room_code = $2'),
    detail.replaceAll('result.rows.length > 1', 'false'),
    detail.replace('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', 'SELECT 1'),
    detail.replace('Boolean(room.active_hold_exists)', 'false'),
    detail.replace('Boolean(room.active_maintenance_exists)', 'false'),
    detail.replace('ORDER BY room.id', 'ORDER BY room.id LIMIT 1'),
    detail.replaceAll("allocation.target_type = 'invoice'", "allocation.target_type = 'deposit'"),
    detail.replace("source: 'policy_default'", "source: 'investor'"),
    detail.replace('audit.occurred_at', 'audit.after_data'),
    detail.replace('TIMELINE_LABELS[eventType]', 'eventType'),
  ]) {
    assert.throws(() => assertSourceContract(mutation));
  }
});

test('live controller registers by-number before UUID detail and keeps legacy UUID path', () => {
  const controller = source('backend/api/src/modules/room/room.controller.ts');
  const byNumber = controller.indexOf("@Get('by-number/:roomNumber')");
  const byId = controller.indexOf("@Get(':roomId')");
  assert.ok(byNumber > 0 && byId > byNumber);
  assert.match(controller.slice(byNumber, byId), /RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(controller.slice(byNumber, byId), /RequirePermissions\('room\.read'\)/);
  assert.match(controller.slice(byNumber, byId), /this\.roomDetail\.getByNumber/);
  assert.match(controller.slice(byId), /this\.roomsV2\.get/);
});
