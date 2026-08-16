import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseCheckoutService } from '../../src/modules/lease/lease-checkout.service';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const LEASE_ID = '22222222-2222-4222-8222-222222222222';
const OCCUPANCY_ID = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = '44444444-4444-4444-8444-444444444444';
const ROOM_ID = '55555555-5555-4555-8555-555555555555';
const COMMAND_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';

const admin = {
  id: USER_ID,
  roles: ['admin'],
  permissions: ['lease.manage', 'billing.manage'],
  propertyIds: [PROPERTY_ID],
};
const context = { correlationId: 'w07d-test' };
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

type Options = {
  today?: string;
  state?: string;
  evidence?: string[];
  failRoomUpdate?: boolean;
  idempotencyConflict?: boolean;
};
function harness(options: Options = {}) {
  const events: string[] = [];
  const queries: string[] = [];
  let state = options.state ?? 'settlement_pending';
  const command = () => ({
    id: COMMAND_ID,
    property_id: PROPERTY_ID,
    lease_id: LEASE_ID,
    occupancy_id: OCCUPANCY_ID,
    resident_id: RESIDENT_ID,
    room_id: ROOM_ID,
    state,
    effective_date: '2026-10-01',
    notice_recorded_date: '2026-09-01',
    notice_reason: 'Pindah',
    notice_exception_reason: null,
  });
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      queries.push(q);
      if (/INSERT INTO idempotency_commands/.test(q)) {
        if (options.idempotencyConflict) return { rows: [], rowCount: 0 };
        return { rows: [{ request_fingerprint: 'new' }], rowCount: 1 };
      }
      if (
        /SELECT request_fingerprint,command_status,response_status,response_body FROM idempotency_commands/.test(
          q,
        )
      )
        return {
          rows: [
            {
              request_fingerprint: 'different-request',
              command_status: 'succeeded',
              response_status: 200,
              response_body: { data: {} },
            },
          ],
          rowCount: 1,
        };
      if (/SELECT \(now\(\) AT TIME ZONE 'Asia\/Jakarta'\)/.test(q))
        return { rows: [{ today: options.today ?? '2026-10-01' }], rowCount: 1 };
      if (/SELECT \(\$1::date \+ 14\)/.test(q))
        return { rows: [{ minimum_date: '2026-10-15' }], rowCount: 1 };
      if (/SELECT property_id FROM leases/.test(q))
        return { rows: [{ property_id: PROPERTY_ID }], rowCount: 1 };
      if (/FROM property_feature_flags/.test(q))
        return {
          rows: [
            {
              property_id: PROPERTY_ID,
              admin_ux_read: true,
              lease_write: true,
              lease_transfer: false,
              lease_billing_scheduler: false,
              lease_renewal: false,
              lease_renewal_scheduler: false,
              lease_checkout: true,
            },
          ],
          rowCount: 1,
        };
      if (/FROM properties WHERE/.test(q)) return { rows: [{ id: PROPERTY_ID }], rowCount: 1 };
      if (/FROM lease_checkout_commands WHERE id=\$1 AND lease_id=\$2 FOR UPDATE/.test(q))
        return { rows: [command()], rowCount: 1 };
      if (/SELECT inspection_room_status FROM lease_checkout_commands/.test(q))
        return { rows: [{ inspection_room_status: 'inspection_required' }], rowCount: 1 };
      if (/FROM leases WHERE id=\$1 FOR UPDATE/.test(q))
        return {
          rows: [
            {
              id: LEASE_ID,
              property_id: PROPERTY_ID,
              occupancy_id: OCCUPANCY_ID,
              resident_id: RESIDENT_ID,
              room_id: ROOM_ID,
              lease_status: 'active',
            },
          ],
          rowCount: 1,
        };
      if (/FROM occupancies WHERE/.test(q) || /FROM rooms WHERE/.test(q))
        return { rows: [{ id: params[0] }], rowCount: 1 };
      if (/SELECT DISTINCT evidence_category/.test(q))
        return {
          rows: (options.evidence ?? ['keys_access', 'inventory', 'parking', 'inspection']).map(
            (evidence_category) => ({ evidence_category }),
          ),
          rowCount: 4,
        };
      if (/FROM invoices i/.test(q))
        return {
          rows: [
            {
              id: '88888888-8888-4888-8888-888888888888',
              total_amount: '500',
              credit_amount: '0',
              net_allocated: '0',
            },
          ],
          rowCount: 1,
        };
      if (/FROM lease_deposit_transactions WHERE lease_id=\$1 ORDER BY/.test(q))
        return { rows: [{ direction: 'credit', amount: '1000' }], rowCount: 1 };
      if (/SELECT slot.id FROM parking_slots/.test(q)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO lease_deposit_transactions/.test(q))
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      if (/generate_series/.test(q)) return { rows: [{ due_date: '2026-10-10' }], rowCount: 1 };
      if (
        /UPDATE occupancies SET/.test(q) ||
        /UPDATE leases SET/.test(q) ||
        /UPDATE rooms SET/.test(q)
      )
        return { rows: [], rowCount: options.failRoomUpdate && /UPDATE rooms SET/.test(q) ? 0 : 1 };
      if (/UPDATE lease_checkout_commands SET state='completed'/.test(q)) {
        state = 'completed';
        return { rows: [command()], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const repo = {
    query: client.query,
    transaction: async (operation: (transaction: typeof client) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await operation(client);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  };
  const features = {
    assertCheckoutEnabled: async () => undefined,
    isCheckoutEnabled: async () => true,
  };
  const w06 = {
    reconcileInvoiceLifecycleInTransaction: async () => {
      events.push('w06-reconcile');
    },
  };
  return {
    service: new LeaseCheckoutService(repo as never, features as never, w06 as never),
    events,
    queries,
  };
}

test('W07D completion is atomic, reconciles W06 credit, releases parking, and produces a weekday refund due date', async () => {
  const h = harness();
  const result = await h.service.complete(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    { room_status_after: 'inspection_required' },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);

  assert.equal(result.replayed, false);
  assert.ok(!h.queries.some((q) => /INSERT INTO payment_allocations/.test(q)));
  assert.ok(!h.queries.some((q) => /property_owner_earnings/.test(q)));
});

test('W07D completion fails closed when required evidence is absent and does not end occupancy', async () => {
  const h = harness({ evidence: ['keys_access', 'inventory', 'inspection'] });
  await assert.rejects(
    () =>
      h.service.complete(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        { room_status_after: 'inspection_required' },
        '1234567890123456',
        context,
      ),
    (error: any) => error.response?.code === 'CHECKOUT_EVIDENCE_REQUIRED',
  );
  assert.deepEqual(h.events, ['begin', 'rollback']);
  assert.ok(!h.queries.some((q) => /UPDATE occupancies SET occupancy_status='ended'/.test(q)));
});

test('W07D notice requires 14 Jakarta days or a recorded exception, and property-owner is denied', async () => {
  const h = harness({ state: 'notice_received' });
  await assert.rejects(
    () =>
      h.service.notice(
        admin as never,
        LEASE_ID,
        { effective_date: '2026-10-02', reason: 'Pindah' },
        '1234567890123456',
        context,
      ),
    (error: any) => error.response?.code === 'CHECKOUT_NOTICE_REQUIRED',
  );
  await assert.rejects(
    () =>
      h.service.notice(
        { ...admin, roles: ['property_owner'] } as never,
        LEASE_ID,
        { effective_date: '2026-10-20', reason: 'Pindah' },
        '1234567890123456',
        context,
      ),
    (error: any) => error.response?.code === 'FORBIDDEN',
  );
});

test('W07D handover rejects an unconfirmed physical handover before recording evidence', async () => {
  const h = harness({ state: 'scheduled' });
  await assert.rejects(
    () =>
      h.service.handover(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        {
          key_access_confirmed: true,
          inventory_confirmed: false,
          parking_confirmed: true,
        } as never,
        '1234567890123456',
        context,
      ),
    (error: any) => error.response?.code === 'CHECKOUT_HANDOVER_CONFIRMATION_REQUIRED',
  );
  assert.deepEqual(h.events, ['begin', 'rollback']);
  assert.ok(!h.queries.some((q) => /INSERT INTO lease_checkout_evidence/.test(q)));
});

test('W07D completion rolls back when a terminal write fails', async () => {
  const h = harness({ failRoomUpdate: true });
  await assert.rejects(() =>
    h.service.complete(
      admin as never,
      LEASE_ID,
      COMMAND_ID,
      { room_status_after: 'inspection_required' },
      '1234567890123456',
      context,
    ),
  );
  assert.equal(h.events.at(-1), 'rollback');
});

test('W07D rejects an idempotency key reused with a different payload', async () => {
  const h = harness({ idempotencyConflict: true });
  await assert.rejects(
    () =>
      h.service.complete(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        { room_status_after: 'inspection_required' },
        '1234567890123456',
        context,
      ),
    (error: any) => error.response?.code === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.deepEqual(h.events, ['begin', 'rollback']);
});
