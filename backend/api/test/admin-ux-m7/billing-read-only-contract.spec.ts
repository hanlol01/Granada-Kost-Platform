import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminBillingController } from '../../src/modules/billing/controllers/admin-billing.controller';
import { ListAdminInvoicesQueryDto } from '../../src/modules/billing/dto/list-admin-invoices-query.dto';
import { ListAdminPaymentsQueryDto } from '../../src/modules/billing/dto/list-admin-payments-query.dto';
import { AdminBillingRepository } from '../../src/modules/billing/repositories/admin-billing.repository';
import { AdminBillingService } from '../../src/modules/billing/services/admin-billing.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../src/modules/rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/modules/rbac/guards/rbac.guard';

const propertyId = '11111111-1111-4111-8111-111111111111';
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: null,
  phone: null,
  displayName: 'Admin',
  roles: ['admin'],
  permissions: ['billing.read'],
  propertyIds: [propertyId],
  sessionId: '33333333-3333-4333-8333-333333333333',
};

test('Admin billing exposes two GET-only RBAC endpoints', () => {
  assert.equal(Reflect.getMetadata(PATH_METADATA, AdminBillingController), 'admin');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AdminBillingController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, AdminBillingController), ['billing.read']);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminBillingController), [
    JwtAuthGuard,
    RbacGuard,
  ]);
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, AdminBillingController.prototype.listInvoices),
    'invoices',
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, AdminBillingController.prototype.listInvoices),
    RequestMethod.GET,
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, AdminBillingController.prototype.listPayments),
    'payments',
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, AdminBillingController.prototype.listPayments),
    RequestMethod.GET,
  );
});

test('Admin billing queries validate closed filters and pagination', async () => {
  const invoice = plainToInstance(ListAdminInvoicesQueryDto, { property_id: propertyId });
  const payment = plainToInstance(ListAdminPaymentsQueryDto, { property_id: propertyId });
  assert.equal((await validate(invoice)).length, 0);
  assert.equal((await validate(payment)).length, 0);
  assert.deepEqual([invoice.limit, invoice.offset], [20, 0]);

  for (const [Dto, input] of [
    [ListAdminInvoicesQueryDto, { property_id: 'bad' }],
    [ListAdminInvoicesQueryDto, { property_id: propertyId, status: 'refunded' }],
    [ListAdminPaymentsQueryDto, { property_id: propertyId, status: 'failed' }],
    [ListAdminPaymentsQueryDto, { property_id: propertyId, limit: 101 }],
    [ListAdminPaymentsQueryDto, { property_id: propertyId, offset: -1 }],
  ] as const) {
    assert.notEqual((await validate(plainToInstance(Dto, input))).length, 0);
  }
});

test('Admin billing requires and authorizes property before querying', async () => {
  let propertyCalls = 0;
  let billingCalls = 0;
  const service = new AdminBillingService(
    {
      listInvoices: async () => {
        billingCalls += 1;
        return { records: [], total: 0 };
      },
      listPayments: async () => {
        billingCalls += 1;
        return { records: [], total: 0 };
      },
    } as never,
    {
      get: async () => {
        propertyCalls += 1;
        throw new Error('scope denied');
      },
    } as never,
  );

  await assert.rejects(service.listInvoices(user, {}), (error) => {
    assert.ok(error instanceof BadRequestException);
    assert.deepEqual(error.getResponse(), {
      code: 'PROPERTY_ID_REQUIRED',
      message: 'property_id is required',
    });
    return true;
  });
  assert.equal(propertyCalls, 0);
  assert.equal(billingCalls, 0);

  await assert.rejects(service.listPayments(user, { property_id: propertyId }), /scope denied/);
  assert.equal(propertyCalls, 1);
  assert.equal(billingCalls, 0);
});

test('Admin billing repositories use count plus safe page queries without joins', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const repository = new AdminBillingRepository({
    client: {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: /count\(\*\)/i.test(sql) ? [{ total: '4' }] : [] };
      },
    },
  } as never);

  assert.equal((await repository.listInvoices(propertyId, 'unpaid', 20, 40)).total, 4);
  assert.equal((await repository.listPayments(propertyId, 'verified', 10, 0)).total, 4);
  assert.equal(calls.length, 4);
  const pages = calls.filter((call) => !/count\(\*\)/i.test(call.sql));
  assert.equal(pages.length, 2);
  assert.match(pages[0].sql, /ORDER BY due_date DESC, id DESC/);
  assert.match(pages[1].sql, /ORDER BY paid_at DESC NULLS LAST, created_at DESC, id DESC/);
  for (const page of pages) {
    assert.doesNotMatch(
      page.sql,
      /\bJOIN\b|resident|snapshot_resident_name|reference_number|notes|metadata|file|provider/i,
    );
  }
});

test('Admin billing service returns exact safe allowlists and pagination meta', async () => {
  const service = new AdminBillingService(
    {
      listInvoices: async () => ({
        records: [
          {
            id: 'invoice-id',
            invoice_code: 'INV-001',
            invoice_status: 'paid',
            subtotal_amount: '1000',
            late_fee_amount: '50',
            total_amount: '1050',
            cycle_start_date: '2026-07-01',
            cycle_end_date: '2026-07-31',
            due_date: '2026-07-10',
            paid_at: new Date('2026-07-09T01:00:00.000Z'),
            snapshot_resident_name: 'forbidden-name',
          },
        ],
        total: 1,
      }),
      listPayments: async () => ({
        records: [
          {
            id: 'payment-id',
            payment_code: 'PAY-001',
            payment_status: 'verified',
            amount: '1050',
            paid_at: new Date('2026-07-09T01:00:00.000Z'),
            verified_at: new Date('2026-07-09T02:00:00.000Z'),
            reference_number: 'forbidden-reference',
            notes: 'forbidden-notes',
          },
        ],
        total: 1,
      }),
    } as never,
    { get: async () => ({ id: propertyId }) } as never,
  );

  const invoices = await service.listInvoices(user, { property_id: propertyId });
  const payments = await service.listPayments(user, { property_id: propertyId });
  assert.deepEqual(Object.keys(invoices.data[0]).sort(), [
    'cycle_end_date',
    'cycle_start_date',
    'due_date',
    'id',
    'invoice_code',
    'invoice_status',
    'late_fee_amount',
    'paid_at',
    'subtotal_amount',
    'total_amount',
  ]);
  assert.deepEqual(Object.keys(payments.data[0]).sort(), [
    'amount',
    'id',
    'paid_at',
    'payment_code',
    'payment_status',
    'verified_at',
  ]);
  assert.deepEqual(invoices.meta, { limit: 20, offset: 0, total: 1 });
  assert.deepEqual(payments.meta, { limit: 20, offset: 0, total: 1 });
  assert.doesNotMatch(
    JSON.stringify({ invoices, payments }),
    /forbidden|resident|reference_number|notes|property_id|metadata|file|provider/i,
  );
});
