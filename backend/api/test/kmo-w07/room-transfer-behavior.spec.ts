import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseTransferScheduler } from '../../src/modules/lease/lease-transfer.scheduler';
import { LeaseTransferService } from '../../src/modules/lease/lease-transfer.service';
import { RoomService } from '../../src/modules/room/room.service';

// W07B revision 5: real service-level behavioural proofs. Each harness drives
// the actual service against an in-memory transaction/query fake so that
// scheduled execution, late execution, transient-error safety, contractual end
// date continuity, scheduled top-up fail-fast, inspection replay/conflict, and
// rollback (no partial lifecycle writes) are exercised end to end.

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const LEASE_ID = '22222222-2222-4222-8222-222222222222';
const RESIDENT_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_ROOM_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_ROOM_ID = '55555555-5555-4555-8555-555555555555';
const OCCUPANCY_ID = '66666666-6666-4666-8666-666666666666';
const KOST_TYPE_ID = '77777777-7777-4777-8777-777777777777';
const COMMAND_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '99999999-9999-4999-8999-999999999999';

type Write = { sql: string; params: readonly unknown[] };

type TransferOptions = {
  today?: string;
  sourceEndDate?: string | null;
  liveSourceEndDate?: string | null;
  nextBillingDate?: string;
  billingAnchorDay?: number;
  carriedDeposit?: number;
  requiredDeposit?: number;
  commandEffectiveDate?: string;
  targetRoomStatus?: string;
  failOn?: RegExp;
  httpConflictOn?: RegExp;
  pgErrorOn?: { pattern: RegExp; code: string; constraint?: string };
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function transferHarness(options: TransferOptions = {}) {
  const today = options.today ?? '2026-09-10';
  const sourceEndDate = options.sourceEndDate === undefined ? '2027-03-31' : options.sourceEndDate;
  const liveSourceEndDate =
    options.liveSourceEndDate === undefined ? sourceEndDate : options.liveSourceEndDate;
  const nextBillingDate = options.nextBillingDate ?? today;
  const billingAnchorDay = options.billingAnchorDay ?? 10;
  const carriedDeposit = options.carriedDeposit ?? 500_000;
  const requiredDeposit = options.requiredDeposit ?? 500_000;
  const commandEffectiveDate = options.commandEffectiveDate ?? today;
  const targetRoomStatus = options.targetRoomStatus ?? 'vacant';

  const events: string[] = [];
  const queries: string[] = [];
  let pending: Write[] = [];
  const committed: Write[] = [];
  const ledger: Record<
    string,
    Array<{ transaction_type: string; direction: string; amount: number }>
  > = {
    [LEASE_ID]: [{ transaction_type: 'collection', direction: 'credit', amount: carriedDeposit }],
  };
  let targetLeaseId: string | null = null;
  const commandState = { state: 'scheduled' as string };

  const leaseRow = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    property_id: PROPERTY_ID,
    lease_code: `LS-${id.slice(0, 8)}`,
    resident_id: RESIDENT_ID,
    room_id: SOURCE_ROOM_ID,
    occupancy_id: OCCUPANCY_ID,
    kost_type_id: KOST_TYPE_ID,
    lease_status: 'active',
    start_date: '2026-03-10',
    end_date: liveSourceEndDate,
    billing_cycle: 'monthly',
    billing_anchor_day: billingAnchorDay,
    next_billing_date: nextBillingDate,
    snapshot_monthly_price: '1800000',
    snapshot_yearly_price: '19800000',
    snapshot_deposit_amount: String(requiredDeposit),
    snapshot_room_number: 'A-01',
    snapshot_kost_type_name: 'Standard',
    notes: null,
    deposit_collected_amount: String(carriedDeposit),
    deposit_deduction_amount: '0',
    deposit_refunded_amount: '0',
    ...overrides,
  });

  const commandRow = () => ({
    id: COMMAND_ID,
    property_id: PROPERTY_ID,
    resident_id: RESIDENT_ID,
    from_lease_id: LEASE_ID,
    from_room_id: SOURCE_ROOM_ID,
    to_room_id: TARGET_ROOM_ID,
    transfer_path: 'end_period',
    effective_date: commandEffectiveDate,
    reason_code: 'resident_request',
    reason_detail: null,
    exception_reason: null,
    state: commandState.state,
    failure_code: null,
    cancel_reason: null,
    commercial_snapshot: {
      billing_cycle: 'monthly',
      billing_anchor_day: billingAnchorDay,
      next_billing_date: nextBillingDate,
      snapshot_monthly_price: '1800000',
      snapshot_yearly_price: '19800000',
      snapshot_deposit_amount: String(requiredDeposit),
      source_end_date: sourceEndDate,
      carried_deposit_amount: carriedDeposit,
      required_target_deposit_amount: requiredDeposit,
    },
    transfer_record_id: null,
    executed_late: false,
    created_by_user_id: USER_ID,
    created_at: '2026-08-01T00:00:00.000Z',
    executed_at: null,
    cancelled_at: null,
    failed_at: null,
  });

  const depositTotals = (leaseId: string) => {
    const rows = ledger[leaseId] ?? [];
    const collected = rows
      .filter(
        (r) => ['collection', 'top_up'].includes(r.transaction_type) && r.direction === 'credit',
      )
      .reduce((s, r) => s + r.amount, 0);
    return {
      deposit_collected_amount: String(collected),
      deposit_deduction_amount: '0',
      deposit_refunded_amount: '0',
      snapshot_deposit_amount: String(requiredDeposit),
    };
  };

  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      queries.push(q);
      if (options.failOn && options.failOn.test(q)) {
        throw new Error('connection terminated unexpectedly');
      }
      if (options.httpConflictOn && options.httpConflictOn.test(q)) {
        // Simulate a business precondition that only surfaces mid-cutover.
        const { ConflictException } = await import('@nestjs/common');
        throw new ConflictException({ code: 'LEASE_STATE_CONFLICT', message: 'synthetic' });
      }
      if (options.pgErrorOn && options.pgErrorOn.pattern.test(q)) {
        // Simulate a raw PostgreSQL driver error carrying a SQLSTATE code.
        const pgError = new Error('duplicate key value violates unique constraint') as Error & {
          code?: string;
          constraint?: string;
        };
        pgError.code = options.pgErrorOn.code;
        if (options.pgErrorOn.constraint) pgError.constraint = options.pgErrorOn.constraint;
        throw pgError;
      }
      const record = () => pending.push({ sql: q, params });

      if (/SELECT \(now\(\) AT TIME ZONE 'Asia\/Jakarta'\)/.test(q))
        return { rows: [{ today }], rowCount: 1 };
      if (/^SELECT property_id FROM leases WHERE id = \$1$/.test(q))
        return { rows: [{ property_id: PROPERTY_ID }], rowCount: 1 };
      if (/FROM lease_transfer_commands WHERE id = \$1 FOR UPDATE/.test(q))
        return { rows: [commandRow()], rowCount: 1 };
      if (
        /SELECT id FROM lease_transfer_commands WHERE from_lease_id = \$1 AND state = 'scheduled'/.test(
          q,
        )
      )
        return { rows: [], rowCount: 0 };
      if (/INSERT INTO lease_transfer_commands/.test(q)) {
        record();
        return { rows: [commandRow()], rowCount: 1 };
      }
      if (/UPDATE lease_transfer_commands SET state = 'executed'/.test(q)) {
        commandState.state = 'executed';
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE lease_transfer_commands SET state = 'failed'/.test(q)) {
        commandState.state = 'failed';
        record();
        return { rows: [commandRow()], rowCount: 1 };
      }
      if (/SELECT id, email, phone, display_name, user_status FROM users WHERE id = \$1/.test(q))
        return {
          rows: [
            {
              id: USER_ID,
              email: 'admin@example.com',
              phone: null,
              display_name: 'Admin',
              user_status: 'active',
            },
          ],
          rowCount: 1,
        };
      if (/FROM properties LEFT JOIN property_settings/.test(q))
        return { rows: [{ id: PROPERTY_ID, default_due_day: 25 }], rowCount: 1 };
      if (/FROM leases WHERE id = \$1 FOR UPDATE/.test(q))
        return { rows: [leaseRow(LEASE_ID)], rowCount: 1 };
      if (/FROM leases WHERE id = \$1 FOR SHARE/.test(q))
        return { rows: [leaseRow(LEASE_ID)], rowCount: 1 };
      if (/SELECT id FROM leases WHERE room_id = \$1 AND lease_status = 'active'/.test(q))
        return { rows: [], rowCount: 0 };
      if (/FROM rooms JOIN room_buildings/.test(q))
        return {
          rows: [
            {
              id: SOURCE_ROOM_ID,
              property_id: PROPERTY_ID,
              number: 'A-01',
              room_status: 'occupied',
              kost_type_id: KOST_TYPE_ID,
              room_gender_policy: 'mixed',
              building_gender_policy: 'male',
            },
            {
              id: TARGET_ROOM_ID,
              property_id: PROPERTY_ID,
              number: 'B-02',
              room_status: targetRoomStatus,
              kost_type_id: KOST_TYPE_ID,
              room_gender_policy: 'mixed',
              building_gender_policy: 'male',
            },
          ],
          rowCount: 2,
        };
      if (/FROM kost_types kost_type/.test(q))
        return {
          rows: [
            {
              id: KOST_TYPE_ID,
              property_id: PROPERTY_ID,
              name: 'Standard',
              monthly_price: '1800000',
              yearly_price: '19800000',
              deposit_amount: String(requiredDeposit),
              status: 'active',
              deleted_at: null,
            },
          ],
          rowCount: 1,
        };
      if (/FROM residents WHERE id = \$1/.test(q))
        return {
          rows: [
            {
              id: RESIDENT_ID,
              property_id: PROPERTY_ID,
              full_name: 'Budi',
              resident_status: 'active',
              gender: 'male',
            },
          ],
          rowCount: 1,
        };
      if (/FROM occupancies WHERE id = \$1/.test(q))
        return {
          rows: [
            {
              id: OCCUPANCY_ID,
              property_id: PROPERTY_ID,
              room_id: SOURCE_ROOM_ID,
              resident_id: RESIDENT_ID,
              occupancy_status: 'active',
            },
          ],
          rowCount: 1,
        };
      if (/FROM invoices WHERE lease_id = \$1/.test(q)) return { rows: [], rowCount: 0 };
      if (/FROM lease_deposit_transactions WHERE lease_id = \$1/.test(q)) {
        const leaseId = params[0] as string;
        const rows = (ledger[leaseId] ?? []).map((entry, index) => ({
          id: `ledger-${leaseId}-${index}`,
          transaction_type: entry.transaction_type,
          direction: entry.direction,
          amount: String(entry.amount),
        }));
        return { rows, rowCount: rows.length };
      }
      if (/UPDATE occupancies SET occupancy_status = 'transferred'/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE leases SET lease_status = 'transferred'/.test(q)) {
        record();
        return {
          rows: [leaseRow(LEASE_ID, { lease_status: 'transferred', end_date: today })],
          rowCount: 1,
        };
      }
      if (/INSERT INTO occupancies/.test(q)) {
        record();
        return { rows: [{ id: 'target-occupancy' }], rowCount: 1 };
      }
      if (/INSERT INTO leases/.test(q)) {
        record();
        targetLeaseId = 'target-lease';
        return {
          rows: [
            leaseRow('target-lease', {
              room_id: TARGET_ROOM_ID,
              occupancy_id: 'target-occupancy',
              end_date: params[7],
              next_billing_date: params[10],
              transferred_from_lease_id: LEASE_ID,
            }),
          ],
          rowCount: 1,
        };
      }
      if (/INSERT INTO room_transfer_records/.test(q)) {
        record();
        return {
          rows: [
            {
              id: 'transfer-record',
              effective_date: today,
              carried_deposit_amount: String(carriedDeposit),
              required_target_deposit_amount: String(requiredDeposit),
              top_up_amount: '0',
            },
          ],
          rowCount: 1,
        };
      }
      if (/UPDATE smart_lock_access_grants/.test(q)) {
        record();
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO lease_deposit_transactions/.test(q)) {
        const leaseId = params[1] as string;
        ledger[leaseId] = ledger[leaseId] ?? [];
        ledger[leaseId].push({
          transaction_type: params[2] as string,
          direction: params[3] as string,
          amount: Number(params[4]),
        });
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/WITH totals AS/.test(q)) {
        record();
        return { rows: [depositTotals(params[0] as string)], rowCount: 1 };
      }
      if (/UPDATE rooms SET room_status = CASE/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO occupancy_history/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO lease_history/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO invoices/.test(q)) {
        record();
        return {
          rows: [
            {
              id: 'target-invoice',
              invoice_code: 'INV-1',
              due_date: '2026-09-25',
              total_amount: '1800000',
            },
          ],
          rowCount: 1,
        };
      }
      if (/INSERT INTO invoice_line_items/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO audit_logs/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO business_events/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO idempotency_commands/.test(q)) {
        record();
        return {
          rows: [
            {
              request_fingerprint: 'fp',
              command_status: 'pending',
              response_status: null,
              response_body: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (/UPDATE idempotency_commands/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT id FROM payment_allocations WHERE invoice_id/.test(q))
        return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };

  const transaction = async <T>(operation: (c: typeof client) => Promise<T>): Promise<T> => {
    events.push('begin');
    try {
      const result = await operation(client);
      committed.push(...pending);
      pending = [];
      events.push('commit');
      return result;
    } catch (error) {
      pending = [];
      events.push('rollback');
      throw error;
    }
  };

  const leases = { transaction, query: client.query };
  const features = {
    assertTransferEnabled: async () => undefined,
    transferSchedulerEnabledPropertyIds: async () => [PROPERTY_ID],
  };
  const service = new LeaseTransferService(leases as never, features as never);
  return {
    service,
    events,
    queries,
    committed,
    ledger,
    get targetLeaseId() {
      return targetLeaseId;
    },
    get commandState() {
      return commandState.state;
    },
  };
}

function committedMatching(committed: Write[], pattern: RegExp): Write[] {
  return committed.filter((write) => pattern.test(write.sql));
}

function errorCode(error: unknown): string {
  assert.ok(error instanceof Error && 'getResponse' in error);
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

const auditContext = { correlationId: 'w07b-behaviour' };
const adminActor = {
  id: USER_ID,
  roles: ['admin'],
  permissions: ['lease.manage', 'billing.manage'],
  propertyIds: [PROPERTY_ID],
};
const idempotencyKey = 'w07b-transfer-behaviour-0001';

test('preview recommends the first valid billing boundary when no date is supplied', async () => {
  const harness = transferHarness({
    today: '2026-09-10',
    nextBillingDate: '2026-09-10',
  });

  const response = await harness.service.preview(adminActor as never, LEASE_ID, {
    target_room_id: TARGET_ROOM_ID,
    transfer_path: 'end_period',
  });
  const preview = response.data as {
    effective_date: string;
    valid_effective_dates: string[];
  };

  assert.equal(preview.effective_date, '2026-10-10');
  assert.equal(preview.valid_effective_dates[0], '2026-10-10');
});

test('preview advances a stale billing cursor to the next valid boundary', async () => {
  const harness = transferHarness({
    today: '2026-08-20',
    nextBillingDate: '2026-08-05',
    billingAnchorDay: 25,
  });

  const response = await harness.service.preview(adminActor as never, LEASE_ID, {
    target_room_id: TARGET_ROOM_ID,
    transfer_path: 'end_period',
  });
  const preview = response.data as {
    effective_date: string;
    valid_effective_dates: string[];
    billing: {
      source_next_billing_date: string;
      target_next_billing_date: string;
    };
  };

  assert.equal(preview.effective_date, '2026-08-25');
  assert.equal(preview.valid_effective_dates[0], '2026-08-25');
  assert.equal(preview.billing.source_next_billing_date, '2026-08-25');
  assert.equal(preview.billing.target_next_billing_date, '2026-08-25');
});

test('schedule snapshots the normalized boundary when the stored billing cursor is stale', async () => {
  const harness = transferHarness({
    today: '2026-08-20',
    nextBillingDate: '2026-08-05',
    billingAnchorDay: 25,
  });

  await harness.service.schedule(
    adminActor as never,
    LEASE_ID,
    {
      property_id: PROPERTY_ID,
      target_room_id: TARGET_ROOM_ID,
      effective_date: '2026-08-25',
      reason_code: 'resident_request',
    } as never,
    idempotencyKey,
    auditContext,
  );

  const command = committedMatching(harness.committed, /INSERT INTO lease_transfer_commands/)[0];
  assert.ok(command);
  const snapshot = JSON.parse(command.params[8] as string) as { next_billing_date: string };
  assert.equal(snapshot.next_billing_date, '2026-08-25');
});

test('cutover advances a stale cursor and gives the successor the following boundary', async () => {
  const harness = transferHarness({
    today: '2026-08-25',
    commandEffectiveDate: '2026-08-25',
    nextBillingDate: '2026-08-05',
    billingAnchorDay: 25,
  });

  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-stale-cursor');

  assert.equal(outcome.state, 'executed');
  const successor = committedMatching(harness.committed, /INSERT INTO leases/)[0];
  assert.ok(successor);
  assert.equal(successor.params[10], '2026-09-25');
});

test('a due scheduled command executes at its boundary and inherits the contractual end date', async () => {
  const harness = transferHarness({
    commandEffectiveDate: '2026-09-10',
    sourceEndDate: '2027-03-31',
  });
  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-1');

  assert.equal(outcome.state, 'executed');
  assert.equal(outcome.late, false);
  assert.deepEqual(harness.events, ['begin', 'commit']);

  // The successor lease inherits the source contractual end date, while the
  // source lease closes at the transfer date.
  const insertLease = committedMatching(harness.committed, /INSERT INTO leases/)[0];
  assert.ok(insertLease);
  assert.equal(insertLease.params[7], '2027-03-31');
  const closeSource = committedMatching(
    harness.committed,
    /UPDATE leases SET lease_status = 'transferred'/,
  )[0];
  assert.ok(closeSource);
  assert.equal(closeSource.params[1], '2026-09-10');

  // Boundary cutover issues the successor's first cycle invoice.
  assert.equal(committedMatching(harness.committed, /INSERT INTO invoices/).length, 1);
  // The transfer record metadata records the surviving contractual end date.
  const record = committedMatching(harness.committed, /INSERT INTO room_transfer_records/)[0];
  const metadata = JSON.parse(record.params[17] as string) as Record<string, unknown>;
  assert.equal(metadata.source_end_date, '2027-03-31');
  assert.equal(harness.commandState, 'executed');
});

test('an overdue scheduled command still executes but is marked as a late execution', async () => {
  const harness = transferHarness({ today: '2026-09-12', commandEffectiveDate: '2026-09-10' });
  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-late');

  assert.equal(outcome.state, 'executed');
  assert.equal(outcome.late, true);
  const executed = committedMatching(
    harness.committed,
    /UPDATE lease_transfer_commands SET state = 'executed'/,
  )[0];
  assert.ok(executed);
  assert.equal(executed.params[1], true);
});

test('a transient scheduler error rolls back with no partial writes and keeps the command scheduled', async () => {
  const harness = transferHarness({ failOn: /INSERT INTO room_transfer_records/ });
  await assert.rejects(
    harness.service.executeScheduledTransfer(COMMAND_ID, 'run-transient'),
    /connection terminated unexpectedly/,
  );

  assert.deepEqual(harness.events, ['begin', 'rollback']);
  assert.equal(harness.committed.length, 0);
  // The command is never marked failed on a transient error; it stays scheduled.
  assert.equal(harness.commandState, 'scheduled');
  assert.equal(
    harness.queries.some((q) => /UPDATE lease_transfer_commands SET state = 'failed'/.test(q)),
    false,
  );
});

test('a business precondition failure mid-cutover rolls back and marks the command terminally failed', async () => {
  const harness = transferHarness({ httpConflictOn: /INSERT INTO room_transfer_records/ });
  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-fail');

  assert.equal(outcome.state, 'failed');
  assert.equal(outcome.failure_code, 'LEASE_STATE_CONFLICT');
  // The cutover transaction rolled back: no lease was transferred.
  assert.equal(
    committedMatching(harness.committed, /UPDATE leases SET lease_status = 'transferred'/).length,
    0,
  );
  assert.equal(committedMatching(harness.committed, /INSERT INTO leases/).length, 0);
  // Terminal failure bookkeeping commits in its own transaction.
  assert.equal(harness.commandState, 'failed');
  assert.equal(
    committedMatching(harness.committed, /UPDATE lease_transfer_commands SET state = 'failed'/)
      .length,
    1,
  );
});

test('a PostgreSQL unique_violation (23505) becomes a terminal failure with a stable code', async () => {
  const harness = transferHarness({
    pgErrorOn: {
      pattern: /INSERT INTO occupancies/,
      code: '23505',
      constraint: 'occupancies_one_active_room',
    },
  });
  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-23505');

  assert.equal(outcome.state, 'failed');
  // The recognised constraint is translated through the shared conflict helper
  // to the same stable code used by the synchronous transfer path.
  assert.equal(outcome.failure_code, 'LEASE_ROOM_CONFLICT');
  // The cutover rolled back with no partial lifecycle writes.
  assert.equal(committedMatching(harness.committed, /INSERT INTO leases/).length, 0);
  assert.equal(
    committedMatching(harness.committed, /UPDATE leases SET lease_status = 'transferred'/).length,
    0,
  );
  assert.equal(harness.commandState, 'failed');
});

test('an unrecognised integrity-constraint violation (23505) still fails terminally with a stable code', async () => {
  const harness = transferHarness({
    pgErrorOn: {
      pattern: /INSERT INTO room_transfer_records/,
      code: '23505',
      constraint: 'transfer_records_effective_date_unique_idx',
    },
  });
  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-23505-unmapped');

  assert.equal(outcome.state, 'failed');
  assert.equal(outcome.failure_code, 'TRANSFER_CONSTRAINT_CONFLICT');
  assert.equal(committedMatching(harness.committed, /INSERT INTO leases/).length, 0);
  assert.equal(harness.commandState, 'failed');
});

test('a deadlock (40P01) leaves the command scheduled for retry with no partial writes', async () => {
  const harness = transferHarness({
    pgErrorOn: { pattern: /INSERT INTO room_transfer_records/, code: '40P01' },
  });
  await assert.rejects(
    harness.service.executeScheduledTransfer(COMMAND_ID, 'run-deadlock'),
    /duplicate key value/,
  );
  assert.deepEqual(harness.events, ['begin', 'rollback']);
  assert.equal(harness.committed.length, 0);
  assert.equal(harness.commandState, 'scheduled');
  assert.equal(
    harness.queries.some((q) => /UPDATE lease_transfer_commands SET state = 'failed'/.test(q)),
    false,
  );
});

test('a serialization failure (40001) leaves the command scheduled for retry', async () => {
  const harness = transferHarness({
    pgErrorOn: { pattern: /INSERT INTO room_transfer_records/, code: '40001' },
  });
  await assert.rejects(harness.service.executeScheduledTransfer(COMMAND_ID, 'run-serialization'));
  assert.equal(harness.committed.length, 0);
  assert.equal(harness.commandState, 'scheduled');
});

test('a lost connection (08006) leaves the command scheduled for retry', async () => {
  const harness = transferHarness({
    pgErrorOn: { pattern: /INSERT INTO room_transfer_records/, code: '08006' },
  });
  await assert.rejects(harness.service.executeScheduledTransfer(COMMAND_ID, 'run-connlost'));
  assert.deepEqual(harness.events, ['begin', 'rollback']);
  assert.equal(harness.committed.length, 0);
  assert.equal(harness.commandState, 'scheduled');
});

test('an unknown infrastructure error rolls back with no partial writes and stays scheduled', async () => {
  const harness = transferHarness({ failOn: /INSERT INTO room_transfer_records/ });
  await assert.rejects(
    harness.service.executeScheduledTransfer(COMMAND_ID, 'run-unknown'),
    /connection terminated unexpectedly/,
  );
  assert.deepEqual(harness.events, ['begin', 'rollback']);
  assert.equal(harness.committed.length, 0);
  assert.equal(harness.commandState, 'scheduled');
});

test('cutover fails when the snapshotted contractual end date no longer matches', async () => {
  const harness = transferHarness({ sourceEndDate: '2027-03-31', liveSourceEndDate: '2026-12-31' });
  const outcome = await harness.service.executeScheduledTransfer(COMMAND_ID, 'run-enddate');

  assert.equal(outcome.state, 'failed');
  assert.equal(outcome.failure_code, 'TRANSFER_SOURCE_END_DATE_CHANGED');
  assert.equal(
    committedMatching(harness.committed, /UPDATE leases SET lease_status = 'transferred'/).length,
    0,
  );
  assert.equal(harness.commandState, 'failed');
});

test('scheduling a transfer that would require a deposit top-up fails fast with no command persisted', async () => {
  const harness = transferHarness({ carriedDeposit: 500_000, requiredDeposit: 750_000 });
  await assert.rejects(
    harness.service.schedule(
      adminActor as never,
      LEASE_ID,
      {
        property_id: PROPERTY_ID,
        target_room_id: TARGET_ROOM_ID,
        effective_date: '2026-10-10',
        reason_code: 'resident_request',
      } as never,
      idempotencyKey,
      auditContext,
    ),
    (error) => errorCode(error) === 'TRANSFER_SCHEDULE_TOP_UP_REQUIRED',
  );
  assert.deepEqual(harness.events.slice(-1), ['rollback']);
  assert.equal(
    committedMatching(harness.committed, /INSERT INTO lease_transfer_commands/).length,
    0,
  );
});

test('scheduling succeeds and only persists a scheduled command when no top-up is needed', async () => {
  const harness = transferHarness({ carriedDeposit: 500_000, requiredDeposit: 500_000 });
  const result = await harness.service.schedule(
    adminActor as never,
    LEASE_ID,
    {
      property_id: PROPERTY_ID,
      target_room_id: TARGET_ROOM_ID,
      effective_date: '2026-10-10',
      reason_code: 'resident_request',
    } as never,
    idempotencyKey,
    auditContext,
  );

  assert.equal(
    (result.body.data as { scheduled_transfer: { state: string } }).scheduled_transfer.state,
    'scheduled',
  );
  assert.equal(
    committedMatching(harness.committed, /INSERT INTO lease_transfer_commands/).length,
    1,
  );
  // Scheduling never mutates lifecycle state.
  assert.equal(committedMatching(harness.committed, /UPDATE leases SET lease_status/).length, 0);
  assert.equal(committedMatching(harness.committed, /UPDATE rooms/).length, 0);
});

// -------------------- scheduler-level proofs --------------------

function schedulerHarness(
  transferService: LeaseTransferService,
  leasesFake: unknown,
  options: { env?: string; processEnabled?: boolean } = {},
) {
  const unlockCalls: string[] = [];
  const dedicatedClient = {
    query: async (sql: string) => {
      const q = normalize(sql);
      if (/pg_try_advisory_lock/.test(q)) return { rows: [{ acquired: true }], rowCount: 1 };
      if (/pg_advisory_unlock/.test(q)) {
        unlockCalls.push(q);
        return { rows: [{ unlocked: true }], rowCount: 1 };
      }
      if (/Asia\/Jakarta/.test(q)) return { rows: [{ today: '2026-09-10' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const database = { client: { connect: async () => dedicatedClient } };
  const features = {
    assertTransferEnabled: async () => undefined,
    transferSchedulerEnabledPropertyIds: async () => [PROPERTY_ID],
  };
  const config = {
    get: (key: string) =>
      key === 'app.env'
        ? (options.env ?? 'test')
        : key === 'lease.transferSchedulerProcessEnabled'
          ? (options.processEnabled ?? true)
          : undefined,
  };
  const scheduler = new LeaseTransferScheduler(
    database as never,
    leasesFake as never,
    features as never,
    transferService,
    config as never,
  );
  return { scheduler, unlockCalls };
}

test('scheduler runOnce executes a due command and releases its advisory lock', async () => {
  const transfer = transferHarness({ commandEffectiveDate: '2026-09-10' });
  let dueServed = false;
  const leasesFake = {
    query: async (sql: string) => {
      if (/SELECT id FROM lease_transfer_commands WHERE property_id = \$1/.test(normalize(sql))) {
        if (dueServed) return { rows: [], rowCount: 0 };
        dueServed = true;
        return { rows: [{ id: COMMAND_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const { scheduler, unlockCalls } = schedulerHarness(transfer.service, leasesFake);
  const result = await scheduler.runOnce({ businessDate: '2026-09-10', runId: 'run-scheduler' });

  assert.equal(result.status, 'completed');
  assert.equal(result.commands_executed, 1);
  assert.equal(result.commands_failed, 0);
  assert.equal(unlockCalls.length, 1);
});

test('scheduler runOnce rejects a business-date override outside the test environment', async () => {
  const transfer = transferHarness();
  const leasesFake = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { scheduler } = schedulerHarness(transfer.service, leasesFake, { env: 'production' });
  await assert.rejects(
    scheduler.runOnce({ businessDate: '2030-01-01' }),
    /LEASE_TRANSFER_TEST_DATE_OVERRIDE_FORBIDDEN/,
  );
});

test('scheduler onModuleInit starts when the explicit process gate is true in production', () => {
  const transfer = transferHarness();
  const leasesFake = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { scheduler } = schedulerHarness(transfer.service, leasesFake, {
    env: 'production',
    processEnabled: true,
  });
  scheduler.onModuleInit();
  // A timer is armed only when the scheduler actually starts.
  assert.notEqual((scheduler as unknown as { timer: unknown }).timer, undefined);
  scheduler.onModuleDestroy();
});

test('scheduler onModuleInit stays disabled when the explicit process gate is false', () => {
  const transfer = transferHarness();
  const leasesFake = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { scheduler } = schedulerHarness(transfer.service, leasesFake, {
    env: 'production',
    processEnabled: false,
  });
  scheduler.onModuleInit();
  assert.equal((scheduler as unknown as { timer: unknown }).timer, undefined);
  scheduler.onModuleDestroy();
});

// -------------------- inspection resolution replay proofs --------------------

type RoomOptions = { roomStatus?: string; activeOccupancy?: boolean };

function roomHarness(options: RoomOptions = {}) {
  const events: string[] = [];
  let pending: Write[] = [];
  const committed: Write[] = [];
  const store = new Map<string, { fingerprint: string; status: string; body: unknown }>();
  const roomState = { status: options.roomStatus ?? 'inspection_required' };

  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      const record = () => pending.push({ sql: q, params });
      if (/SELECT id, property_id, room_status FROM rooms WHERE id = \$1 FOR UPDATE/.test(q))
        return {
          rows: [{ id: SOURCE_ROOM_ID, property_id: PROPERTY_ID, room_status: roomState.status }],
          rowCount: 1,
        };
      if (/FROM occupancies WHERE property_id = \$1 AND room_id = \$2/.test(q))
        return options.activeOccupancy
          ? { rows: [{ id: 'active-occupancy' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      if (/SELECT to_regclass\('public\.lease_checkout_commands'\)/.test(q))
        return { rows: [{ checkout_commands: null }], rowCount: 1 };
      if (/UPDATE rooms SET room_status = \$2/.test(q)) {
        roomState.status = params[1] as string;
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO audit_logs/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO business_events/.test(q)) {
        record();
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO idempotency_commands/.test(q)) {
        const key = params[3] as string;
        if (store.has(key)) return { rows: [], rowCount: 0 };
        store.set(key, { fingerprint: params[4] as string, status: 'pending', body: null });
        record();
        return {
          rows: [
            {
              request_fingerprint: params[4],
              command_status: 'pending',
              response_status: null,
              response_body: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        /SELECT request_fingerprint, command_status, response_status, response_body FROM idempotency_commands/.test(
          q,
        )
      ) {
        const key = params[2] as string;
        const entry = store.get(key);
        if (!entry) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              request_fingerprint: entry.fingerprint,
              command_status: entry.status,
              response_status: entry.status === 'succeeded' ? 200 : null,
              response_body: entry.body,
            },
          ],
          rowCount: 1,
        };
      }
      if (/UPDATE idempotency_commands SET command_status = 'succeeded'/.test(q)) {
        const key = params[5] as string;
        const entry = store.get(key);
        if (entry) {
          entry.status = 'succeeded';
          entry.body = JSON.parse(params[2] as string);
        }
        record();
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const database = {
    transaction: async <T>(operation: (c: typeof client) => Promise<T>): Promise<T> => {
      events.push('begin');
      try {
        const result = await operation(client);
        committed.push(...pending);
        pending = [];
        events.push('commit');
        return result;
      } catch (error) {
        pending = [];
        events.push('rollback');
        throw error;
      }
    },
  };
  const rooms = {
    findRoom: async () => ({
      id: SOURCE_ROOM_ID,
      propertyId: PROPERTY_ID,
      roomStatus: roomState.status,
    }),
  };
  const properties = { assertCanReadProperty: async () => undefined };
  const service = new RoomService(
    rooms as never,
    properties as never,
    {} as never,
    database as never,
  );
  return { service, events, committed };
}

const adminRoomActor = {
  id: USER_ID,
  roles: ['admin'],
  permissions: ['room.manage'],
  propertyIds: [PROPERTY_ID],
};
const roomContext = { correlationId: 'w07b-room' };
const roomKey = 'w07b-inspection-resolution-0001';

test('inspection resolution requires an idempotency key', async () => {
  const harness = roomHarness();
  await assert.rejects(
    harness.service.resolveRoomInspection(
      adminRoomActor as never,
      SOURCE_ROOM_ID,
      { outcome: 'pass' },
      undefined,
      roomContext as never,
    ),
    (error) => errorCode(error) === 'IDEMPOTENCY_KEY_REQUIRED',
  );
});

test('inspection resolution resolves to vacant on pass and replays the stored result', async () => {
  const harness = roomHarness();
  const first = await harness.service.resolveRoomInspection(
    adminRoomActor as never,
    SOURCE_ROOM_ID,
    { outcome: 'pass', notes: 'bersih' },
    roomKey,
    roomContext as never,
  );
  assert.equal(first.replayed, false);
  assert.equal((first.body.data as { room_status: string }).room_status, 'vacant');
  const writesAfterFirst = harness.committed.length;

  const replay = await harness.service.resolveRoomInspection(
    adminRoomActor as never,
    SOURCE_ROOM_ID,
    { outcome: 'pass', notes: 'bersih' },
    roomKey,
    roomContext as never,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, first.body);
  // No new room mutation write occurs on replay.
  assert.equal(committedMatching(harness.committed, /UPDATE rooms/).length, 1);
  assert.equal(harness.committed.length, writesAfterFirst);
});

test('reusing an idempotency key with a different payload fails closed', async () => {
  const harness = roomHarness();
  await harness.service.resolveRoomInspection(
    adminRoomActor as never,
    SOURCE_ROOM_ID,
    { outcome: 'pass' },
    roomKey,
    roomContext as never,
  );
  await assert.rejects(
    harness.service.resolveRoomInspection(
      adminRoomActor as never,
      SOURCE_ROOM_ID,
      { outcome: 'fail' },
      roomKey,
      roomContext as never,
    ),
    (error) => errorCode(error) === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('inspection resolution fails closed when the room is not awaiting inspection', async () => {
  const harness = roomHarness({ roomStatus: 'occupied' });
  await assert.rejects(
    harness.service.resolveRoomInspection(
      adminRoomActor as never,
      SOURCE_ROOM_ID,
      { outcome: 'pass' },
      roomKey,
      roomContext as never,
    ),
    (error) => errorCode(error) === 'ROOM_INSPECTION_NOT_PENDING',
  );
  assert.equal(committedMatching(harness.committed, /UPDATE rooms/).length, 0);
});

test('inspection resolution cannot make an actively occupied room available', async () => {
  const harness = roomHarness({ activeOccupancy: true });
  await assert.rejects(
    harness.service.resolveRoomInspection(
      adminRoomActor as never,
      SOURCE_ROOM_ID,
      { outcome: 'pass' },
      roomKey,
      roomContext as never,
    ),
    (error) => errorCode(error) === 'ROOM_ACTIVE_OCCUPANCY_CONFLICT',
  );
  assert.equal(committedMatching(harness.committed, /UPDATE rooms/).length, 0);
});
