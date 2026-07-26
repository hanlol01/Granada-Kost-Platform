import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, RequestMethod, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PaymentGatewayAdminController } from '../../src/modules/payment-gateway/payment-gateway.admin.controller';
import { ListPaymentTransactionsQueryDto } from '../../src/modules/payment-gateway/dto/list-payment-transactions-query.dto';
import { PaymentGatewayRepository } from '../../src/modules/payment-gateway/payment-gateway.repository';
import {
  PaymentGatewayService,
  type PaymentTransactionAdminResponse,
} from '../../src/modules/payment-gateway/payment-gateway.service';
import type { PaymentTransactionRecord } from '../../src/modules/payment-gateway/payment-gateway.types';
import { PropertyService } from '../../src/modules/property/property.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../src/modules/rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/modules/rbac/guards/rbac.guard';

const PROPERTY_A = '11111111-1111-4111-8111-111111111111';
const PROPERTY_B = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = 'opaque-resident-44444444';
const REQUESTED_BY_USER_ID = 'opaque-requester-55555555';
const PAYMENT_STATUSES = [
  'created',
  'pending',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'denied',
  'challenge',
  'requires_review',
  'unknown',
] as const;

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

test('PG2.1 exposes only the two existing GET routes with the existing guards', () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PaymentGatewayAdminController),
    'admin/payment-transactions',
  );
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PaymentGatewayAdminController), [
    JwtAuthGuard,
    RbacGuard,
  ]);
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PaymentGatewayAdminController.prototype.list),
    RequestMethod.GET,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PaymentGatewayAdminController.prototype.list),
    '/',
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PaymentGatewayAdminController.prototype.get),
    RequestMethod.GET,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PaymentGatewayAdminController.prototype.get),
    ':transactionId',
  );

  const routedMethods = Object.getOwnPropertyNames(PaymentGatewayAdminController.prototype)
    .filter((name) => {
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        PaymentGatewayAdminController.prototype[name as keyof PaymentGatewayAdminController],
      );
      return method !== undefined;
    })
    .sort();
  assert.deepEqual(routedMethods, ['get', 'list']);
});

test('PG2.1 query keeps the existing closed status enum and pagination contract', async () => {
  const defaults = plainToInstance(ListPaymentTransactionsQueryDto, {});
  assert.equal((await validate(defaults)).length, 0);
  assert.deepEqual({ limit: defaults.limit, offset: defaults.offset }, { limit: 20, offset: 0 });

  for (const status of PAYMENT_STATUSES) {
    const query = plainToInstance(ListPaymentTransactionsQueryDto, { status });
    assert.equal((await validate(query)).length, 0);
  }

  const edges = plainToInstance(ListPaymentTransactionsQueryDto, {
    property_id: PROPERTY_A,
    status: 'paid',
    limit: '100',
    offset: '0',
  });
  assert.equal((await validate(edges)).length, 0);
  assert.deepEqual({ limit: edges.limit, offset: edges.offset }, { limit: 100, offset: 0 });

  for (const input of [
    { property_id: 'not-a-uuid' },
    { status: 'settled' },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: 1.5 },
  ]) {
    assert.notEqual(
      (await validate(plainToInstance(ListPaymentTransactionsQueryDto, input))).length,
      0,
    );
  }
});

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
        return {
          data: [],
          meta: { limit: limit ?? 20, offset: offset ?? 0, total: 0 },
        };
      },
    } as never,
    propertyService(),
  );
  const actor = user();

  const scoped = await controller.list(actor, { status: 'paid', limit: 10, offset: 2 });
  assert.deepEqual(scoped, { data: [], meta: { limit: 10, offset: 2, total: 0 } });
  assert.deepEqual(Object.keys(scoped).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(scoped.meta).sort(), ['limit', 'offset', 'total']);
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
        return { rows: /count\(\*\)/i.test(text) ? [{ total: '37' }] : [] };
      },
    },
  } as never);

  const result = await repository.listForProperties([PROPERTY_A], 'paid', 10, 2);
  assert.deepEqual(result, { records: [], total: 37 });
  assert.equal(queries.length, 2);

  const page = queries.find((query) => !/count\(\*\)/i.test(query.text));
  const count = queries.find((query) => /count\(\*\)/i.test(query.text));
  assert.ok(page);
  assert.ok(count);
  for (const query of [page, count]) {
    assert.match(query.text, /WHERE property_id = ANY\(\$1::uuid\[\]\)/);
    assert.match(query.text, /\(\$2::text IS NULL OR status = \$2\)/);
  }
  assert.deepEqual(page.values, [[PROPERTY_A], 'paid', 10, 2]);
  assert.deepEqual(count.values, [[PROPERTY_A], 'paid']);
  assert.match(page.text, /ORDER BY created_at DESC/);

  assert.deepEqual(await repository.listForProperties([]), { records: [], total: 0 });
  assert.equal(queries.length, 2);
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
  assert.deepEqual(response, { data: transaction });
  assert.deepEqual(Object.keys(response), ['data']);
  assert.deepEqual(Object.keys(response.data).sort(), ADMIN_RESPONSE_KEYS);
  assert.deepEqual(lookups, [TRANSACTION_ID, TRANSACTION_ID]);
});

test('M7-B1 Admin list and detail stay repository-only when the gateway and provider are disabled', async () => {
  const record = internalTransaction();
  const auditCalls: unknown[] = [];
  const providerCalls: string[] = [];
  const listCalls: Array<{
    propertyIds: string[];
    status?: string;
    limit?: number;
    offset?: number;
  }> = [];
  const service = new PaymentGatewayService(
    {
      enabled: false,
      provider: 'none',
      midtransEnv: 'sandbox',
      missingMidtransConfig: () => [
        'MIDTRANS_SERVER_KEY',
        'MIDTRANS_CLIENT_KEY',
        'PAYMENT_RETURN_URL',
        'PAYMENT_CANCEL_URL',
        'PAYMENT_WEBHOOK_BASE_URL',
      ],
    } as never,
    {
      listForProperties: async (
        propertyIds: string[],
        status?: string,
        limit?: number,
        offset?: number,
      ) => {
        listCalls.push({ propertyIds, status, limit, offset });
        return { records: [record], total: 37 };
      },
      findById: async () => record,
    } as never,
    {} as never,
    new Proxy(
      {},
      {
        get: (_target, property) => {
          providerCalls.push(String(property));
          throw new Error('Admin read attempted provider access');
        },
      },
    ) as never,
    { write: async (entry: unknown) => auditCalls.push(entry) } as never,
  );

  const list = await service.listAdminTransactions([PROPERTY_A], 'paid', 10, 40);
  const detail = await service.getAdminTransaction(TRANSACTION_ID);
  assert.deepEqual(listCalls, [
    { propertyIds: [PROPERTY_A], status: 'paid', limit: 10, offset: 40 },
  ]);
  assert.deepEqual(Object.keys(list).sort(), ['data', 'meta']);
  assert.deepEqual(list.meta, { limit: 10, offset: 40, total: 37 });
  assert.deepEqual(Object.keys(list.meta).sort(), ['limit', 'offset', 'total']);
  assert.equal(list.data.length, 1);

  const empty = await service.listAdminTransactions([]);
  assert.deepEqual(empty, { data: [], meta: { limit: 20, offset: 0, total: 0 } });
  assert.equal(listCalls.length, 1);

  for (const response of [list.data[0], detail]) {
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
      'providerTransactionId',
      'paymentUrl',
      'snapToken',
      'rawStatusCode',
      'metadata',
      'signature',
      'credential',
      'serverKey',
      'clientKey',
      'webhookSecret',
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }

  assert.deepEqual(auditCalls, []);
  assert.deepEqual(providerCalls, []);
});

test('resident session, resident status, and webhook remain fail-closed when the gateway is disabled', async () => {
  const dependencyCalls: string[] = [];
  const blockedDependency = new Proxy(
    {},
    {
      get: (_target, property) => {
        dependencyCalls.push(String(property));
        throw new Error('Disabled path accessed a dependency');
      },
    },
  );
  const service = new PaymentGatewayService(
    {
      enabled: false,
      provider: 'none',
      midtransEnv: 'sandbox',
      missingMidtransConfig: () => ['MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY'],
    } as never,
    blockedDependency as never,
    blockedDependency as never,
    blockedDependency as never,
    blockedDependency as never,
  );

  for (const operation of [
    () => service.createResidentPaymentSession('invoice-id', user()),
    () => service.getResidentPaymentStatus('invoice-id', user()),
    () => service.handleMidtransWebhook({} as never),
  ]) {
    await assert.rejects(operation(), (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      const response = error.getResponse();
      assert.equal(typeof response, 'object');
      assert.equal((response as { code?: string }).code, 'PAYMENT_GATEWAY_DISABLED');
      return true;
    });
  }

  assert.deepEqual(dependencyCalls, []);
});
