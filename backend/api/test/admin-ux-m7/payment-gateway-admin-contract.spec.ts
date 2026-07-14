import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PaymentGatewayAdminController } from '../../src/modules/payment-gateway/payment-gateway.admin.controller';
import { PaymentGatewayRepository } from '../../src/modules/payment-gateway/payment-gateway.repository';
import {
  PaymentGatewayService,
  type PaymentTransactionAdminResponse,
} from '../../src/modules/payment-gateway/payment-gateway.service';
import type { PaymentTransactionRecord } from '../../src/modules/payment-gateway/payment-gateway.types';
import { PropertyService } from '../../src/modules/property/property.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { RbacGuard } from '../../src/modules/rbac/guards/rbac.guard';

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = 'opaque-resident-44444444';
const REQUESTED_BY_USER_ID = 'opaque-requester-55555555';

const ADMIN_RESPONSE_KEYS = [
  'amount',
  'createdAt',
  'currency',
  'failedAt',
  'id',
  'invoiceId',
  'paidAt',
  'paymentMethod',
  'propertyId',
  'provider',
  'providerOrderId',
  'requestedByUserId',
  'residentId',
  'status',
  'updatedAt',
].sort();

function user(
  roles: string[] = ['admin'],
  permissions: string[] = ['billing.read'],
  propertyIds: string[] = [PROPERTY_A],
): UserAccessContext {
  return {
    id: 'actor-admin',
    email: null,
    phone: null,
    displayName: 'M7 Admin',
    roles,
    permissions,
    propertyIds,
    sessionId: 'session-m7',
  };
}

function executionContext(access: UserAccessContext): ExecutionContext {
  return {
    getClass: () => PaymentGatewayAdminController,
    getHandler: () => PaymentGatewayAdminController.prototype.list,
    switchToHttp: () => ({ getRequest: () => ({ user: access }) }),
  } as unknown as ExecutionContext;
}

function propertyService(): PropertyService {
  return new PropertyService({} as never, {} as never);
}

function internalTransaction(propertyId = PROPERTY_A): PaymentTransactionRecord {
  return {
    id: TRANSACTION_ID,
    invoiceId: '66666666-6666-4666-8666-666666666666',
    propertyId,
    residentId: RESIDENT_ID,
    requestedByUserId: REQUESTED_BY_USER_ID,
    provider: 'midtrans',
    providerOrderId: 'SAFE-PROVIDER-ORDER',
    providerTransactionId: 'forbidden-provider-transaction',
    amount: 975000,
    currency: 'IDR',
    status: 'paid',
    paymentMethod: 'bank_transfer',
    paymentUrl: 'https://forbidden.example/payment',
    snapTokenRef: 'forbidden-snap-token',
    expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    paidAt: new Date('2026-07-15T00:00:00.000Z'),
    failedAt: null,
    rawStatusCode: 'forbidden-raw-status',
    metadata: {
      rawProviderPayload: 'forbidden-raw-payload',
      signature: 'forbidden-signature',
      serverKey: 'forbidden-server-key',
      residentName: 'Forbidden Resident Name',
      residentEmail: 'forbidden@example.test',
    },
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-15T00:00:00.000Z'),
  };
}

function adminResponse(propertyId = PROPERTY_A): PaymentTransactionAdminResponse {
  return {
    id: TRANSACTION_ID,
    invoiceId: '66666666-6666-4666-8666-666666666666',
    propertyId,
    residentId: RESIDENT_ID,
    requestedByUserId: REQUESTED_BY_USER_ID,
    provider: 'midtrans',
    providerOrderId: 'SAFE-PROVIDER-ORDER',
    amount: 975000,
    currency: 'IDR',
    status: 'paid',
    paymentMethod: 'bank_transfer',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    paidAt: '2026-07-15T00:00:00.000Z',
    failedAt: null,
  };
}

function assertScopeDeniedWithoutLeak(error: unknown): boolean {
  assert.ok(error instanceof ForbiddenException);
  const response = error.getResponse();
  assert.deepEqual(response, {
    code: 'PROPERTY_SCOPE_DENIED',
    message: 'User is not allowed to access this property',
  });
  const serialized = JSON.stringify(response);
  for (const forbidden of [
    RESIDENT_ID,
    REQUESTED_BY_USER_ID,
    'forbidden-raw-payload',
    'forbidden-signature',
    'forbidden-server-key',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  return true;
}

test('M7-B1 enforces manager/admin plus billing.read through the real RBAC guard', () => {
  const reflector = new Reflector();
  const handler = PaymentGatewayAdminController.prototype.list;
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, PaymentGatewayAdminController]),
    ['manager', 'admin'],
  );
  assert.deepEqual(
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [handler, PaymentGatewayAdminController]),
    ['billing.read'],
  );

  const guard = new RbacGuard(reflector);
  assert.equal(guard.canActivate(executionContext(user(['manager']))), true);
  assert.equal(guard.canActivate(executionContext(user(['admin']))), true);
  assert.throws(() => guard.canActivate(executionContext(user(['owner']))), ForbiddenException);
  assert.throws(
    () => guard.canActivate(executionContext(user(['admin'], []))),
    ForbiddenException,
  );
});

test('M7-B1 list is property-scoped and rejects an explicit cross-property request before querying', async () => {
  const calls: Array<{
    propertyIds: string[];
    status?: string;
    limit?: number;
    offset?: number;
  }> = [];
  const controller = new PaymentGatewayAdminController(
    {
      listAdminTransactions: async (
        propertyIds: string[],
        status?: string,
        limit?: number,
        offset?: number,
      ) => {
        calls.push({ propertyIds, status, limit, offset });
        return [];
      },
    } as never,
    propertyService(),
  );
  const actor = user();

  await controller.list(actor, { status: 'paid', limit: 10, offset: 2 });
  assert.deepEqual(calls[0], {
    propertyIds: [PROPERTY_A],
    status: 'paid',
    limit: 10,
    offset: 2,
  });

  await controller.list(actor, { property_id: PROPERTY_A, limit: 20, offset: 0 });
  assert.deepEqual(calls[1]?.propertyIds, [PROPERTY_A]);

  await assert.rejects(
    controller.list(actor, { property_id: PROPERTY_B, limit: 20, offset: 0 }),
    assertScopeDeniedWithoutLeak,
  );
  assert.equal(calls.length, 2);
});

test('M7-B1 repository list query binds the authorized property scope once', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new PaymentGatewayRepository({
    client: {
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });
        return { rows: [] };
      },
    },
  } as never);

  await repository.listForProperties([PROPERTY_A], 'paid', 10, 2);
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /WHERE property_id = ANY\(\$1::uuid\[\]\)/);
  assert.deepEqual(queries[0].values, [[PROPERTY_A], 'paid', 10, 2]);

  await repository.listForProperties([]);
  assert.equal(queries.length, 1);
});

test('M7-B1 detail authorizes against the persisted transaction property', async () => {
  const transaction = adminResponse(PROPERTY_B);
  const lookups: string[] = [];
  const controller = new PaymentGatewayAdminController(
    {
      getAdminTransaction: async (id: string) => {
        lookups.push(id);
        return transaction;
      },
    } as never,
    propertyService(),
  );

  await assert.rejects(
    controller.get(user(), TRANSACTION_ID),
    assertScopeDeniedWithoutLeak,
  );
  assert.deepEqual(lookups, [TRANSACTION_ID]);

  const response = await controller.get(
    user(['manager'], ['billing.read'], [PROPERTY_B]),
    TRANSACTION_ID,
  );
  assert.equal(response, transaction);
  assert.deepEqual(lookups, [TRANSACTION_ID, TRANSACTION_ID]);
});

test('M7-B1 list and detail expose only the approved whitelist and retain opaque IDs without logging', async () => {
  const record = internalTransaction();
  const auditCalls: unknown[] = [];
  const service = new PaymentGatewayService(
    {
      enabled: true,
      provider: 'midtrans',
      midtransEnv: 'sandbox',
      missingMidtransConfig: () => [],
    } as never,
    {
      listForProperties: async () => [record],
      findById: async () => record,
    } as never,
    {} as never,
    {} as never,
    { write: async (entry: unknown) => auditCalls.push(entry) } as never,
  );

  const list = await service.listAdminTransactions([PROPERTY_A], 'paid', 20, 0);
  const detail = await service.getAdminTransaction(TRANSACTION_ID);
  assert.equal(list.length, 1);

  for (const response of [list[0], detail]) {
    assert.deepEqual(Object.keys(response).sort(), ADMIN_RESPONSE_KEYS);
    assert.equal(response.residentId, RESIDENT_ID);
    assert.equal(response.requestedByUserId, REQUESTED_BY_USER_ID);
    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'forbidden-provider-transaction',
      'https://forbidden.example/payment',
      'forbidden-snap-token',
      'forbidden-raw-status',
      'forbidden-raw-payload',
      'forbidden-signature',
      'forbidden-server-key',
      'Forbidden Resident Name',
      'forbidden@example.test',
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }

  assert.deepEqual(auditCalls, []);
});
