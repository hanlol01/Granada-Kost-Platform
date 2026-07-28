import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComplaintController } from '../../src/modules/complaint/controllers/complaint.controller';
import { AssignComplaintDto } from '../../src/modules/complaint/dto/assign-complaint.dto';
import { ComplaintRepository } from '../../src/modules/complaint/repositories/complaint.repository';
import { ComplaintService } from '../../src/modules/complaint/services/complaint.service';
import type { ComplaintRecord } from '../../src/modules/complaint/types/complaint.types';
import { TechnicianController } from '../../src/modules/maintenance/controllers/technician.controller';
import { WorkOrderRepository } from '../../src/modules/maintenance/repositories/work-order.repository';
import { WorkOrderService } from '../../src/modules/maintenance/services/work-order.service';
import type { WorkOrderRecord } from '../../src/modules/maintenance/types/maintenance.types';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const root = resolve(__dirname, '../..');
const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const COMPLAINT_A = '33333333-3333-4333-8333-333333333333';
const COMPLAINT_B = '33333333-3333-4333-8333-333333333334';
const TECHNICIAN_A = '44444444-4444-4444-8444-444444444444';
const TECHNICIAN_B = '55555555-5555-4555-8555-555555555555';
const WORK_ORDER_A = '66666666-6666-4666-8666-666666666666';
const ACTOR_A = '77777777-7777-4777-8777-777777777777';
const V2_ACCEPT = 'application/vnd.granada.admin-ux.v2+json';
const IDEMPOTENCY_KEY = 'm16-dispatch-key-0001';

const paths = {
  complaintController: resolve(root, 'src/modules/complaint/controllers/complaint.controller.ts'),
  complaintService: resolve(root, 'src/modules/complaint/services/complaint.service.ts'),
  complaintRepository: resolve(root, 'src/modules/complaint/repositories/complaint.repository.ts'),
  complaintModule: resolve(root, 'src/modules/complaint/complaint.module.ts'),
  maintenanceModule: resolve(root, 'src/modules/maintenance/maintenance.module.ts'),
  technicianController: resolve(
    root,
    'src/modules/maintenance/controllers/technician.controller.ts',
  ),
  workOrderController: resolve(
    root,
    'src/modules/maintenance/controllers/work-order.controller.ts',
  ),
  workOrderService: resolve(root, 'src/modules/maintenance/services/work-order.service.ts'),
  workOrderRepository: resolve(
    root,
    'src/modules/maintenance/repositories/work-order.repository.ts',
  ),
  technicianRepository: resolve(
    root,
    'src/modules/maintenance/repositories/technician-profile.repository.ts',
  ),
};

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function complaint(overrides: Partial<ComplaintRecord> = {}): ComplaintRecord {
  const createdAt = new Date('2026-07-28T00:00:00.000Z');
  return {
    id: COMPLAINT_A,
    propertyId: PROPERTY_A,
    residentId: '88888888-8888-4888-8888-888888888888',
    roomId: '99999999-9999-4999-8999-999999999999',
    categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    complaintCode: 'CMP-DEMO-0001',
    title: 'Lampu kamar perlu diperiksa',
    description: 'Deskripsi internal complaint',
    priority: 'medium',
    complaintStatus: 'acknowledged',
    reopenCount: 0,
    responseSlaBreached: false,
    resolutionSlaBreached: false,
    locationNote: null,
    assignedToUserId: null,
    submittedAt: createdAt,
    acknowledgedAt: createdAt,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    snapshotRoomNumber: 'RK-01-01',
    snapshotResidentName: 'Private Resident',
    createdByUserId: ACTOR_A,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function workOrder(overrides: Partial<WorkOrderRecord> = {}): WorkOrderRecord {
  const createdAt = new Date('2026-07-28T00:01:00.000Z');
  return {
    id: WORK_ORDER_A,
    propertyId: PROPERTY_A,
    roomId: complaint().roomId,
    complaintId: COMPLAINT_A,
    workOrderCode: 'WO-GSH-2026-0001',
    title: complaint().title,
    description: complaint().description,
    priority: 'medium',
    workOrderStatus: 'assigned',
    assignedToUserId: TECHNICIAN_A,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    verifiedByUserId: null,
    reworkReason: null,
    cancelReason: null,
    createdByUserId: ACTOR_A,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

type Command = {
  fingerprint: string;
  status: 'pending' | 'succeeded';
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
};

class FakeDatabase {
  readonly sql: string[] = [];
  readonly commands = new Map<string, Command>();
  transactions = 0;
  captureState?: () => unknown;
  restoreState?: (snapshot: unknown) => void;
  private queue: Promise<void> = Promise.resolve();

  readonly client = {
    query: async () => ({ rows: [] }),
  };

  readonly transactionClient = {
    query: async (sql: string, values: unknown[] = []) => {
      this.sql.push(sql);
      if (sql.includes('INSERT INTO idempotency_commands')) {
        const key = String(values[3]);
        if (this.commands.has(key)) return { rows: [] };
        this.commands.set(key, {
          fingerprint: String(values[4]),
          status: 'pending',
          responseStatus: null,
          responseBody: null,
        });
        return {
          rows: [
            {
              request_fingerprint: values[4],
              command_status: 'pending',
              response_status: null,
              response_body: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT request_fingerprint')) {
        const command = this.commands.get(String(values[2]));
        return {
          rows: command
            ? [
                {
                  request_fingerprint: command.fingerprint,
                  command_status: command.status,
                  response_status: command.responseStatus,
                  response_body: command.responseBody,
                },
              ]
            : [],
        };
      }
      if (sql.includes('UPDATE idempotency_commands')) {
        const command = this.commands.get(String(values[2]));
        if (command) {
          command.status = 'succeeded';
          command.responseStatus = 200;
          command.responseBody = JSON.parse(String(values[3])) as Record<string, unknown>;
        }
      }
      return { rows: [] };
    },
  };

  async transaction<T>(
    operation: (client: typeof this.transactionClient) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolveQueue) => {
      release = resolveQueue;
    });
    await previous;
    const commandSnapshot = structuredClone(this.commands);
    const domainSnapshot = this.captureState?.();
    try {
      return await operation(this.transactionClient);
    } catch (error) {
      this.commands.clear();
      for (const [key, value] of commandSnapshot) {
        this.commands.set(key, value);
      }
      if (domainSnapshot !== undefined) {
        this.restoreState?.(domainSnapshot);
      }
      throw error;
    } finally {
      release();
    }
  }
}

function harness(
  options: {
    complaint?: ComplaintRecord;
    workOrders?: WorkOrderRecord[];
    technicianPropertyId?: string;
    failAudit?: boolean;
  } = {},
) {
  const database = new FakeDatabase();
  let currentComplaint = options.complaint ?? complaint();
  const linked = [...(options.workOrders ?? [])];
  const complaintHistory: unknown[] = [];
  const workOrderHistory: unknown[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let workOrderCreates = 0;
  let workOrderReassigns = 0;
  let complaintWrites = 0;
  let codeAllocations = 0;

  const assertTransactionClient = (client: unknown) => {
    assert.equal(client, database.transactionClient);
  };

  const complaints = {
    findByIdForUpdate: async (_id: string, client: unknown) => {
      assertTransactionClient(client);
      return currentComplaint;
    },
    assignForDispatch: async (_id: string, technicianId: string, client: unknown) => {
      assertTransactionClient(client);
      complaintWrites += 1;
      currentComplaint = complaint({
        ...currentComplaint,
        complaintStatus: ['submitted', 'acknowledged', 'reopened'].includes(
          currentComplaint.complaintStatus,
        )
          ? 'in_progress'
          : currentComplaint.complaintStatus,
        assignedToUserId: technicianId,
      });
      return currentComplaint;
    },
  };
  const workOrders = {
    lockByComplaint: async (_complaintId: string, client: unknown) => {
      assertTransactionClient(client);
      return [...linked];
    },
    allocateDispatchCode: async (_propertyId: string, _year: number, client: unknown) => {
      assertTransactionClient(client);
      codeAllocations += 1;
      return { propertyName: 'Granada Student House', sequence: linked.length + 1 };
    },
    createDispatch: async (input: Record<string, unknown>, client: unknown) => {
      assertTransactionClient(client);
      workOrderCreates += 1;
      const created = workOrder({
        id: `66666666-6666-4666-8666-${String(linked.length + 1).padStart(12, '0')}`,
        propertyId: String(input.propertyId),
        roomId: String(input.roomId),
        complaintId: String(input.complaintId),
        workOrderCode: String(input.workOrderCode),
        title: String(input.title),
        description: String(input.description),
        priority: input.priority as WorkOrderRecord['priority'],
        assignedToUserId: String(input.assignedToUserId),
      });
      linked.push(created);
      return created;
    },
    reassignForDispatch: async (id: string, technicianId: string, client: unknown) => {
      assertTransactionClient(client);
      workOrderReassigns += 1;
      const index = linked.findIndex((record) => record.id === id);
      const updated = workOrder({
        ...linked[index],
        assignedToUserId: technicianId,
        workOrderStatus:
          linked[index].workOrderStatus === 'open' ? 'assigned' : linked[index].workOrderStatus,
      });
      linked[index] = updated;
      return updated;
    },
  };
  const service = new ComplaintService(
    complaints as never,
    {
      record: async (input: unknown, client: unknown) => {
        assertTransactionClient(client);
        complaintHistory.push(input);
      },
    } as never,
    {} as never,
    {} as never,
    {
      write: async (input: Record<string, unknown>, client: unknown) => {
        assertTransactionClient(client);
        if (options.failAudit) {
          throw new Error('audit unavailable');
        }
        auditEvents.push(input);
      },
    } as never,
    database as never,
    {
      lockActive: async (propertyId: string, userId: string, client: unknown) => {
        assertTransactionClient(client);
        return propertyId === (options.technicianPropertyId ?? PROPERTY_A)
          ? {
              id: 'profile',
              propertyId,
              userId,
              displayName: 'Teknisi Demo',
              phone: null,
              skillTags: 'electrical',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null;
      },
    } as never,
    workOrders as never,
    {
      record: async (input: unknown, client: unknown) => {
        assertTransactionClient(client);
        workOrderHistory.push(input);
      },
    } as never,
  );
  database.captureState = () => ({
    currentComplaint: structuredClone(currentComplaint),
    linked: structuredClone(linked),
    complaintHistory: structuredClone(complaintHistory),
    workOrderHistory: structuredClone(workOrderHistory),
    auditEvents: structuredClone(auditEvents),
    workOrderCreates,
    workOrderReassigns,
    complaintWrites,
    codeAllocations,
  });
  database.restoreState = (value) => {
    const snapshot = value as {
      currentComplaint: ComplaintRecord;
      linked: WorkOrderRecord[];
      complaintHistory: unknown[];
      workOrderHistory: unknown[];
      auditEvents: Array<Record<string, unknown>>;
      workOrderCreates: number;
      workOrderReassigns: number;
      complaintWrites: number;
      codeAllocations: number;
    };
    currentComplaint = snapshot.currentComplaint;
    linked.splice(0, linked.length, ...snapshot.linked);
    complaintHistory.splice(0, complaintHistory.length, ...snapshot.complaintHistory);
    workOrderHistory.splice(0, workOrderHistory.length, ...snapshot.workOrderHistory);
    auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
    workOrderCreates = snapshot.workOrderCreates;
    workOrderReassigns = snapshot.workOrderReassigns;
    complaintWrites = snapshot.complaintWrites;
    codeAllocations = snapshot.codeAllocations;
  };
  return {
    service,
    database,
    linked,
    complaintHistory,
    workOrderHistory,
    auditEvents,
    counts: () => ({ workOrderCreates, workOrderReassigns, complaintWrites }),
    codeAllocations: () => codeAllocations,
  };
}

const context = {
  actorUserId: ACTOR_A,
  ipAddress: '127.0.0.1',
  userAgent: 'm16-contract',
  correlationId: 'm16-correlation',
};

const v2Options = {
  authorizedPropertyId: PROPERTY_A,
  v2: true,
  idempotencyKey: IDEMPOTENCY_KEY,
};

function exceptionBody(error: unknown): Record<string, unknown> {
  assert.ok(error instanceof HttpException);
  return error.getResponse() as Record<string, unknown>;
}

test('assign DTO and live controller lock UUID v4, exact RBAC, and authorization before dispatch', async () => {
  assert.deepEqual(
    await validate(plainToInstance(AssignComplaintDto, { assigned_to_user_id: TECHNICIAN_A })),
    [],
  );
  assert.notDeepEqual(
    await validate(plainToInstance(AssignComplaintDto, { assigned_to_user_id: 'not-a-uuid' })),
    [],
  );
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ComplaintController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, ComplaintController.prototype.assign), [
    'complaint.manage',
    'maintenance.manage',
  ]);

  const calls: string[] = [];
  const controller = new ComplaintController(
    {
      get: async () => {
        calls.push('complaint');
        return complaint();
      },
      assign: async () => {
        calls.push('dispatch');
        return complaint();
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        calls.push('authorize');
      },
    } as never,
    {} as never,
  );
  await controller.assign(
    {
      id: ACTOR_A,
      roles: ['admin'],
      permissions: ['complaint.manage', 'maintenance.manage'],
      propertyIds: [PROPERTY_A],
    } as never,
    COMPLAINT_A,
    { assigned_to_user_id: TECHNICIAN_A },
    { headers: { accept: V2_ACCEPT, 'idempotency-key': IDEMPOTENCY_KEY } } as never,
  );
  assert.deepEqual(calls, ['complaint', 'authorize', 'dispatch']);
});

test('V2 dispatch derives fields, writes one authority, and exposes exact safe envelope', async () => {
  const state = harness();
  const result = await state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
  assert.deepEqual(Object.keys(result), ['data']);
  assert.ok('data' in result);
  assert.deepEqual(Object.keys(result.data), ['complaint', 'work_order']);
  assert.deepEqual(Object.keys(result.data.complaint), [
    'id',
    'propertyId',
    'roomId',
    'complaintCode',
    'priority',
    'status',
    'assignedToUserId',
    'createdAt',
    'updatedAt',
  ]);
  assert.deepEqual(Object.keys(result.data.work_order), [
    'id',
    'propertyId',
    'roomId',
    'complaintId',
    'workOrderCode',
    'priority',
    'status',
    'assignedToUserId',
    'scheduledAt',
    'startedAt',
    'completedAt',
    'verifiedAt',
    'createdAt',
    'updatedAt',
  ]);
  assert.equal(result.data.work_order.propertyId, PROPERTY_A);
  assert.equal(result.data.work_order.complaintId, COMPLAINT_A);
  assert.equal(result.data.work_order.assignedToUserId, TECHNICIAN_A);
  assert.match(result.data.work_order.workOrderCode, /^WO-GSH-\d{4}-0001$/);
  assert.doesNotMatch(result.data.work_order.workOrderCode, /CMP|TKT/);
  assert.deepEqual(state.counts(), {
    workOrderCreates: 1,
    workOrderReassigns: 0,
    complaintWrites: 1,
  });
  assert.equal(state.complaintHistory.length, 1);
  assert.equal(state.workOrderHistory.length, 1);
  assert.deepEqual(state.complaintHistory[0], {
    complaintId: COMPLAINT_A,
    fromStatus: 'acknowledged',
    toStatus: 'in_progress',
    actorUserId: ACTOR_A,
    label: 'Complaint assigned to maintenance',
  });
  assert.deepEqual(state.workOrderHistory[0], {
    workOrderId: result.data.work_order.id,
    fromStatus: 'open',
    toStatus: 'assigned',
    actorUserId: ACTOR_A,
    notes: 'Work order created from complaint dispatch',
  });
  assert.equal(state.codeAllocations(), 1);
  assert.equal(state.auditEvents.length, 2);
  assert.doesNotMatch(
    JSON.stringify(state.auditEvents),
    /Private Resident|Deskripsi internal|"phone"|"address"/i,
  );
});

test('legacy dispatch keeps bare complaint response and does not require or claim idempotency', async () => {
  const state = harness();
  const result = await state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, {
    authorizedPropertyId: PROPERTY_A,
    v2: false,
  });
  assert.equal('data' in result, false);
  assert.equal((result as ComplaintRecord).assignedToUserId, TECHNICIAN_A);
  assert.equal(
    state.database.sql.some((sql) => sql.includes('idempotency_commands')),
    false,
  );
});

test('V2 missing idempotency key fails before transaction or domain mutation', async () => {
  const state = harness();
  await assert.rejects(
    state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, {
      authorizedPropertyId: PROPERTY_A,
      v2: true,
    }),
    (error) => exceptionBody(error).code === 'IDEMPOTENCY_KEY_REQUIRED',
  );
  assert.equal(state.database.transactions, 0);
  assert.deepEqual(state.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });
});

test('V2 same key replays exact response and same technician is a domain no-op', async () => {
  const state = harness();
  const first = await state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
  const firstCounts = state.counts();
  const second = await state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
  assert.deepEqual(second, first);
  assert.deepEqual(state.counts(), firstCounts);

  const noOp = harness({
    complaint: complaint({
      complaintStatus: 'in_progress',
      assignedToUserId: TECHNICIAN_A,
    }),
    workOrders: [workOrder()],
  });
  await noOp.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
  assert.deepEqual(noOp.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });
  assert.equal(noOp.auditEvents.length, 0);
});

test('V2 key reuse with a different technician fails closed without a second domain write', async () => {
  const state = harness();
  await state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
  const counts = state.counts();
  await assert.rejects(
    state.service.assign(COMPLAINT_A, TECHNICIAN_B, context, v2Options),
    (error) => exceptionBody(error).code === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.deepEqual(state.counts(), counts);
});

test('different technician reassigns existing authority without resetting in-progress status', async () => {
  const state = harness({
    complaint: complaint({
      complaintStatus: 'in_progress',
      assignedToUserId: TECHNICIAN_A,
    }),
    workOrders: [workOrder({ workOrderStatus: 'in_progress' })],
  });
  const result = await state.service.assign(COMPLAINT_A, TECHNICIAN_B, context, v2Options);
  assert.ok('data' in result);
  assert.equal(result.data.work_order.status, 'in_progress');
  assert.equal(result.data.work_order.assignedToUserId, TECHNICIAN_B);
  assert.deepEqual(state.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 1,
    complaintWrites: 1,
  });
});

test('reassignment preserves on-hold/escalated complaint lifecycle and same technician is a no-op', async () => {
  for (const complaintStatus of ['on_hold', 'escalated'] as const) {
    const state = harness({
      complaint: complaint({ complaintStatus, assignedToUserId: TECHNICIAN_A }),
      workOrders: [workOrder({ workOrderStatus: 'in_progress' })],
    });
    const result = await state.service.assign(COMPLAINT_A, TECHNICIAN_B, context, v2Options);
    assert.ok('data' in result);
    assert.equal(result.data.complaint.status, complaintStatus);
    assert.equal(result.data.complaint.assignedToUserId, TECHNICIAN_B);
    assert.equal(result.data.work_order.status, 'in_progress');
    assert.deepEqual(state.counts(), {
      workOrderCreates: 0,
      workOrderReassigns: 1,
      complaintWrites: 1,
    });

    const noOp = harness({
      complaint: complaint({ complaintStatus, assignedToUserId: TECHNICIAN_A }),
      workOrders: [workOrder({ workOrderStatus: 'in_progress' })],
    });
    const noOpResult = await noOp.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
    assert.ok('data' in noOpResult);
    assert.equal(noOpResult.data.complaint.status, complaintStatus);
    assert.deepEqual(noOp.counts(), {
      workOrderCreates: 0,
      workOrderReassigns: 0,
      complaintWrites: 0,
    });
  }
});

test('multiple actionable work orders fail closed before any dispatch mutation', async () => {
  const state = harness({
    workOrders: [
      workOrder(),
      workOrder({
        id: '66666666-6666-4666-8666-666666666667',
        workOrderCode: 'WO-GSH-2026-0002',
        workOrderStatus: 'in_progress',
      }),
    ],
  });
  await assert.rejects(
    state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options),
    (error) => exceptionBody(error).code === 'COMPLAINT_WORK_ORDER_INVARIANT_VIOLATION',
  );
  assert.deepEqual(state.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });
  assert.equal(state.database.commands.size, 0);
});

test('completed fails closed while verified/cancelled permits one new work order', async () => {
  const completed = harness({ workOrders: [workOrder({ workOrderStatus: 'completed' })] });
  await assert.rejects(
    completed.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options),
    (error) => exceptionBody(error).code === 'WORK_ORDER_COMPLETED_REASSIGNMENT_DENIED',
  );
  assert.deepEqual(completed.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });

  for (const status of ['verified', 'cancelled'] as const) {
    const terminal = harness({ workOrders: [workOrder({ workOrderStatus: status })] });
    await terminal.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options);
    assert.equal(terminal.counts().workOrderCreates, 1);
    assert.equal(terminal.linked.length, 2);
  }
});

test('cross-property/inactive technician and ineligible complaint fail before mutation', async () => {
  const wrongAuthorizedProperty = harness();
  await assert.rejects(
    wrongAuthorizedProperty.service.assign(COMPLAINT_A, TECHNICIAN_A, context, {
      ...v2Options,
      authorizedPropertyId: PROPERTY_B,
    }),
    (error) => exceptionBody(error).code === 'PROPERTY_SCOPE_DENIED',
  );
  assert.equal(wrongAuthorizedProperty.database.commands.size, 0);
  assert.deepEqual(wrongAuthorizedProperty.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });

  const crossProperty = harness({ technicianPropertyId: PROPERTY_B });
  await assert.rejects(
    crossProperty.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options),
    (error) => exceptionBody(error).code === 'TECHNICIAN_NOT_ACTIVE',
  );
  assert.deepEqual(crossProperty.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });

  const closed = harness({ complaint: complaint({ complaintStatus: 'closed' }) });
  await assert.rejects(
    closed.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options),
    (error) => exceptionBody(error).code === 'COMPLAINT_NOT_DISPATCHABLE',
  );
  assert.equal(closed.database.commands.size, 0);
});

test('two concurrent commands serialize per complaint and create one actionable work order', async () => {
  const state = harness();
  await Promise.all([
    state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options),
    state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, {
      ...v2Options,
      idempotencyKey: 'm16-dispatch-key-0002',
    }),
  ]);
  assert.equal(state.counts().workOrderCreates, 1);
  assert.equal(state.linked.filter((item) => item.workOrderStatus === 'assigned').length, 1);
  assert.equal(state.database.sql.filter((sql) => sql.includes('pg_advisory_xact_lock')).length, 2);
});

test('two complaint code allocations share one property-year lock before reading distinct sequences', async () => {
  assert.notEqual(COMPLAINT_A, COMPLAINT_B);
  let poolQueries = 0;
  const repository = new WorkOrderRepository({
    client: {
      query: async () => {
        poolQueries += 1;
        return { rows: [] };
      },
    },
  } as never);
  const year = 2026;
  const makeClient = (sequence: number) => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    return {
      calls,
      client: {
        query: async (sql: string, values: unknown[] = []) => {
          calls.push({ sql, values });
          if (sql.includes('SELECT properties.name AS property_name')) {
            return {
              rows: [{ property_name: 'Granada Student House', next_sequence: String(sequence) }],
            };
          }
          return { rows: [] };
        },
      },
    };
  };
  const first = makeClient(1);
  const second = makeClient(2);

  assert.deepEqual(await repository.allocateDispatchCode(PROPERTY_A, year, first.client as never), {
    propertyName: 'Granada Student House',
    sequence: 1,
  });
  assert.deepEqual(
    await repository.allocateDispatchCode(PROPERTY_A, year, second.client as never),
    { propertyName: 'Granada Student House', sequence: 2 },
  );
  for (const calls of [first.calls, second.calls]) {
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /pg_advisory_xact_lock/);
    assert.match(calls[0].sql, /maintenance_work_order_code/);
    assert.deepEqual(calls[0].values, [PROPERTY_A, year]);
    assert.match(calls[1].sql, /count\(\*\) \+ 1/);
    assert.deepEqual(calls[1].values, [PROPERTY_A, year]);
  }
  assert.equal(poolQueries, 0);
});

test('dispatch complaint update preserves active lifecycle states in the actual SQL repository', async () => {
  let poolQueries = 0;
  const repository = new ComplaintRepository({
    client: {
      query: async () => {
        poolQueries += 1;
        return { rows: [] };
      },
    },
  } as never);
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const transactionClient = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: [] };
    },
  };

  await repository.assignForDispatch(COMPLAINT_A, TECHNICIAN_A, transactionClient as never);
  assert.equal(calls.length, 1);
  const normalized = calls[0].sql.replace(/\s+/g, ' ').trim();
  assert.match(
    normalized,
    /complaint_status = CASE WHEN complaint_status IN \('submitted', 'acknowledged', 'reopened'\) THEN 'in_progress' ELSE complaint_status END/,
  );
  assert.doesNotMatch(normalized, /SET complaint_status = 'in_progress'/);
  assert.deepEqual(calls[0].values, [COMPLAINT_A, TECHNICIAN_A]);
  assert.equal(poolQueries, 0);
});

test('audit failure rolls back complaint, work order, histories, and idempotency claim', async () => {
  const state = harness({ failAudit: true });
  await assert.rejects(
    state.service.assign(COMPLAINT_A, TECHNICIAN_A, context, v2Options),
    /audit unavailable/,
  );
  assert.deepEqual(state.counts(), {
    workOrderCreates: 0,
    workOrderReassigns: 0,
    complaintWrites: 0,
  });
  assert.equal(state.linked.length, 0);
  assert.equal(state.complaintHistory.length, 0);
  assert.equal(state.workOrderHistory.length, 0);
  assert.equal(state.auditEvents.length, 0);
  assert.equal(state.database.commands.size, 0);
});

test('technician reference endpoint authorizes before one scoped privacy-safe query', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, TechnicianController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, TechnicianController), [
    'maintenance.manage',
  ]);
  const calls: string[] = [];
  const controller = new TechnicianController(
    {
      listReferences: async () => {
        calls.push('query');
        return [{ user_id: TECHNICIAN_A, display_name: 'Teknisi Demo', skill_tags: 'electrical' }];
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        calls.push('authorize');
      },
    } as never,
  );
  const result = await controller.list({} as never, PROPERTY_A);
  assert.deepEqual(calls, ['authorize', 'query']);
  assert.deepEqual(Object.keys(result), ['data']);
  assert.deepEqual(Object.keys(result.data[0]), ['user_id', 'display_name', 'skill_tags']);
});

test('Admin V2 work-order list uses authoritative total, empty offset, and exact whitelist', async () => {
  const service = new WorkOrderService(
    {
      listPage: async () => ({ records: [], total: 3 }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  assert.deepEqual(await service.listAdmin([PROPERTY_A], undefined, 20, 20), {
    data: [],
    meta: { total: 3, limit: 20, offset: 20 },
  });
  assert.deepEqual(Object.keys(service.toAdminResponse(workOrder())), [
    'id',
    'propertyId',
    'roomId',
    'complaintId',
    'workOrderCode',
    'priority',
    'status',
    'assignedToUserId',
    'scheduledAt',
    'startedAt',
    'completedAt',
    'verifiedAt',
    'createdAt',
    'updatedAt',
  ]);
});

test('generic work-order creation cannot bypass canonical complaint dispatch', async () => {
  let creates = 0;
  let histories = 0;
  let audits = 0;
  const service = new WorkOrderService(
    {
      create: async (input: { complaintId?: string }) => {
        creates += 1;
        return workOrder({ complaintId: input.complaintId ?? null });
      },
    } as never,
    { record: async () => (histories += 1) } as never,
    {} as never,
    {} as never,
    {} as never,
    { write: async () => (audits += 1) } as never,
  );
  await assert.rejects(
    service.createWorkOrder({
      propertyId: PROPERTY_A,
      complaintId: COMPLAINT_A,
      workOrderCode: 'CLIENT-CODE',
      title: 'Client title',
      priority: 'high',
      createdByUserId: ACTOR_A,
    }),
    (error) => exceptionBody(error).code === 'COMPLAINT_WORK_ORDER_REQUIRES_DISPATCH',
  );
  assert.equal(creates, 0);

  const standalone = await service.createWorkOrder({
    propertyId: PROPERTY_A,
    workOrderCode: 'WO-GSH-2026-0099',
    title: 'Preventive maintenance',
    priority: 'medium',
    createdByUserId: ACTOR_A,
  });
  assert.equal(standalone.complaintId, null);
  assert.equal(creates, 1);
  assert.equal(histories, 1);
  assert.equal(audits, 1);
});

function assertSourceContract(inputs: Record<string, string>): void {
  const assignRegion = inputs.complaintController.slice(
    inputs.complaintController.indexOf("@Post(':complaintId/assign')"),
    inputs.complaintController.indexOf("@Post(':complaintId/resolve')"),
  );
  assert.match(inputs.complaintController, /ParseUUIDPipe\(\{ version: '4' \}\)/);
  assert.match(
    assignRegion,
    /assertCanReadProperty[\s\S]*complaints\.assign[\s\S]*authorizedPropertyId/,
  );
  assert.match(
    inputs.complaintService,
    /pg_advisory_xact_lock[\s\S]*findByIdForUpdate[\s\S]*claimCommand[\s\S]*lockActive[\s\S]*lockByComplaint/,
  );
  assert.match(inputs.complaintService, /ACTIONABLE_WORK_ORDER_STATUSES/);
  assert.match(inputs.complaintService, /INITIAL_DISPATCH_COMPLAINT_STATUSES/);
  assert.match(inputs.complaintService, /WORK_ORDER_COMPLETED_REASSIGNMENT_DENIED/);
  assert.match(inputs.complaintService, /createDispatch[\s\S]*currentComplaint\.propertyId/);
  assert.match(inputs.complaintService, /currentComplaint\.roomId/);
  assert.match(inputs.complaintService, /currentComplaint\.title/);
  assert.match(inputs.complaintService, /currentComplaint\.description/);
  assert.match(inputs.complaintService, /currentComplaint\.priority/);
  assert.match(inputs.complaintService, /WorkOrderCodeGenerator\.format/);
  assert.match(inputs.complaintService, /allocateDispatchCode/);
  assert.doesNotMatch(inputs.complaintService, /dispatchWorkOrderCode/);
  assert.match(inputs.complaintService, /JSON\.stringify\(\{ data: this\.dispatchResponse/);
  assert.doesNotMatch(inputs.complaintService, /snapshotResidentName[\s\S]{0,300}audit\.write/);
  assert.match(inputs.workOrderService, /COMPLAINT_WORK_ORDER_REQUIRES_DISPATCH/);
  assert.match(
    inputs.workOrderRepository,
    /work_order_status = CASE WHEN work_order_status = 'open' THEN 'assigned' ELSE work_order_status END/,
  );
  assert.match(inputs.workOrderRepository, /COUNT\(\*\)::int AS total/);
  assert.match(inputs.workOrderRepository, /offset >= total/);
  assert.match(inputs.workOrderRepository, /property_id = ANY\(\$1::uuid\[\]\)/);
  const allocationRegion = inputs.workOrderRepository.slice(
    inputs.workOrderRepository.indexOf('async allocateDispatchCode('),
    inputs.workOrderRepository.indexOf('async transitionStatus('),
  );
  assert.ok(allocationRegion.indexOf('pg_advisory_xact_lock') >= 0);
  assert.ok(
    allocationRegion.indexOf('pg_advisory_xact_lock') < allocationRegion.indexOf('count(*) + 1'),
  );
  assert.match(allocationRegion, /maintenance_work_order_code/);
  assert.match(allocationRegion, /properties\.name AS property_name/);
  const complaintAssignRegion = inputs.complaintRepository.slice(
    inputs.complaintRepository.indexOf('async assignForDispatch('),
    inputs.complaintRepository.indexOf('async updateSlaFlags('),
  );
  const normalizedComplaintAssign = complaintAssignRegion.replace(/\s+/g, ' ');
  assert.ok(
    normalizedComplaintAssign.includes(
      "complaint_status = CASE WHEN complaint_status IN ('submitted', 'acknowledged', 'reopened') THEN 'in_progress' ELSE complaint_status END",
    ),
  );
  assert.equal(normalizedComplaintAssign.includes("SET complaint_status = 'in_progress'"), false);
  assert.match(inputs.technicianRepository, /profile\.property_id = \$1/);
  assert.match(inputs.technicianRepository, /profile\.is_active = true/);
  assert.match(inputs.technicianRepository, /users\.user_status = 'active'/);
  assert.match(inputs.maintenanceModule, /TechnicianController/);
  assert.match(inputs.technicianController, /@Controller\('maintenance\/technicians'\)/);
  assert.match(inputs.technicianController, /assertCanReadProperty[\s\S]*listReferences/);
  assert.match(inputs.workOrderController, /acceptsAdminUxV2[\s\S]*listAdmin/);
  assert.match(inputs.workOrderController, /acceptsAdminUxV2[\s\S]*adminDetail/);
  assert.match(inputs.workOrderController, /Promise\.all[\s\S]*return result\.flat\(\)/);
  assert.match(inputs.complaintModule, /MaintenanceModule/);
}

test('source contract rejects mutations that move authorization, remove locks, reset status, or allow bypass', () => {
  const inputs = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, source(path)]),
  );
  assertSourceContract(inputs);
  assert.throws(() =>
    assertSourceContract({
      ...inputs,
      complaintService: inputs.complaintService.replace('pg_advisory_xact_lock', 'lock_removed'),
    }),
  );
  assert.throws(() =>
    assertSourceContract({
      ...inputs,
      complaintRepository: inputs.complaintRepository.replace(
        `complaint_status = CASE
             WHEN complaint_status IN ('submitted', 'acknowledged', 'reopened')
               THEN 'in_progress'
             ELSE complaint_status
           END,`,
        "complaint_status = 'in_progress',",
      ),
    }),
  );
  const allocationWithoutLock = inputs.workOrderRepository
    .slice(
      inputs.workOrderRepository.indexOf('async allocateDispatchCode('),
      inputs.workOrderRepository.indexOf('async transitionStatus('),
    )
    .replace('pg_advisory_xact_lock', 'code_lock_removed');
  assert.throws(() => assert.ok(allocationWithoutLock.includes('pg_advisory_xact_lock')));
  assert.throws(() =>
    assertSourceContract({
      ...inputs,
      complaintController: inputs.complaintController.replace(
        /(@Post\(':complaintId\/assign'\)[\s\S]*?)await this\.properties\.assertCanReadProperty\(user, complaint\.propertyId\);/,
        '$1',
      ),
    }),
  );
  assert.throws(() =>
    assertSourceContract({
      ...inputs,
      workOrderRepository: inputs.workOrderRepository.replace(
        "work_order_status = CASE WHEN work_order_status = 'open' THEN 'assigned' ELSE work_order_status END",
        "work_order_status = 'assigned'",
      ),
    }),
  );
  assert.throws(() =>
    assertSourceContract({
      ...inputs,
      workOrderService: inputs.workOrderService.replace(
        'COMPLAINT_WORK_ORDER_REQUIRES_DISPATCH',
        'REMOVED',
      ),
    }),
  );
});

test('dispatch source contains no room, lease, occupancy, billing, provider, or webhook mutation', () => {
  const dispatch = source(paths.complaintService);
  for (const table of ['rooms', 'leases', 'occupancies', 'invoices', 'payments']) {
    assert.doesNotMatch(
      dispatch,
      new RegExp(`(?:INSERT INTO|UPDATE|DELETE FROM)\\s+${table}`, 'i'),
    );
  }
  assert.doesNotMatch(dispatch, /midtrans|provider refresh|webhook|settlement/i);
});
