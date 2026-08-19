import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ComplaintService } from '../../src/modules/complaint/services/complaint.service';
import type { ComplaintRecord } from '../../src/modules/complaint/types/complaint.types';
import { WorkOrderService } from '../../src/modules/maintenance/services/work-order.service';
import type { WorkOrderRecord } from '../../src/modules/maintenance/types/maintenance.types';

const PROPERTY_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '20000000-0000-4000-8000-000000000002';
const COMPLAINT_ID = '30000000-0000-4000-8000-000000000003';
const WORK_ORDER_ID = '40000000-0000-4000-8000-000000000004';
const KEY = 'w09b-behavior-key-0001';

function complaint(status: ComplaintRecord['complaintStatus'] = 'submitted'): ComplaintRecord {
  const now = new Date('2026-08-19T08:00:00.000Z');
  return {
    id: COMPLAINT_ID,
    propertyId: PROPERTY_ID,
    residentId: '50000000-0000-4000-8000-000000000005',
    roomId: null,
    categoryId: '60000000-0000-4000-8000-000000000006',
    complaintCode: 'CMP-2026-0001',
    title: 'Lampu rusak',
    description: 'Lampu kamar tidak menyala',
    priority: 'medium',
    complaintStatus: status,
    reopenCount: 0,
    responseSlaBreached: false,
    resolutionSlaBreached: false,
    locationNote: null,
    assignedToUserId: null,
    submittedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    snapshotRoomNumber: 'AK-01-01',
    snapshotResidentName: 'Resident',
    createdByUserId: ACTOR_ID,
    createdAt: now,
    updatedAt: now,
  };
}

function workOrder(status: WorkOrderRecord['workOrderStatus'] = 'assigned'): WorkOrderRecord {
  const now = new Date('2026-08-19T08:00:00.000Z');
  return {
    id: WORK_ORDER_ID,
    propertyId: PROPERTY_ID,
    roomId: null,
    complaintId: COMPLAINT_ID,
    workOrderCode: 'WO-GSH-2026-0001',
    title: 'Lampu rusak',
    description: 'Lampu kamar tidak menyala',
    priority: 'medium',
    workOrderStatus: status,
    assignedToUserId: ACTOR_ID,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    verifiedByUserId: null,
    reworkReason: null,
    cancelReason: null,
    createdByUserId: ACTOR_ID,
    createdAt: now,
    updatedAt: now,
  };
}

function commandDatabase() {
  let command: { fingerprint: string; response: Record<string, unknown> } | null = null;
  let transitions = 0;
  let outboxWrites = 0;
  const client = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT INTO idempotency_commands')) {
        if (!command) {
          command = { fingerprint: String(params[4]), response: {} };
          return {
            rows: [
              {
                request_fingerprint: command.fingerprint,
                command_status: 'pending',
                response_status: null,
                response_body: null,
              },
            ],
          };
        }
        return { rows: [] };
      }
      if (sql.includes('SELECT request_fingerprint, command_status')) {
        return {
          rows: command
            ? [
                {
                  request_fingerprint: command.fingerprint,
                  command_status: 'succeeded',
                  response_status: 200,
                  response_body: command.response,
                },
              ]
            : [],
        };
      }
      if (sql.includes('UPDATE idempotency_commands')) {
        command!.response = JSON.parse(String(params[3]));
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO business_events')) {
        outboxWrites += 1;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const database = {
    transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client),
  };
  return {
    client,
    database,
    counters: () => ({ transitions, outboxWrites }),
    bump: () => (transitions += 1),
  };
}

describe('W09B complaint and maintenance lifecycle behavior', () => {
  test('complaint transition replays without a second mutation and emits one outbox event', async () => {
    const state = complaint();
    const db = commandDatabase();
    const service = new ComplaintService(
      {
        findById: async () => state,
        findByIdForUpdate: async () => state,
        transitionStatus: async (_id: string, status: ComplaintRecord['complaintStatus']) => {
          db.bump();
          state.complaintStatus = status;
          return state;
        },
      } as never,
      {
        record: async (_input: unknown, client: unknown) => assert.equal(client, db.client),
      } as never,
      {} as never,
      {} as never,
      {
        write: async (_input: unknown, client: unknown) => assert.equal(client, db.client),
      } as never,
      db.database as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const context = { actorUserId: ACTOR_ID, correlationId: 'w09b-correlation' };
    const options = { authorizedPropertyId: PROPERTY_ID, idempotencyKey: KEY };
    const first = await service.acknowledge(COMPLAINT_ID, context, options);
    const second = await service.acknowledge(COMPLAINT_ID, context, options);
    assert.equal(first.complaintStatus, 'acknowledged');
    assert.equal(second.id, first.id);
    assert.equal(second.complaintStatus, first.complaintStatus);
    assert.equal(second.propertyId, first.propertyId);
    assert.deepEqual(db.counters(), { transitions: 1, outboxWrites: 1 });
  });

  test('work-order transition uses the same transaction client for history, audit, and outbox', async () => {
    const state = workOrder();
    const db = commandDatabase();
    const service = new WorkOrderService(
      {
        findById: async () => state,
        findByIdForUpdate: async () => state,
        transitionStatus: async (_id: string, status: WorkOrderRecord['workOrderStatus']) => {
          db.bump();
          state.workOrderStatus = status;
          return state;
        },
      } as never,
      {
        record: async (_input: unknown, client: unknown) => assert.equal(client, db.client),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        write: async (_input: unknown, client: unknown) => assert.equal(client, db.client),
      } as never,
      db.database as never,
    );
    const updated = await service.start(
      WORK_ORDER_ID,
      { actorUserId: ACTOR_ID },
      {
        authorizedPropertyId: PROPERTY_ID,
        idempotencyKey: KEY,
      },
    );
    assert.equal(updated.workOrderStatus, 'in_progress');
    assert.deepEqual(db.counters(), { transitions: 1, outboxWrites: 1 });
  });
});
