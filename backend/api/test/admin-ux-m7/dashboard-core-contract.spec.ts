import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { DashboardController } from '../../src/modules/dashboard/dashboard.controller';
import {
  DashboardRepository,
  type DashboardSnapshotRow,
} from '../../src/modules/dashboard/dashboard.repository';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';
import { DashboardSummaryQueryDto } from '../../src/modules/dashboard/dto/dashboard-summary-query.dto';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { RbacGuard } from '../../src/modules/rbac/guards/rbac.guard';

const root = resolve(__dirname, '../..');
const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const REQUIRED_PERMISSIONS = ['room.read', 'lease.read', 'billing.read'];

function user(
  roles: string[] = ['admin'],
  permissions: string[] = REQUIRED_PERMISSIONS,
  propertyIds: string[] = [PROPERTY_A],
): UserAccessContext {
  return {
    id: 'actor-dashboard',
    email: null,
    phone: null,
    displayName: 'Dashboard Actor',
    roles,
    permissions,
    propertyIds,
    sessionId: 'session-dashboard',
  };
}

function executionContext(access: UserAccessContext): ExecutionContext {
  return {
    getClass: () => DashboardController,
    getHandler: () => DashboardController.prototype.summary,
    switchToHttp: () => ({ getRequest: () => ({ user: access }) }),
  } as unknown as ExecutionContext;
}

function snapshot(overrides: Partial<DashboardSnapshotRow> = {}): DashboardSnapshotRow {
  return {
    property_exists: true,
    active_leases: 2,
    active_residents: 3,
    rooms_total: 5,
    rooms_vacant: 2,
    rooms_occupied: 2,
    rooms_maintenance: 1,
    outstanding_amount: '2500000',
    overdue_invoice_count: 1,
    recent_leases: [
      {
        id: 'lease-safe-id',
        lease_code: 'LS-001',
        lease_status: 'active',
        start_date: '2026-07-14',
        created_at: '2026-07-14T01:00:00.000Z',
        room: { number: 'A-01' },
      },
    ],
    recent_payments: [
      {
        id: 'payment-safe-id',
        payment_code: 'PAY-001',
        payment_status: 'verified',
        payment_method: 'bank_transfer',
        amount: '1250000',
        paid_at: '2026-07-14T02:00:00.000Z',
        verified_at: '2026-07-14T02:05:00.000Z',
        created_at: '2026-07-14T01:55:00.000Z',
      },
    ],
    generated_at: new Date('2026-07-14T03:00:00.000Z'),
    period_start: new Date('2026-06-30T17:00:00.000Z'),
    period_end: new Date('2026-07-31T17:00:00.000Z'),
    ...overrides,
  };
}

function serviceWithSnapshot(value: DashboardSnapshotRow) {
  const calls: Array<{ propertyId: string; authorizedScope: boolean }> = [];
  const service = new DashboardService({
    getCoreSnapshot: async (propertyId: string, authorizedScope: boolean) => {
      calls.push({ propertyId, authorizedScope });
      return value;
    },
  } as never);
  return { service, calls };
}

test('M7-D2A requires an approved role and all three dashboard permissions', () => {
  const reflector = new Reflector();
  const handler = DashboardController.prototype.summary;

  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, DashboardController]),
    ['owner', 'manager', 'admin'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [handler, DashboardController]),
    REQUIRED_PERMISSIONS,
  );

  const guard = new RbacGuard(reflector);
  for (const role of ['owner', 'manager', 'admin']) {
    assert.equal(guard.canActivate(executionContext(user([role]))), true);
  }
  assert.throws(
    () => guard.canActivate(executionContext(user(['property_owner']))),
    ForbiddenException,
  );
  for (const missing of REQUIRED_PERMISSIONS) {
    assert.throws(
      () =>
        guard.canActivate(
          executionContext(
            user(
              ['admin'],
              REQUIRED_PERMISSIONS.filter((permission) => permission !== missing),
            ),
          ),
        ),
      ForbiddenException,
    );
  }
});

test('M7-D2A distinguishes missing and malformed property_id without querying', async () => {
  let repositoryCalls = 0;
  const service = new DashboardService({
    getCoreSnapshot: async () => {
      repositoryCalls += 1;
      return snapshot();
    },
  } as never);

  await assert.rejects(service.getCoreSummary(user(), {}), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.deepEqual(error.getResponse(), {
      code: 'PROPERTY_ID_REQUIRED',
      message: 'property_id is required',
    });
    return true;
  });
  assert.equal(repositoryCalls, 0);

  const malformed = new DashboardSummaryQueryDto();
  malformed.property_id = 'not-a-uuid';
  const validationErrors = await validate(malformed);
  assert.equal(validationErrors.length, 1);
  assert.ok(validationErrors[0].constraints?.isUuid);

  const mainSource = await readFile(resolve(root, 'src/main.ts'), 'utf8');
  assert.match(mainSource, /code: 'VALIDATION_ERROR'/);
});

test('M7-D2A applies property existence before scope denial and supports owner/global scope', async () => {
  const nonexistent = serviceWithSnapshot(snapshot({ property_exists: false }));
  await assert.rejects(
    nonexistent.service.getCoreSummary(user(['manager'], REQUIRED_PERMISSIONS, [PROPERTY_B]), {
      property_id: PROPERTY_A,
    }),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundException);
      assert.deepEqual(error.getResponse(), {
        code: 'PROPERTY_NOT_FOUND',
        message: 'Property not found',
      });
      return true;
    },
  );
  assert.deepEqual(nonexistent.calls, [{ propertyId: PROPERTY_A, authorizedScope: false }]);

  const denied = serviceWithSnapshot(snapshot());
  await assert.rejects(
    denied.service.getCoreSummary(user(['admin'], REQUIRED_PERMISSIONS, [PROPERTY_B]), {
      property_id: PROPERTY_A,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.deepEqual(error.getResponse(), {
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'User is not allowed to access this property',
      });
      return true;
    },
  );
  assert.deepEqual(denied.calls, [{ propertyId: PROPERTY_A, authorizedScope: false }]);

  const owner = serviceWithSnapshot(snapshot());
  await owner.service.getCoreSummary(user(['owner'], REQUIRED_PERMISSIONS, []), {
    property_id: PROPERTY_A,
  });
  assert.deepEqual(owner.calls, [{ propertyId: PROPERTY_A, authorizedScope: true }]);

  const scopedManager = serviceWithSnapshot(snapshot());
  await scopedManager.service.getCoreSummary(
    user(['manager'], REQUIRED_PERMISSIONS, [PROPERTY_A]),
    { property_id: PROPERTY_A },
  );
  assert.deepEqual(scopedManager.calls, [{ propertyId: PROPERTY_A, authorizedScope: true }]);
});

test('M7-D2A serializes only the core v1 whitelist with string money and no deferred metric or PII', async () => {
  const unsafeSnapshot = snapshot({
    recent_leases: [
      {
        ...snapshot().recent_leases[0],
        resident_id: 'forbidden-resident-id',
        resident_name: 'Forbidden Resident Name',
        notes: 'forbidden-lease-notes',
      } as never,
    ],
    recent_payments: [
      {
        ...snapshot().recent_payments[0],
        resident_id: 'forbidden-resident-id',
        reference_number: 'forbidden-reference',
        notes: 'forbidden-payment-notes',
        provider_transaction_id: 'forbidden-provider-id',
      } as never,
    ],
  });
  const { service } = serviceWithSnapshot(unsafeSnapshot);
  const response = await service.getCoreSummary(user(), { property_id: PROPERTY_A });

  assert.deepEqual(Object.keys(response), ['data']);
  assert.deepEqual(Object.keys(response.data), [
    'active_leases',
    'active_residents',
    'rooms_total',
    'rooms_vacant',
    'rooms_occupied',
    'rooms_maintenance',
    'outstanding_amount',
    'overdue_invoice_count',
    'recent_leases',
    'recent_payments',
    'timezone',
    'generated_at',
    'period_start',
    'period_end',
  ]);
  assert.deepEqual(Object.keys(response.data.recent_leases[0]), [
    'id',
    'lease_code',
    'lease_status',
    'start_date',
    'created_at',
    'room',
  ]);
  assert.deepEqual(Object.keys(response.data.recent_leases[0].room), ['number']);
  assert.deepEqual(Object.keys(response.data.recent_payments[0]), [
    'id',
    'payment_code',
    'payment_status',
    'payment_method',
    'amount',
    'paid_at',
    'verified_at',
    'created_at',
  ]);
  assert.equal(typeof response.data.outstanding_amount, 'string');
  assert.equal(typeof response.data.recent_payments[0].amount, 'string');
  assert.equal(response.data.timezone, 'Asia/Jakarta');
  assert.equal(response.data.generated_at, '2026-07-14T03:00:00.000Z');
  assert.equal(response.data.period_start, '2026-06-30T17:00:00.000Z');
  assert.equal(response.data.period_end, '2026-07-31T17:00:00.000Z');

  const serialized = JSON.stringify(response);
  for (const forbidden of [
    'verified_revenue_current_month',
    'urgent_maintenance_count',
    'forbidden-resident-id',
    'Forbidden Resident Name',
    'forbidden-lease-notes',
    'forbidden-reference',
    'forbidden-payment-notes',
    'forbidden-provider-id',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('M7-D2A repository uses one read-only repeatable-read snapshot CTE with canonical formulas', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let connectCalls = 0;
  let releaseCalls = 0;
  const client = {
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      if (text.trimStart().startsWith('WITH clock_anchor')) {
        return { rows: [snapshot()] };
      }
      return { rows: [] };
    },
    release: () => {
      releaseCalls += 1;
    },
  };
  const repository = new DashboardRepository({
    client: {
      connect: async () => {
        connectCalls += 1;
        return client;
      },
    },
  } as never);

  const result = await repository.getCoreSnapshot(PROPERTY_A, true);
  assert.equal(result.outstanding_amount, '2500000');
  assert.equal(connectCalls, 1);
  assert.equal(releaseCalls, 1);
  assert.deepEqual(
    queries.map((query) => query.text.trim().split(/\s+/).slice(0, 2).join(' ')),
    ['BEGIN TRANSACTION', 'WITH clock_anchor', 'COMMIT'],
  );

  const dataQueries = queries.filter((query) =>
    query.text.trimStart().startsWith('WITH clock_anchor'),
  );
  assert.equal(dataQueries.length, 1);
  assert.deepEqual(dataQueries[0].values, [PROPERTY_A, true]);
  const sql = dataQueries[0].text;

  assert.equal((sql.match(/transaction_timestamp\(\)/g) ?? []).length, 1);
  assert.match(sql, /Asia\/Jakarta/);
  assert.match(sql, /date_trunc\('month'/);
  assert.match(sql, /INTERVAL '1 month'/);
  assert.match(sql, /EXISTS\(SELECT 1 FROM properties WHERE id = \$1::uuid\)/);
  assert.match(sql, /WHERE \$2::boolean AND property_id = \$1::uuid/);
  assert.match(sql, /lease_status = 'active'/);
  assert.match(sql, /resident_status = 'active'/);
  assert.match(sql, /room_status = 'vacant'/);
  assert.match(sql, /room_status = 'occupied'/);
  assert.match(sql, /room_status IN \('maintenance', 'requires_review'\)/);
  assert.match(sql, /payment_allocations\.allocation_status = 'active'/);
  assert.match(sql, /GROUP BY payment_allocations\.invoice_id/);
  assert.match(sql, /GREATEST\(/);
  assert.match(sql, /invoice_status IN \('issued', 'unpaid', 'partially_paid', 'overdue'\)/);
  assert.match(sql, /open_invoices\.outstanding_amount > 0/);
  assert.match(sql, /open_invoices\.due_date < anchor\.jakarta_today/);
  assert.match(sql, /ORDER BY leases\.created_at DESC, leases\.id DESC/);
  assert.match(
    sql,
    /ORDER BY payments\.paid_at DESC NULLS LAST,[\s\S]*payments\.created_at DESC,[\s\S]*payments\.id DESC/,
  );
  assert.equal((sql.match(/LIMIT 5/g) ?? []).length, 2);
  assert.match(sql, /payments\.amount::text AS amount/);
  assert.doesNotMatch(sql, /maintenance_work_orders/);
  assert.doesNotMatch(sql, /payment_transactions/);
  assert.doesNotMatch(sql, /verified_revenue_current_month|urgent_maintenance_count/);
});

test('M7-D2A AppModule imports and registers DashboardModule exactly once', async () => {
  const source = await readFile(resolve(root, 'src/app.module.ts'), 'utf8');

  assert.equal(
    (
      source.match(
        /import \{ DashboardModule \} from '\.\/modules\/dashboard\/dashboard\.module';/g,
      ) ?? []
    ).length,
    1,
  );
  assert.equal((source.match(/^\s+DashboardModule,$/gm) ?? []).length, 1);
});

test('M7-D2A repository rolls back and releases the client when the snapshot query fails', async () => {
  const queries: string[] = [];
  let releaseCalls = 0;
  const repository = new DashboardRepository({
    client: {
      connect: async () => ({
        query: async (text: string) => {
          queries.push(text.trim());
          if (text.trimStart().startsWith('WITH clock_anchor')) {
            throw new Error('synthetic snapshot failure');
          }
          return { rows: [] };
        },
        release: () => {
          releaseCalls += 1;
        },
      }),
    },
  } as never);

  await assert.rejects(repository.getCoreSnapshot(PROPERTY_A, true), /synthetic snapshot failure/);
  assert.equal(releaseCalls, 1);
  assert.equal(queries[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(queries.filter((query) => query.startsWith('WITH clock_anchor')).length, 1);
  assert.equal(queries.includes('COMMIT'), false);
});
