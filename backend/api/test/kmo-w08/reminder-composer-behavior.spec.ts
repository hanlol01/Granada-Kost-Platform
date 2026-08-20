import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ReminderComposerService } from '../../src/modules/reminder/reminder-composer.service';
import { ReminderShareRateLimiterService } from '../../src/modules/reminder/reminder-share-rate-limiter.service';

const propertyId = '11111111-1111-4111-8111-111111111111';
const actor = {
  id: '22222222-2222-4222-8222-222222222222',
  email: null,
  phone: null,
  displayName: 'Admin',
  roles: ['admin'],
  permissions: ['billing.manage'],
  propertyIds: [propertyId],
  sessionId: '33333333-3333-4333-8333-333333333333',
};

const title = 'Pengingat {{resident_name}} {{room_number}} {{property_name}}';
const body = [
  '{{invoice_periods}}',
  '{{invoice_total_outstanding}}',
  '{{lease_start_date}}',
  '{{lease_end_date}}',
  '{{payment_due_date}}',
  '{{days_remaining}}',
  '{{admin_whatsapp}}',
  '{{invoice_download_links}}',
].join('\n');

function createService(query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const client = { query };
  const database = {
    client,
    transaction: async <T>(work: (tx: typeof client) => Promise<T>) => work(client),
  };
  const properties = { get: async () => ({ id: propertyId }) };
  const audit = { write: async () => undefined };
  const billing = { sharedInvoiceDocument: async () => ({}) };
  return new ReminderComposerService(
    database as never,
    properties as never,
    audit as never,
    billing as never,
  );
}

test('W08A saves a new immutable template version with a succeeded idempotency response', async () => {
  const statements: string[] = [];
  const service = createService(async (sql) => {
    statements.push(sql);
    if (sql.includes('SELECT response_body')) return { rows: [] };
    if (sql.includes('COALESCE(max(version)')) return { rows: [{ version: 2 }] };
    if (sql.includes('RETURNING id,template_key')) {
      return {
        rows: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            template_key: 'invoice_reminder',
            version: 2,
            title_template: title,
            body_template: body,
          },
        ],
      };
    }
    return { rows: [] };
  });

  const result = await service.createVersion(
    actor as never,
    propertyId,
    { title_template: title, body_template: body },
    'fe-44444444-4444-4444-8444-444444444444',
  );

  assert.equal((result as { version: number }).version, 2);
  assert.ok(statements.some((sql) => sql.includes("command_status='succeeded'")));
  assert.ok(statements.some((sql) => sql.includes("status='archived'")));
  assert.ok(statements.some((sql) => sql.includes('business_events')));
});

test('W08A rejects a multi-invoice composer selection crossing resident authority', async () => {
  const service = createService(async (sql) => {
    if (sql.includes('FROM invoices')) {
      return {
        rows: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            resident_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            resident_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        ],
      };
    }
    return { rows: [] };
  });

  await assert.rejects(
    () =>
      service.residentPreview(actor as never, propertyId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', [
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ]),
    (error: { getResponse: () => { code?: string } }) =>
      error.getResponse().code === 'REMINDER_INVOICE_SELECTION_INVALID',
  );
});

test('W08A keeps email delivery disabled rather than silently handing data to a provider', () => {
  const service = createService(async () => ({ rows: [] }));
  assert.throws(
    () => service.emailDisabled(),
    (error: { getResponse: () => { code?: string } }) =>
      error.getResponse().code === 'EMAIL_DELIVERY_DISABLED',
  );
});

test('W08A rate-limits the public invoice-share bearer route', async () => {
  const limiter = new ReminderShareRateLimiterService({
    client: {
      incr: async () => 21,
      expire: async () => 1,
    },
  } as never);

  await assert.rejects(
    () => limiter.assertAllowed('127.0.0.1'),
    (error: { getResponse: () => { code?: string } }) =>
      error.getResponse().code === 'RATE_LIMITED',
  );
});
