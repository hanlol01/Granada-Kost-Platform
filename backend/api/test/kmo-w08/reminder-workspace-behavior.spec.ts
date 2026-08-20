import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReminderWorkspaceGroups,
  ReminderWorkspaceService,
  type ReminderWorkspaceLeaseRow,
} from '../../src/modules/reminder/reminder-workspace.service';

const row = (overrides: Partial<ReminderWorkspaceLeaseRow> = {}): ReminderWorkspaceLeaseRow => ({
  lease_id: '00000000-0000-4000-8000-000000000001',
  resident_id: '00000000-0000-4000-8000-000000000002',
  resident_name: 'Ayu',
  room_number: 'RK-01-01',
  snapshot_kost_type_name: 'Rumah Kost',
  lease_end_date: '2026-10-10',
  days_remaining: 53,
  outstanding_amount: '1000000',
  renewal_state: null,
  checkout_state: null,
  ...overrides,
});

void test('derived reminder groups use explicit H-60, H-30, and H-14 windows', () => {
  const groups = buildReminderWorkspaceGroups([
    row(),
    row({ lease_id: '00000000-0000-4000-8000-000000000003', days_remaining: 20 }),
    row({ lease_id: '00000000-0000-4000-8000-000000000004', days_remaining: 7 }),
  ]);
  assert.equal(groups.h60.length, 1);
  assert.equal(groups.h30.length, 1);
  assert.equal(groups.h14.length, 1);
  assert.equal(groups.h60[0].milestone, 'h60');
  assert.equal(groups.h14[0].milestone, 'h14');
});

void test('resolved renewal and checkout conditions disappear from their work groups', () => {
  const groups = buildReminderWorkspaceGroups([
    row({ renewal_state: 'draft' }),
    row({
      lease_id: '00000000-0000-4000-8000-000000000003',
      days_remaining: 10,
      renewal_state: 'activated',
    }),
    row({
      lease_id: '00000000-0000-4000-8000-000000000004',
      days_remaining: 10,
      checkout_state: 'completed',
    }),
  ]);
  assert.equal(groups.h60.length, 0);
  assert.equal(groups.h30.length, 0);
  assert.equal(groups.h14.length, 1);
});

void test('workspace is property-scoped and combines current-month billing authority', async () => {
  const queries: unknown[][] = [];
  let billingMonth: string | undefined;
  const database = {
    client: {
      query: (sql: string, values?: unknown[]) => {
        queries.push([sql, values]);
        if (sql.trim().startsWith('SELECT (now() AT TIME ZONE'))
          return { rows: [{ today: '2026-08-18' }] };
        if (sql.includes('FROM leases l')) return { rows: [row()] };
        throw new Error('unexpected query');
      },
    },
  };
  const billing = {
    currentWorklist: (_user: unknown, input: { month: string }) => {
      billingMonth = input.month;
      return Promise.resolve({
        data: [],
        meta: { limit: 100, offset: 0, total: 0, month: '2026-08-01' },
      });
    },
  };
  const service = new ReminderWorkspaceService(
    database as never,
    { get: () => Promise.resolve({ id: 'property' }) } as never,
    billing as never,
  );
  const result = await service.workspace({ id: 'admin', roles: ['admin'] } as never, 'property');
  assert.equal(result.data.as_of_date, '2026-08-18');
  assert.equal(result.data.groups.h60.length, 1);
  assert.equal(billingMonth, '2026-08');
  assert.equal(
    queries.some(([, values]) => values?.[0] === 'property'),
    true,
  );
});
