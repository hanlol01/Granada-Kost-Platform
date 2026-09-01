import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { BookingLeadController } from '../../src/modules/booking-lead/booking-lead.controller';
import { BookingLeadService } from '../../src/modules/booking-lead/booking-lead.service';
import { BookingLeadRepository } from '../../src/modules/booking-lead/repositories/booking-lead.repository';
import type { BookingLeadRecord } from '../../src/modules/booking-lead/types/booking-lead.types';

const root = join(import.meta.dirname, '..', '..');
const source = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');
const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

const lead = (status: BookingLeadRecord['status'] = 'new'): BookingLeadRecord => ({
  id: LEAD_ID,
  propertyId: PROPERTY_ID,
  roomId: null,
  roomNumber: null,
  category: 'rukost',
  gender: 'female',
  buildingCode: null,
  floorCode: null,
  publicGroupKey: 'rukost-female',
  visitorName: 'Redacted',
  visitorEmail: null,
  visitorPhone: '6280000000000',
  visitorAddress: null,
  visitorUniversity: null,
  visitorMessage: null,
  preferredMoveInDate: null,
  paymentCommitmentStartDate: null,
  activeLeaseStartDate: null,
  status,
  source: 'public_kamar',
  metadata: null,
  createdByUserId: null,
  createdAt: new Date('2026-07-31T00:00:00.000Z'),
  updatedAt: new Date('2026-07-31T00:00:00.000Z'),
});

test('live controller preserves legacy list while dispatching exact Admin UX V2 envelopes', () => {
  const controller = source('src/modules/booking-lead/booking-lead.controller.ts');
  assert.match(controller, /acceptsAdminUxV2\(accept\)/);
  assert.match(controller, /listAdminLeadPage/);
  assert.match(controller, /v2List\(/);
  assert.match(controller, /listAdminLeads/);
  assert.match(controller, /@Headers\('idempotency-key'\)/);
  assert.match(controller, /@Headers\('accept'\)/);
});

test('repository list is property-aligned, repeatable-read, counted and deterministically ordered', () => {
  const repository = source('src/modules/booking-lead/repositories/booking-lead.repository.ts');
  assert.match(repository, /REPEATABLE READ READ ONLY/);
  assert.match(repository, /COUNT\(\*\)::int AS total/);
  assert.match(repository, /rooms\.property_id = booking_leads\.property_id/);
  assert.match(repository, /active_lease\.property_id = booking_leads\.property_id/);
  assert.match(repository, /payment_commitment\.property_id = booking_leads\.property_id/);
  assert.match(repository, /payment_commitment_start_date/);
  assert.match(repository, /active_lease\.lease_status IN \('awaiting_activation','active'\)/);
  assert.match(repository, /active_lease_start_date/);
  assert.match(repository, /ORDER BY booking_leads\.created_at DESC, booking_leads\.id DESC/);
});

test('status command requires property scope and idempotency before mutation', () => {
  const controller = source('src/modules/booking-lead/booking-lead.controller.ts');
  const service = source('src/modules/booking-lead/booking-lead.service.ts');
  const dto = source('src/modules/booking-lead/dto/update-booking-lead-status.dto.ts');
  assert.match(dto, /property_id/);
  assert.match(controller, /assertCanReadProperty\(user, dto\.property_id\)/);
  assert.match(service, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(service, /claimStatusCommand/);
  assert.match(service, /completeStatusCommand/);
  assert.doesNotMatch(dto, /visit_scheduled|converted/);
});

test('live status controller authorizes property before lead lookup', async () => {
  const calls: string[] = [];
  const controller = new BookingLeadController(
    {
      getForProperty: async () => {
        calls.push('lookup');
        return lead();
      },
      updateStatusCommand: async () => lead('contacted'),
    } as never,
    {
      assertCanReadProperty: async () => {
        calls.push('authorize');
      },
    } as never,
  );

  await controller.updateStatus(
    { id: ACTOR_ID } as never,
    LEAD_ID,
    { property_id: PROPERTY_ID, status: 'contacted' } as never,
    { headers: {}, ip: undefined, correlationId: undefined } as never,
    'stable-key-123456',
    undefined,
  );
  assert.deepEqual(calls, ['authorize', 'lookup']);
});

test('Admin projection remains a strict PII-minimized whitelist', () => {
  const service = source('src/modules/booking-lead/booking-lead.service.ts');
  const response = service.slice(
    service.indexOf('private adminResponse'),
    service.indexOf('private publicAuditSnapshot'),
  );
  assert.doesNotMatch(response, /metadata:|createdByUserId:|consentAt:|visitorEmail:/);
  assert.match(response, /roomNumber/);
  assert.match(response, /publicGroupKey/);
  assert.match(response, /paymentCommitmentStartDate/);
  assert.match(response, /activeLeaseStartDate/);
});

test('missing idempotency fails before transaction, claim, status mutation, or audit', async () => {
  const calls: string[] = [];
  const service = new BookingLeadService(
    {
      transaction: async () => {
        calls.push('transaction');
      },
      claimStatusCommand: async () => calls.push('claim'),
      updateStatusForProperty: async () => calls.push('update'),
    } as never,
    { write: async () => calls.push('audit') } as never,
  );
  await assert.rejects(
    service.updateStatusCommand(lead(), 'contacted', undefined, { actorUserId: ACTOR_ID }),
    (error: unknown) => {
      assert.equal(
        (error as { response?: { code?: string } }).response?.code,
        'IDEMPOTENCY_KEY_REQUIRED',
      );
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

test('status command claims, locks, updates, audits, and completes atomically once', async () => {
  const calls: string[] = [];
  const current = lead();
  const updated = lead('contacted');
  const client = {};
  const service = new BookingLeadService(
    {
      transaction: async (work: (value: unknown) => Promise<unknown>) => {
        calls.push('transaction');
        return work(client);
      },
      claimStatusCommand: async (usedClient: unknown) => {
        assert.equal(usedClient, client);
        calls.push('claim');
        return null;
      },
      findForProperty: async (
        _id: string,
        _propertyId: string,
        usedClient: unknown,
        forUpdate: boolean,
      ) => {
        assert.equal(usedClient, client);
        assert.equal(forUpdate, true);
        calls.push('lock');
        return current;
      },
      updateStatusForProperty: async (usedClient: unknown) => {
        assert.equal(usedClient, client);
        calls.push('update');
        return updated;
      },
      completeStatusCommand: async (usedClient: unknown) => {
        assert.equal(usedClient, client);
        calls.push('complete');
      },
    } as never,
    {
      write: async (_input: unknown, usedClient: unknown) => {
        assert.equal(usedClient, client);
        calls.push('audit');
      },
    } as never,
  );
  const response = await service.updateStatusCommand(current, 'contacted', 'stable-key-123456', {
    actorUserId: ACTOR_ID,
  });
  assert.equal(response.status, 'contacted');
  assert.deepEqual(calls, ['transaction', 'claim', 'lock', 'update', 'audit', 'complete']);
});
test('audit failure rolls back status and idempotency state, then releases once', async () => {
  const events: string[] = [];
  const persisted = { status: 'new', claimed: false };
  const transactional = { status: persisted.status, claimed: persisted.claimed };
  const client = {
    query: async (sql: string) => {
      const command = sql.trim().toUpperCase();
      events.push(command);
      if (command === 'COMMIT') {
        persisted.status = transactional.status;
        persisted.claimed = transactional.claimed;
      }
      if (command === 'ROLLBACK') {
        transactional.status = persisted.status;
        transactional.claimed = persisted.claimed;
      }
      return { rows: [] };
    },
    release: () => events.push('RELEASE'),
  };
  const repository = new BookingLeadRepository({
    client: { connect: async () => client },
  } as never);
  Object.assign(repository, {
    claimStatusCommand: async (usedClient: unknown) => {
      assert.equal(usedClient, client);
      transactional.claimed = true;
      events.push('CLAIM');
      return null;
    },
    findForProperty: async (
      _id: string,
      _propertyId: string,
      usedClient: unknown,
      forUpdate: boolean,
    ) => {
      assert.equal(usedClient, client);
      assert.equal(forUpdate, true);
      events.push('LOCK');
      return lead();
    },
    updateStatusForProperty: async (usedClient: unknown) => {
      assert.equal(usedClient, client);
      transactional.status = 'contacted';
      events.push('UPDATE');
      return lead('contacted');
    },
    completeStatusCommand: async (usedClient: unknown) => {
      assert.equal(usedClient, client);
      events.push('COMPLETE');
    },
  });
  const service = new BookingLeadService(repository, {
    write: async (_input: unknown, usedClient: unknown) => {
      assert.equal(usedClient, client);
      events.push('AUDIT');
      throw new Error('audit failure sentinel');
    },
  } as never);

  await assert.rejects(
    service.updateStatusCommand(lead(), 'contacted', 'stable-key-123456', {
      actorUserId: ACTOR_ID,
    }),
    /audit failure sentinel/,
  );
  assert.equal(persisted.status, 'new');
  assert.equal(persisted.claimed, false);
  assert.equal(events.filter((event) => event === 'ROLLBACK').length, 1);
  assert.equal(events.filter((event) => event === 'RELEASE').length, 1);
  assert.equal(events.includes('COMMIT'), false);
  assert.equal(events.includes('COMPLETE'), false);
});
