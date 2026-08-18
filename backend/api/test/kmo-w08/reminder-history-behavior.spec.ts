import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { ReminderHistoryService } from '../../src/modules/reminder/reminder-history.service';

const propertyId = '11111111-1111-4111-8111-111111111111';
const residentId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const invoiceId = '44444444-4444-4444-8444-444444444444';

const actor: UserAccessContext = {
  id: actorId,
  email: 'admin@example.test',
  phone: null,
  displayName: 'Admin',
  roles: ['admin'],
  permissions: ['billing.manage'],
  propertyIds: [propertyId],
  sessionId: '55555555-5555-4555-8555-555555555555',
};

const preview = {
  resident_id: residentId,
  recipient: { display_name: 'Uji', room_number: 'AK-01-01', phone: '081234567890' },
  invoice_ids: [invoiceId],
  invoice_details: [],
  total_outstanding_amount: 1800000,
  template: { key: 'invoice_reminder', version: 2 },
  rendered: { title: 'Pengingat tagihan', body: 'Tagihan kamar AK-01-01 belum lunas.' },
  channels: ['whatsapp_manual'],
};

function row(status: 'previewed' | 'external_opened' | 'manual_sent' = 'previewed') {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    property_id: propertyId,
    resident_id: residentId,
    actor_user_id: actorId,
    channel: status === 'external_opened' ? 'whatsapp_manual' : 'manual',
    outcome_status: status,
    invoice_ids: [invoiceId],
    invoice_count: 1,
    total_outstanding_amount: '1800000',
    template_version: 2,
    title_snapshot: 'Pengingat tagihan',
    body_snapshot: 'Tagihan kamar AK-01-01 belum lunas.',
    recipient_name_snapshot: 'Uji',
    room_number_snapshot: 'AK-01-01',
    outcome_note: null,
    created_at: new Date('2026-08-18T02:00:00.000Z'),
    archived_at: null,
  };
}

function createService(query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const client = { query };
  const database = {
    client,
    transaction: async <T>(work: (tx: typeof client) => Promise<T>) => work(client),
  };
  const properties = { get: () => Promise.resolve({ id: propertyId }) };
  const audit = { write: () => Promise.resolve(undefined) };
  const composer = { residentPreview: () => Promise.resolve(preview) };
  return new ReminderHistoryService(
    database as never,
    properties as never,
    audit as never,
    composer as never,
  );
}

void test('W08C creates an immutable preview attempt with audit and event evidence', async () => {
  const statements: string[] = [];
  const service = createService((sql) => {
    statements.push(sql);
    if (sql.includes('INSERT INTO reminder_attempts')) return Promise.resolve({ rows: [row()] });
    return Promise.resolve({ rows: [] });
  });

  const result = await service.createAttempt(
    actor,
    propertyId,
    residentId,
    { invoice_ids: [invoiceId], channel: 'manual', outcome_status: 'previewed' },
    'attempt-key-1',
  );

  assert.equal(result.attempt.outcome_status, 'previewed');
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO reminder_attempts')));
  assert.ok(statements.some((sql) => sql.includes('business_events')));
  assert.ok(statements.some((sql) => sql.includes('idempotency_commands')));
});

void test('W08C external WhatsApp action returns a safe handoff URL', async () => {
  const service = createService((sql) => {
    if (sql.includes('INSERT INTO reminder_attempts'))
      return Promise.resolve({ rows: [row('external_opened')] });
    return Promise.resolve({ rows: [] });
  });

  const result = await service.createAttempt(
    actor,
    propertyId,
    residentId,
    { invoice_ids: [invoiceId], channel: 'whatsapp_manual', outcome_status: 'external_opened' },
    'attempt-key-2',
  );

  assert.equal(result.action?.channel, 'whatsapp_manual');
  assert.match(String(result.action?.url ?? ''), /^https:\/\/wa\.me\/6281234567890\?text=/);
});

void test('W08C rejects channel/status combinations that cannot be audited', async () => {
  const service = createService(() => Promise.resolve({ rows: [] }));
  await assert.rejects(
    service.createAttempt(
      actor,
      propertyId,
      residentId,
      { invoice_ids: [invoiceId], channel: 'manual', outcome_status: 'external_opened' },
      'attempt-key-3',
    ),
    (error: unknown) =>
      (error as { response?: { code?: unknown } }).response?.code ===
      'REMINDER_ATTEMPT_CHANNEL_INVALID',
  );
});

void test('W08C idempotency replay returns the stored response without creating another attempt', async () => {
  const stored = { attempt: { id: '77777777-7777-4777-8777-777777777777' }, preview, action: null };
  let inserts = 0;
  const service = createService((sql) => {
    if (sql.includes('FROM idempotency_commands')) {
      return Promise.resolve({
        rows: [
          {
            request_fingerprint: JSON.stringify({
              residentId,
              invoice_ids: [invoiceId],
              channel: 'manual',
              outcome_status: 'previewed',
            }),
            response_body: stored,
          },
        ],
      });
    }
    if (sql.includes('INSERT INTO reminder_attempts')) inserts += 1;
    return Promise.resolve({ rows: [] });
  });

  const result = await service.createAttempt(
    actor,
    propertyId,
    residentId,
    { invoice_ids: [invoiceId], channel: 'manual', outcome_status: 'previewed' },
    'attempt-key-4',
  );

  assert.deepEqual(result, stored);
  assert.equal(inserts, 0);
});

void test('W08C archive updates archived_at and never deletes history', async () => {
  const statements: string[] = [];
  const service = createService((sql) => {
    statements.push(sql);
    if (sql.includes('UPDATE reminder_attempts'))
      return Promise.resolve({ rows: [{ ...row(), archived_at: new Date() }] });
    return Promise.resolve({ rows: [] });
  });

  const result = await service.archive(
    actor,
    propertyId,
    '66666666-6666-4666-8666-666666666666',
    'archive-key-1',
  );

  assert.ok(result.attempt.archived_at);
  assert.ok(statements.some((sql) => sql.includes('UPDATE reminder_attempts')));
  assert.ok(!statements.some((sql) => /DELETE\s+FROM\s+reminder_attempts/i.test(sql)));
});

void test('W08C list excludes archived attempts by default and returns pagination metadata', async () => {
  const statements: string[] = [];
  const service = createService((sql) => {
    statements.push(sql);
    if (sql.includes('count(*)')) return Promise.resolve({ rows: [{ total: '1' }] });
    return Promise.resolve({ rows: [row()] });
  });

  const result = await service.list(actor, {
    property_id: propertyId,
    limit: 10,
    offset: 0,
  });
  assert.equal(result.meta.total, 1);
  assert.ok(statements.some((sql) => sql.includes('archived_at IS NULL')));
});
