import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  notificationEventContent,
  type InboxBusinessEvent,
} from '../../src/modules/notification-events/notification-event-content';
import { NotificationEventProjector } from '../../src/modules/notification-events/notification-event-projector';
import { PropertyOwnerRealizationService } from '../../src/modules/property-owner-management/property-owner-realization.service';
import { writeAccountNotificationEvent } from '../../src/modules/notification-events/account-notification-event';
import { BookingLeadRepository } from '../../src/modules/booking-lead/repositories/booking-lead.repository';
import { ComplaintService } from '../../src/modules/complaint/services/complaint.service';

const property = '11111111-1111-4111-8111-111111111111';
const resource = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const event = (type: string, payload: Record<string, unknown> = {}): InboxBusinessEvent => ({
  id: resource,
  property_id: property,
  event_key: `${type}:${resource}`,
  event_type: type,
  aggregate_type: 'lease',
  aggregate_id: resource,
  payload,
  created_at: new Date('2026-10-06T00:00:00Z'),
});

test('proof received, verified payment and refund preserve their distinct facts', () => {
  assert.match(
    notificationEventContent(event('payment_proof.submitted'))!.body,
    /belum dinyatakan terverifikasi/,
  );
  assert.match(notificationEventContent(event('payment.verified'))!.body, /telah diverifikasi/);
  assert.match(
    notificationEventContent(event('lease.checkout.handover'))!.body,
    /Inspeksi dan penyelesaian keuangan/,
  );
  assert.match(
    notificationEventContent(event('lease.checkout.completed'))!.body,
    /Status tagihan dan refund/,
  );
  assert.doesNotMatch(
    notificationEventContent(event('lease.checkout.refund_settled'))!.body,
    /seluruh check-out selesai/i,
  );
});

test('cash and automatically verified entries reflect the recorded event status', () => {
  assert.equal(
    notificationEventContent(event('payment.recorded', { payment_status: 'verified' }))!.title,
    'Pembayaran diverifikasi',
  );
  assert.equal(
    notificationEventContent(event('payment.recorded', { payment_status: 'pending_confirmation' }))!
      .title,
    'Pembayaran menunggu verifikasi',
  );
});

test('check-in uses its finalized period snapshot and Owner summaries omit the resident period', () => {
  const checkedIn = event('lease.check_in_confirmed', {
    service_period: { startDate: '2026-10-06', endDate: '2027-01-05' },
    resident_name: 'PRIVATE PERSON',
  });
  assert.match(notificationEventContent(checkedIn)!.body, /2026-10-06 sampai 2027-01-05/);
  assert.doesNotMatch(notificationEventContent(checkedIn, true)!.body, /2026-10-06|PRIVATE PERSON/);
  assert.doesNotMatch(
    notificationEventContent(event('lease.activated', { start_date: '2000-01-01' }))!.body,
    /2000-01-01/,
  );
});

test('published realization is grouped; verified transfer states evidence without claiming bank receipt', () => {
  const publication = notificationEventContent(
    event('property_owner.realization.published', {
      period: '2026-09-01',
      room_count: 3,
      entitlement_amount: 4500000,
    }),
    true,
  )!;
  assert.match(publication.body, /3 kamar; Hak Owner Rp4\.500\.000/);
  const transfer = notificationEventContent(
    event('property_owner.transfer.verified', {
      amount: 1000000,
      transferred_at: '2026-10-05T01:00:00Z',
      reference: 'TRF-001',
    }),
    true,
  )!;
  assert.match(transfer.body, /Rp1\.000\.000/);
  assert.match(transfer.body, /TRF-001/);
  assert.doesNotMatch(transfer.body, /telah diterima|sudah masuk|rekening/);
  assert.equal(notificationEventContent(event('unsupported.announcement')), null);
});

test('projection retries emit once and leave business-event status untouched', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const notices: unknown[][] = [];
  let projected = false;
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
      if (sql.includes('FROM business_events event'))
        return { rows: projected ? [] : [event('lease.created')] };
      if (sql.includes('FROM leases lease'))
        return {
          rows: [
            {
              lease_id: resource,
              resident_id: resource,
              room_id: null,
              realization_id: null,
              owner_profile_id: null,
            },
          ],
        };
      if (sql.includes('FROM users account'))
        return { rows: [{ user_id: user, audience: 'admin' }] };
      if (sql.includes('FROM residents resident')) return { rows: [] };
      if (sql.startsWith('INSERT INTO notifications')) {
        notices.push(params);
        return { rows: [{ id: user }] };
      }
      if (sql.startsWith('INSERT INTO notification_event_projections')) projected = true;
      return { rows: [] };
    },
  };
  const projector = new NotificationEventProjector({
    transaction: async (operation: (value: unknown) => unknown) => operation(client),
  } as never);
  assert.equal(await projector.runOnce(), 1);
  assert.equal(await projector.runOnce(), 0);
  assert.equal(notices.length, 1);
  const eventQuery = queries.find((query) => query.sql.includes('FROM business_events event'))!;
  assert.match(eventQuery.sql, /event.created_at>=activation.activated_at/);
  assert.match(eventQuery.sql, /FOR UPDATE OF event SKIP LOCKED/);
  assert.ok(queries.every((query) => !/UPDATE business_events/.test(query.sql)));
  assert.deepEqual(JSON.parse(String(notices[0][6])).event_key, `lease.created:${resource}`);
  assert.equal((notices[0][8] as Date).toISOString(), '2026-10-06T00:00:00.000Z');
});

test('Owner fanout queries active assignments and snapshots safe metadata independently', async () => {
  const queries: string[] = [];
  const notices: unknown[][] = [];
  const ownerEvent = {
    ...event('lease.check_in_confirmed'),
    payload: {
      private_note: 'SECRET',
      service_period: { startDate: '2026-10-06', endDate: '2027-01-05' },
    },
  };
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
      if (sql.includes('FROM business_events event')) return { rows: [ownerEvent] };
      if (sql.includes('FROM leases lease'))
        return {
          rows: [
            {
              lease_id: resource,
              resident_id: resource,
              room_id: resource,
              realization_id: null,
              owner_profile_id: null,
            },
          ],
        };
      if (sql.includes('SELECT number')) return { rows: [{ number: 'A-01' }] };
      if (sql.includes('FROM property_owner_profiles'))
        return { rows: [{ user_id: user, audience: 'owner' }] };
      if (sql.startsWith('INSERT INTO notifications')) {
        notices.push(params);
        return { rows: [{ id: user }] };
      }
      return { rows: [] };
    },
  };
  const projector = new NotificationEventProjector({
    transaction: async (operation: (value: unknown) => unknown) => operation(client),
  } as never);
  await projector.runOnce();
  const ownerSql = queries.find((sql) => sql.includes('FROM property_owner_profiles'))!;
  assert.match(ownerSql, /assignment_status='active'/);
  assert.match(ownerSql, /assignment.created_at<=\$5/);
  assert.doesNotMatch(ownerSql, /effective_from|effective_until/);
  assert.equal(notices.length, 1);
  const metadata = JSON.parse(String(notices[0][6]));
  assert.equal(metadata.resident_id, null);
  assert.equal(metadata.lease_id, null);
  assert.doesNotMatch(JSON.stringify(notices), /SECRET|2027-01-05/);
});

test('internal realization state transitions do not produce Owner notices', async () => {
  let queriedOwners = false;
  const client = {
    query: async (sql: string) => {
      if (sql.includes('FROM business_events event'))
        return {
          rows: [
            {
              ...event('property_owner.realization.state_changed', { status: 'awaiting_transfer' }),
              aggregate_type: 'property_owner_realization',
            },
          ],
        };
      if (sql.includes('FROM property_owner_realizations realization'))
        return {
          rows: [
            {
              lease_id: null,
              resident_id: null,
              room_id: null,
              realization_id: resource,
              owner_profile_id: user,
            },
          ],
        };
      if (sql.includes('FROM property_owner_profiles')) queriedOwners = true;
      return { rows: [] };
    },
  };
  await new NotificationEventProjector({
    transaction: async (operation: (value: unknown) => unknown) => operation(client),
  } as never).runOnce();
  assert.equal(queriedOwners, false);
});

test('publication emits one durable event with totals and no payout credentials', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const service = new PropertyOwnerRealizationService(
    {} as never,
    { write: async () => undefined } as never,
    {} as never,
    {} as never,
  );
  Object.assign(service, {
    command: async (...args: unknown[]) => (args.at(-1) as (client: unknown) => unknown)(client),
    lockRealization: async () => ({
      id: resource,
      property_id: property,
      owner_profile_id: user,
      realization_status: 'realized',
      realization_period: '2026-09-01',
      realization_reference: 'RLS-01',
      room_count: 4,
      realization_total: '6000000',
      payout_account_number: 'SECRET ACCOUNT',
    }),
  });
  await service.publish(
    { id: user } as never,
    resource,
    { property_id: property } as never,
    'stable-idempotency-key',
    {},
  );
  const outbox = queries.filter((query) => query.sql.includes('INSERT INTO business_events'));
  assert.equal(outbox.length, 1);
  const payload = JSON.parse(String(outbox[0].params[7]));
  assert.equal(payload.room_count, 4);
  assert.equal(payload.entitlement_amount, '6000000');
  assert.doesNotMatch(JSON.stringify(payload), /SECRET ACCOUNT/);
  assert.match(String(outbox[0].params[1]), /^property_owner.realization.published:/);
});

test('account events are self-only and helper payload excludes all authentication data', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
      if (sql.includes('FROM business_events event'))
        return { rows: [{ ...event('account.password_changed'), aggregate_type: 'user' }] };
      if (sql.includes('AS target_user_id'))
        return { rows: [{ target_user_id: user, room_id: null }] };
      if (sql.includes("'resident'::text AS audience FROM users"))
        return { rows: [{ user_id: user, audience: 'resident' }] };
      if (sql.startsWith('INSERT INTO notifications')) return { rows: [{ id: user }] };
      return { rows: [] };
    },
  };
  await writeAccountNotificationEvent(
    client as never,
    user,
    'account.password_changed',
    'stable-operation',
  );
  const outbox = queries[0];
  assert.deepEqual(outbox.params, [user, 'account.password_changed', 'stable-operation']);
  assert.doesNotMatch(outbox.sql, /password_hash|token|old_email|new_email/);
  await new NotificationEventProjector({
    transaction: async (operation: (value: unknown) => unknown) => operation(client),
  } as never).runOnce();
  assert.equal(
    queries.filter((query) => query.sql.startsWith('INSERT INTO notifications')).length,
    1,
  );
  assert.ok(queries.every((query) => !query.sql.includes('SELECT DISTINCT account.id')));
});

test('Owner transfers require finance confirmation before their notification event is persisted', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const transferId = '44444444-4444-4444-8444-444444444444';
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('next_owner_realization_receipt_number'))
        return { rows: [{ receipt_number: 'RCP-001' }] };
      if (sql.includes('INSERT INTO property_owner_realization_transfers'))
        return { rows: [{ id: transferId }] };
      return { rows: [] };
    },
  };
  const service = new PropertyOwnerRealizationService(
    {} as never,
    { write: async () => undefined } as never,
    {} as never,
    {} as never,
  );
  Object.assign(service, {
    command: async (...args: unknown[]) => (args.at(-1) as (client: unknown) => unknown)(client),
    lockRealization: async () => ({
      id: resource,
      property_id: property,
      owner_profile_id: user,
      realization_status: 'awaiting_transfer',
      realization_total: '2000000',
      transferred_total: '0',
      realization_period: '2026-09-01',
      realization_reference: 'RLS-01',
    }),
    assertTransferEvidence: () => undefined,
    attachEvidence: async () => undefined,
    receiptSnapshot: async () => ({}),
  });
  const dto = {
    property_id: property,
    amount: 1000000,
    method: 'bank_transfer',
    reference: 'TRF-001',
    transferred_at: '2026-10-06T00:00:00Z',
  };
  await assert.rejects(
    service.recordTransfer({ id: user } as never, resource, dto as never, 'stable-operation', {}),
  );
  assert.equal(
    queries.filter((query) => query.sql.includes('INSERT INTO business_events')).length,
    0,
  );
  await service.recordTransfer(
    { id: user } as never,
    resource,
    {
      ...dto,
      finance_confirmed_by: 'Finance',
      finance_confirmation_channel: 'manual',
      finance_confirmed_at: '2026-10-06T00:00:00Z',
    } as never,
    'stable-operation',
    {},
  );
  const outbox = queries.find((query) => query.sql.includes('INSERT INTO business_events'))!;
  assert.equal(outbox.params[2], 'property_owner.transfer.verified');
  assert.equal(outbox.params[4], transferId);
  assert.equal(JSON.parse(String(outbox.params[7])).amount, 1000000);
  assert.equal(JSON.parse(String(outbox.params[7])).reference, 'TRF-001');
});

test('Admin booking duplicate gate emits no second creation event and outbox commits with the lead', async () => {
  const row = {
    id: resource,
    property_id: property,
    room_id: resource,
    status: 'new',
    source: 'admin_quick_entry',
    visitor_name: 'PRIVATE NAME',
    visitor_phone: 'PRIVATE PHONE',
  };
  let exists = false;
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('FROM booking_leads')) return { rows: exists ? [row] : [] };
      if (sql.includes('INSERT INTO booking_leads')) {
        exists = true;
        return { rows: [row] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const repository = new BookingLeadRepository({
    client: { connect: async () => client },
  } as never);
  const input = {
    propertyId: property,
    roomId: resource,
    category: 'rukost',
    gender: 'male',
    createdByUserId: user,
    visitorPhone: 'PRIVATE PHONE',
  };
  assert.equal((await repository.findOrCreateAdminLead(input as never, 10)).created, true);
  assert.equal((await repository.findOrCreateAdminLead(input as never, 10)).created, false);
  const events = statements.filter((statement) =>
    statement.sql.includes('INSERT INTO business_events'),
  );
  assert.equal(events.length, 1);
  assert.doesNotMatch(String(events[0].params[3]), /PRIVATE/);
  const eventIndex = statements.indexOf(events[0]);
  assert.equal(statements[eventIndex + 1].sql, 'COMMIT');
});

test('a complaint without attachments emits its event inside the creation transaction', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      return { rows: [] };
    },
    release: () => undefined,
  };
  const complaints = {
    create: async (_input: unknown, transaction: unknown) => {
      assert.equal(transaction, client);
      return { id: resource, propertyId: property, roomId: resource, priority: 'high' };
    },
  };
  const histories = {
    record: async (_input: unknown, transaction: unknown) => assert.equal(transaction, client),
  };
  const service = new ComplaintService(
    complaints as never,
    histories as never,
    {} as never,
    {} as never,
    { write: async () => undefined } as never,
    { client: { connect: async () => client } } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  Object.assign(service, {
    assertResidentCreateContext: async () => undefined,
    validateComplaintAttachmentFiles: async () => undefined,
  });
  await service.createComplaint({ fileIds: [] } as never, { actorUserId: user });
  assert.equal(statements[0], 'BEGIN');
  assert.ok(statements[1].includes('INSERT INTO business_events'));
  assert.equal(statements[2], 'COMMIT');
});

test('Owner management fee notice uses the verified payer snapshot and never claims rent settlement', () => {
  const content = notificationEventContent(
    event('payment.verified', {
      payment_purpose: 'management_fee',
      owner_fee_payer: 'owner',
      amount: 300000,
    }),
    true,
  )!;
  assert.match(content.title, /biaya pengelolaan/);
  assert.match(content.body, /Rp300\.000/);
  assert.doesNotMatch(content.body, /sewa lunas|kontrak lunas|bank/);
});
