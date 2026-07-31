import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { CommitOnboardingDto } from '../../src/modules/resident/dto/commit-onboarding.dto';
import { OnboardingController } from '../../src/modules/resident/onboarding.controller';
import { LeaseActivationController } from '../../src/modules/lease/lease-activation.controller';
import { CreatePublicBookingLeadDto } from '../../src/modules/booking-lead/dto/create-public-booking-lead.dto';
import { calculateOnboardingCommercial } from '../../src/modules/resident/types/onboarding.types';
import { OnboardingService } from '../../src/modules/resident/onboarding.service';
import { LeaseActivationService } from '../../src/modules/lease/lease-activation.service';

const root = resolve(__dirname, '../..');
const migration = readFileSync(
  resolve(
    root,
    'src/infrastructure/database/migrations/026_resident_onboarding_lease_activation.sql',
  ),
  'utf8',
);

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_ID = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = '44444444-4444-4444-8444-444444444444';
const COMMITMENT_ID = '55555555-5555-4555-8555-555555555555';
const LEASE_ID = '66666666-6666-4666-8666-666666666666';
const KOST_TYPE_ID = '77777777-7777-4777-8777-777777777777';
const OCCUPANCY_ID = '88888888-8888-4888-8888-888888888888';
const IDEMPOTENCY_KEY = 'w05-idempotency-key-0001';

const actor = {
  id: ACTOR_ID,
  roles: ['admin'],
  permissions: ['resident.manage', 'lease.manage'],
  propertyIds: [PROPERTY_ID],
};

const onboardingDto = {
  property_id: PROPERTY_ID,
  room_id: ROOM_ID,
  visitor_name: 'Resident',
  visitor_phone: '081111111111',
  gender: 'female' as const,
  start_date: '2026-08-01',
  term_months: 12,
  billing_cycle: 'monthly' as const,
  payment_plan_type: 'two_month_installments' as const,
  accepted_terms_version: 'W05-v1',
  dp_verified_amount: 5_400_000,
  security_deposit_funded_amount: 1_800_000,
};

type HarnessOptions = {
  auditFailure?: Error;
  occupancyRows?: string[];
  leaseRows?: string[];
  roomOverrides?: Record<string, unknown>;
  replayFingerprint?: string;
};

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createOnboardingHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalizedSql(sql);
      queries.push({ sql: normalized, params });
      if (/pg_advisory_xact_lock/.test(normalized)) return { rows: [{}], rowCount: 1 };
      if (/INSERT INTO idempotency_commands/.test(normalized))
        return options.replayFingerprint === undefined
          ? { rows: [{ id: 'command-id' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      if (/FROM idempotency_commands/.test(normalized))
        return {
          rows: [
            {
              request_fingerprint: options.replayFingerprint,
              command_status: 'succeeded',
              response_body: {
                data: {
                  commitmentId: COMMITMENT_ID,
                  status: 'committed',
                  leaseId: LEASE_ID,
                  leaseStatus: 'awaiting_activation',
                  roomNumber: 'RK-01-01',
                  category: 'rukost',
                  startDate: '2026-08-01',
                  endDate: '2027-07-31',
                  termMonths: 12,
                  billingCycle: 'monthly',
                  paymentPlanType: 'two_month_installments',
                  contractRentAmount: 21_600_000,
                  dpRequiredAmount: 5_400_000,
                  securityDepositRequiredAmount: 1_800_000,
                  temporaryPassword: null,
                },
              },
            },
          ],
          rowCount: 1,
        };
      if (/SELECT id FROM properties/.test(normalized))
        return { rows: [{ id: PROPERTY_ID }], rowCount: 1 };
      if (/FROM booking_lead_holds/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/FROM rooms r/.test(normalized))
        return {
          rows: [
            {
              id: ROOM_ID,
              property_id: PROPERTY_ID,
              room_number: 'RK-01-01',
              category: 'rukost',
              room_category: 'rukost',
              gender_policy: 'female',
              room_status: 'vacant',
              building_code: 'RK-01',
              building_property_id: PROPERTY_ID,
              building_category: 'rukost',
              building_gender_policy: 'female',
              floor_code: '01',
              kost_type_id: KOST_TYPE_ID,
              kost_type_name: 'Rumah Kost',
              kost_type_property_id: PROPERTY_ID,
              kost_type_category: 'rukost',
              kost_type_status: 'active',
              kost_type_deleted_at: null,
              monthly_price: 1_800_000,
              yearly_price: 21_600_000,
              security_deposit_amount: 1_800_000,
              ...options.roomOverrides,
            },
          ],
          rowCount: 1,
        };
      if (/FROM occupancies/.test(normalized))
        return {
          rows: (options.occupancyRows ?? []).map((id) => ({ id })),
          rowCount: options.occupancyRows?.length ?? 0,
        };
      if (/FROM leases/.test(normalized) && /lease_status IN/.test(normalized))
        return {
          rows: (options.leaseRows ?? []).map((id) => ({ id })),
          rowCount: options.leaseRows?.length ?? 0,
        };
      if (/INSERT INTO residents/.test(normalized))
        return { rows: [{ id: RESIDENT_ID }], rowCount: 1 };
      if (/INSERT INTO onboarding_commitments/.test(normalized))
        return { rows: [{ id: COMMITMENT_ID }], rowCount: 1 };
      if (/INSERT INTO leases/.test(normalized)) return { rows: [{ id: LEASE_ID }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const database = {
    transaction: async (operation: (transactionClient: typeof client) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await operation(client);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      } finally {
        events.push('release');
      }
    },
  };
  const service = new OnboardingService(
    database as never,
    {
      assertCanReadProperty: async () => {
        events.push('authorized');
      },
    } as never,
    {
      provisionInTransaction: async (transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        events.push('account');
        return { temporaryPassword: 'transient-only' };
      },
    } as never,
    {
      write: async (_entry: unknown, transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        events.push('audit');
        if (options.auditFailure) throw options.auditFailure;
      },
    } as never,
  );
  return { client, events, queries, service };
}

function activationLease(overrides: Record<string, unknown> = {}) {
  return {
    id: LEASE_ID,
    property_id: PROPERTY_ID,
    resident_id: RESIDENT_ID,
    room_id: ROOM_ID,
    lease_status: 'awaiting_activation',
    start_date: '2026-08-01',
    end_date: '2027-07-31',
    onboarding_commitment_id: COMMITMENT_ID,
    room_status: 'vacant',
    room_number: 'RK-01-01',
    room_property_id: PROPERTY_ID,
    room_category: 'rukost',
    room_gender_policy: 'female',
    building_property_id: PROPERTY_ID,
    building_category: 'rukost',
    building_gender_policy: 'female',
    kost_type_property_id: PROPERTY_ID,
    kost_type_category: 'rukost',
    kost_type_status: 'active',
    kost_type_deleted_at: null,
    resident_property_id: PROPERTY_ID,
    resident_gender: 'female',
    commitment_id: COMMITMENT_ID,
    commitment_property_id: PROPERTY_ID,
    commitment_resident_id: RESIDENT_ID,
    commitment_room_id: ROOM_ID,
    commitment_lease_id: LEASE_ID,
    commitment_category: 'rukost',
    commitment_gender: 'female',
    commitment_status: 'committed',
    ...overrides,
  };
}

function createActivationHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalizedSql(sql);
      queries.push({ sql: normalized, params });
      if (/pg_advisory_xact_lock/.test(normalized)) return { rows: [{}], rowCount: 1 };
      if (/INSERT INTO idempotency_commands/.test(normalized))
        return options.replayFingerprint === undefined
          ? { rows: [{ id: 'command-id' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      if (/FROM idempotency_commands/.test(normalized))
        return {
          rows: [
            {
              request_fingerprint: options.replayFingerprint,
              command_status: 'succeeded',
              response_body: {
                data: {
                  leaseId: LEASE_ID,
                  leaseStatus: 'active',
                  occupancyStatus: 'active',
                  roomNumber: 'RK-01-01',
                },
              },
            },
          ],
          rowCount: 1,
        };
      if (/FROM leases l/.test(normalized))
        return { rows: [activationLease(options.roomOverrides)], rowCount: 1 };
      if (/FROM booking_lead_holds/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/FROM occupancies/.test(normalized))
        return {
          rows: (options.occupancyRows ?? []).map((id) => ({ id })),
          rowCount: options.occupancyRows?.length ?? 0,
        };
      if (/FROM leases/.test(normalized) && /lease_status='active'/.test(normalized))
        return {
          rows: (options.leaseRows ?? []).map((id) => ({ id })),
          rowCount: options.leaseRows?.length ?? 0,
        };
      if (/INSERT INTO occupancies/.test(normalized))
        return { rows: [{ id: OCCUPANCY_ID }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const database = {
    transaction: async (operation: (transactionClient: typeof client) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await operation(client);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      } finally {
        events.push('release');
      }
    },
  };
  const service = new LeaseActivationService(
    database as never,
    {
      assertCanReadProperty: async () => {
        events.push('authorized');
      },
    } as never,
    {
      write: async (_entry: unknown, transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        events.push('audit');
        if (options.auditFailure) throw options.auditFailure;
      },
    } as never,
  );
  return { client, events, queries, service };
}

test('W05 migration is additive, manifest-bound, and creates separate commitment/installment authority', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS onboarding_commitments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS lease_installments/);
  assert.match(migration, /ALTER COLUMN occupancy_id DROP NOT NULL/);
  assert.match(migration, /booking_leads.*ADD COLUMN IF NOT EXISTS resident_id/s);
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '026_resident_onboarding_lease_activation.sql',
  );
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  assert.doesNotMatch(migration, /payment_gateway|midtrans|provider/i);
});

test('onboarding DTO rejects identity injection and preserves explicit commercial fields', async () => {
  const valid = {
    property_id: '11111111-1111-4111-8111-111111111111',
    visitor_name: 'Resident',
    gender: 'female',
    start_date: '2026-08-01',
    term_months: 12,
    billing_cycle: 'monthly',
    payment_plan_type: 'two_month_installments',
    accepted_terms_version: 'W05-v1',
    dp_verified_amount: 100,
    security_deposit_funded_amount: 100,
  };
  assert.equal(
    (
      await validate(plainToInstance(CommitOnboardingDto, valid), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length,
    0,
  );
  for (const input of [
    { ...valid, user_id: 'x' },
    { ...valid, term_months: 6 },
    { ...valid, gender: 'other' },
    { ...valid, contract_rent_amount: 1 },
  ]) {
    assert.ok(
      (
        await validate(plainToInstance(CommitOnboardingDto, input), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length > 0,
    );
  }
});

test('commercial calculation keeps DP and one-month deposit separate and public lead cannot inject room', async () => {
  assert.deepEqual(calculateOnboardingCommercial(1_800_000, 21_600_000, 'yearly', 12), {
    contractRent: 21_600_000,
    dpRequired: 5_400_000,
    depositRequired: 1_800_000,
  });
  assert.throws(() => calculateOnboardingCommercial(1_800_000, 21_600_000, 'monthly', 6));
  const publicLead = plainToInstance(CreatePublicBookingLeadDto, {
    category: 'rukost',
    gender: 'female',
    visitorName: 'Resident',
    visitorEmail: 'resident@example.test',
    visitorPhone: '081111111111',
    visitorUniversity: 'Universitas Demo',
    consent: true,
    room_id: '11111111-1111-4111-8111-111111111111',
  });
  assert.ok(
    (
      await validate(publicLead, {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).some((error) => error.property === 'room_id'),
  );
});

test('live endpoints retain manager/admin roles and separate onboarding from activation', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OnboardingController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, OnboardingController), ['resident.manage']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaseActivationController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, LeaseActivationController), [
    'lease.manage',
  ]);
});

test('authorization completes before transaction lookup for onboarding and activation', async () => {
  const sentinel = new Error('authorization denied');
  let onboardingTransaction = false;
  const onboarding = new OnboardingService(
    {
      transaction: async () => {
        onboardingTransaction = true;
      },
    } as never,
    { assertCanReadProperty: async () => Promise.reject(sentinel) } as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(
    onboarding.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {}),
    sentinel,
  );
  assert.equal(onboardingTransaction, false);

  let activationTransaction = false;
  const activation = new LeaseActivationService(
    {
      transaction: async () => {
        activationTransaction = true;
      },
    } as never,
    { assertCanReadProperty: async () => Promise.reject(sentinel) } as never,
    {} as never,
  );
  await assert.rejects(
    activation.activate(
      actor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID },
      IDEMPOTENCY_KEY,
      {},
    ),
    sentinel,
  );
  assert.equal(activationTransaction, false);
});

test('onboarding commits with one transaction client and does not create occupancy or occupy room', async () => {
  const harness = createOnboardingHarness();
  const response = await harness.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {});
  assert.equal(response.leaseStatus, 'awaiting_activation');
  assert.equal(response.temporaryPassword, 'transient-only');
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'account', 'audit', 'commit', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'account', 'audit', 'commit', 'release'],
  );
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO occupancies|UPDATE rooms/.test(sql)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /UPDATE idempotency_commands/.test(sql)),
    true,
  );
});

test('onboarding replay returns no credential and mismatched key reuse fails before domain lookup', async () => {
  const fingerprint = createHash('sha256').update(JSON.stringify(onboardingDto)).digest('hex');
  const replay = createOnboardingHarness({ replayFingerprint: fingerprint });
  const response = await replay.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {});
  assert.equal(response.temporaryPassword, null);
  assert.equal(replay.events.includes('account'), false);
  assert.equal(replay.events.includes('audit'), false);
  assert.equal(
    replay.queries.some(({ sql }) => /FROM rooms r/.test(sql)),
    false,
  );

  const mismatch = createOnboardingHarness({ replayFingerprint: 'different-fingerprint' });
  await assert.rejects(
    mismatch.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'IDEMPOTENCY_KEY_REUSED',
  );
  assert.equal(
    mismatch.queries.some(({ sql }) => /FROM rooms r/.test(sql)),
    false,
  );
});

test('onboarding lifecycle is zero-continue, one-conflict, and multiple-fail-closed', async () => {
  const one = createOnboardingHarness({ occupancyRows: [OCCUPANCY_ID] });
  await assert.rejects(
    one.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'ROOM_LIFECYCLE_CONFLICT',
  );
  assert.equal(
    one.queries.some(({ sql }) => /INSERT INTO residents/.test(sql)),
    false,
  );

  const multiple = createOnboardingHarness({
    leaseRows: [LEASE_ID, '99999999-9999-4999-8999-999999999999'],
  });
  await assert.rejects(
    multiple.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'ROOM_LIFECYCLE_AMBIGUOUS',
  );
  assert.equal(
    multiple.queries.some(({ sql }) => /INSERT INTO residents/.test(sql)),
    false,
  );
});

test('onboarding rejects a mismatched room/building/kost-type tuple before writes', async () => {
  const harness = createOnboardingHarness({ roomOverrides: { building_property_id: ACTOR_ID } });
  await assert.rejects(
    harness.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'ROOM_COMMERCIAL_AUTHORITY_MISMATCH',
  );
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO residents/.test(sql)),
    false,
  );
});

test('onboarding audit failure rolls back without outbox or idempotency completion', async () => {
  const sentinel = new Error('audit failed');
  const harness = createOnboardingHarness({ auditFailure: sentinel });
  await assert.rejects(
    harness.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {}),
    sentinel,
  );
  assert.deepEqual(harness.events.slice(-3), ['audit', 'rollback', 'release']);
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO business_events/.test(sql)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /UPDATE idempotency_commands/.test(sql)),
    false,
  );
});

test('activation rechecks the full tuple and creates occupancy only after all locks pass', async () => {
  const harness = createActivationHarness();
  const response = await harness.service.activate(
    actor as never,
    LEASE_ID,
    { property_id: PROPERTY_ID },
    IDEMPOTENCY_KEY,
    {},
  );
  assert.equal(response.data.leaseStatus, 'active');
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'audit', 'commit', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'audit', 'commit', 'release'],
  );
  const lockOrder = harness.queries
    .map(({ sql }) => {
      if (/FROM leases l/.test(sql)) return 'tuple';
      if (/FROM booking_lead_holds/.test(sql)) return 'hold';
      if (/FROM occupancies/.test(sql)) return 'occupancy';
      if (/FROM leases/.test(sql) && /lease_status='active'/.test(sql)) return 'lease';
      if (/INSERT INTO occupancies/.test(sql)) return 'mutation';
      return null;
    })
    .filter(Boolean);
  assert.deepEqual(lockOrder, ['tuple', 'hold', 'occupancy', 'lease', 'mutation']);
});

test('activation replay is exact and performs no tuple lookup or lifecycle mutation', async () => {
  const dto = { property_id: PROPERTY_ID };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ leaseId: LEASE_ID, dto }))
    .digest('hex');
  const harness = createActivationHarness({ replayFingerprint: fingerprint });
  const response = await harness.service.activate(
    actor as never,
    LEASE_ID,
    dto,
    IDEMPOTENCY_KEY,
    {},
  );
  assert.equal(response.data.leaseStatus, 'active');
  assert.equal(harness.events.includes('audit'), false);
  assert.equal(
    harness.queries.some(({ sql }) => /FROM leases l/.test(sql)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO occupancies/.test(sql)),
    false,
  );
});

test('activation rejects tuple mismatch and lifecycle ambiguity before occupancy mutation', async () => {
  const tupleMismatch = createActivationHarness({
    roomOverrides: { commitment_room_id: ACTOR_ID },
  });
  await assert.rejects(
    tupleMismatch.service.activate(
      actor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID },
      IDEMPOTENCY_KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'LEASE_ACTIVATION_AUTHORITY_MISMATCH',
  );
  assert.equal(
    tupleMismatch.queries.some(({ sql }) => /INSERT INTO occupancies/.test(sql)),
    false,
  );

  const ambiguous = createActivationHarness({
    occupancyRows: [OCCUPANCY_ID, '99999999-9999-4999-8999-999999999999'],
  });
  await assert.rejects(
    ambiguous.service.activate(
      actor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID },
      IDEMPOTENCY_KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'RESIDENT_LIFECYCLE_AMBIGUOUS',
  );
  assert.equal(
    ambiguous.queries.some(({ sql }) => /INSERT INTO occupancies/.test(sql)),
    false,
  );
});

test('activation rejects exactly one active occupancy before every domain write', async () => {
  const harness = createActivationHarness({ occupancyRows: [OCCUPANCY_ID] });
  await assert.rejects(
    harness.service.activate(
      actor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID },
      IDEMPOTENCY_KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'RESIDENT_LIFECYCLE_CONFLICT',
  );
  assert.deepEqual(harness.events, ['authorized', 'begin', 'rollback', 'release']);
  assert.equal(harness.events.filter((event) => event === 'release').length, 1);
  assert.equal(harness.events.includes('commit'), false);
  assert.equal(harness.events.includes('audit'), false);
  assert.equal(
    harness.queries.some(({ sql }) =>
      /INSERT INTO occupancies|UPDATE rooms|INSERT INTO occupancy_history|INSERT INTO lease_history|INSERT INTO business_events|UPDATE idempotency_commands/.test(
        sql,
      ),
    ),
    false,
  );
});

test('activation rejects exactly one other active lease before every domain write', async () => {
  const harness = createActivationHarness({
    leaseRows: ['99999999-9999-4999-8999-999999999999'],
  });
  await assert.rejects(
    harness.service.activate(
      actor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID },
      IDEMPOTENCY_KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'RESIDENT_LIFECYCLE_CONFLICT',
  );
  assert.deepEqual(harness.events, ['authorized', 'begin', 'rollback', 'release']);
  assert.equal(harness.events.filter((event) => event === 'release').length, 1);
  assert.equal(harness.events.includes('commit'), false);
  assert.equal(harness.events.includes('audit'), false);
  assert.equal(
    harness.queries.some(({ sql }) =>
      /INSERT INTO occupancies|UPDATE rooms|INSERT INTO occupancy_history|INSERT INTO lease_history|INSERT INTO business_events|UPDATE idempotency_commands/.test(
        sql,
      ),
    ),
    false,
  );
});

test('activation audit failure rolls back without outbox or idempotency completion', async () => {
  const sentinel = new Error('activation audit failed');
  const harness = createActivationHarness({ auditFailure: sentinel });
  await assert.rejects(
    harness.service.activate(
      actor as never,
      LEASE_ID,
      { property_id: PROPERTY_ID },
      IDEMPOTENCY_KEY,
      {},
    ),
    sentinel,
  );
  assert.deepEqual(harness.events.slice(-3), ['audit', 'rollback', 'release']);
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO business_events/.test(sql)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /UPDATE idempotency_commands/.test(sql)),
    false,
  );
});

async function reserveLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return port;
}

void test(
  'migration 026 executes with normal PostgreSQL parsing, convergent replay, and rollback',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w05-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w05-rollback-'));
    const replayPort = await reserveLocalPort();
    let rollbackPort = await reserveLocalPort();
    while (rollbackPort === replayPort) rollbackPort = await reserveLocalPort();
    const started = new Set<string>();
    const executable = (name: string) =>
      join(bin, process.platform === 'win32' ? `${name}.exe` : name);
    const initialize = (directory: string) => {
      const result = spawnSync(
        executable('initdb'),
        ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { stdio: 'ignore', windowsHide: true },
      );
      assert.equal(result.status, 0, 'disposable PostgreSQL initialization failed');
    };
    const start = (directory: string, port: number) => {
      const result = spawnSync(
        executable('pg_ctl'),
        [
          '-D',
          directory,
          '-o',
          `-p ${port} -h 127.0.0.1`,
          '-l',
          join(directory, 'server.log'),
          '-w',
          'start',
        ],
        { stdio: 'ignore', windowsHide: true },
      );
      assert.equal(result.status, 0, 'disposable PostgreSQL start failed');
      started.add(directory);
    };
    const run = (port: number, sql: string) =>
      spawnSync(
        executable('psql'),
        [
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-h',
          '127.0.0.1',
          '-p',
          String(port),
          '-U',
          'postgres',
          '-d',
          'postgres',
        ],
        {
          input: sql,
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    const stop = (directory: string) => {
      if (!started.has(directory)) return;
      spawnSync(executable('pg_ctl'), ['-D', directory, '-m', 'immediate', '-w', 'stop'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      started.delete(directory);
    };
    const prelude = `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE properties (id UUID PRIMARY KEY);
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE residents (
        id UUID PRIMARY KEY,
        property_id UUID NOT NULL,
        resident_status TEXT NOT NULL,
        CONSTRAINT residents_status_check CHECK (resident_status IN ('draft','active','inactive','archived'))
      );
      CREATE TABLE rooms (id UUID PRIMARY KEY, property_id UUID NOT NULL);
      CREATE TABLE booking_leads (
        id UUID PRIMARY KEY,
        property_id UUID NOT NULL,
        status TEXT NOT NULL,
        CONSTRAINT booking_leads_status_check CHECK (
          status IN ('new','contacted','visit_scheduled','negotiating','awaiting_dp','converted','rejected','expired','cancelled')
        )
      );
      CREATE TABLE leases (
        id UUID PRIMARY KEY,
        property_id UUID NOT NULL,
        resident_id UUID NOT NULL,
        room_id UUID NOT NULL,
        occupancy_id UUID NOT NULL,
        kost_type_id UUID,
        lease_status TEXT NOT NULL,
        CONSTRAINT leases_status_check CHECK (
          lease_status IN ('draft','active','ended','completed','cancelled','transferred')
        )
      );
      CREATE TABLE booking_lead_holds (
        id UUID PRIMARY KEY,
        property_id UUID NOT NULL,
        booking_lead_id UUID NOT NULL,
        room_id UUID NOT NULL,
        hold_status TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE invoices (id UUID PRIMARY KEY);
    `;
    const exactProof = `
      DO $proof$
      DECLARE
        onboarding_columns TEXT[];
        installment_columns TEXT[];
        onboarding_constraints TEXT[];
        installment_constraints TEXT[];
        w05_indexes TEXT[];
      BEGIN
        SELECT array_agg(column_name::text ORDER BY ordinal_position)
          INTO onboarding_columns
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='onboarding_commitments';
        IF onboarding_columns <> ARRAY[
          'id','property_id','booking_lead_id','hold_id','resident_id','lease_id','room_id',
          'category','gender','status','term_months','billing_cycle','payment_plan_type',
          'start_date','end_date','contract_rent_amount','dp_required_amount',
          'dp_verified_amount','security_deposit_required_amount',
          'security_deposit_funded_amount','accepted_terms_version','signed_at','notes',
          'created_by_user_id','committed_at','completed_at','cancelled_at','cancel_reason',
          'created_at','updated_at'
        ]::TEXT[] THEN RAISE EXCEPTION 'W05_ONBOARDING_COLUMNS_INVALID'; END IF;

        SELECT array_agg(column_name::text ORDER BY ordinal_position)
          INTO installment_columns
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='lease_installments';
        IF installment_columns <> ARRAY[
          'id','property_id','lease_id','sequence_number','coverage_start_date',
          'coverage_end_date','due_date','scheduled_amount','invoice_id',
          'installment_status','created_at'
        ]::TEXT[] THEN RAISE EXCEPTION 'W05_INSTALLMENT_COLUMNS_INVALID'; END IF;

        SELECT array_agg(conname::text ORDER BY conname)
          INTO onboarding_constraints
          FROM pg_constraint
         WHERE conrelid='onboarding_commitments'::regclass;
        IF onboarding_constraints <> ARRAY[
          'onboarding_commitments_amounts_check','onboarding_commitments_booking_lead_id_fkey',
          'onboarding_commitments_created_by_user_id_fkey','onboarding_commitments_cycle_check',
          'onboarding_commitments_dates_check','onboarding_commitments_hold_id_fkey',
          'onboarding_commitments_lease_id_fkey','onboarding_commitments_pkey',
          'onboarding_commitments_plan_check','onboarding_commitments_property_id_fkey',
          'onboarding_commitments_resident_id_fkey','onboarding_commitments_room_id_fkey',
          'onboarding_commitments_status_check','onboarding_commitments_term_check',
          'onboarding_commitments_terms_check'
        ]::TEXT[] THEN RAISE EXCEPTION 'W05_ONBOARDING_CONSTRAINTS_INVALID'; END IF;

        SELECT array_agg(conname::text ORDER BY conname)
          INTO installment_constraints
          FROM pg_constraint
         WHERE conrelid='lease_installments'::regclass;
        IF installment_constraints <> ARRAY[
          'lease_installments_amount_check','lease_installments_dates_check',
          'lease_installments_invoice_id_fkey','lease_installments_lease_id_fkey',
          'lease_installments_period_unique','lease_installments_pkey',
          'lease_installments_property_id_fkey','lease_installments_sequence_check',
          'lease_installments_sequence_unique','lease_installments_status_check'
        ]::TEXT[] THEN RAISE EXCEPTION 'W05_INSTALLMENT_CONSTRAINTS_INVALID'; END IF;

        SELECT array_agg(indexname::text ORDER BY indexname)
          INTO w05_indexes
          FROM pg_indexes
         WHERE schemaname='public'
           AND tablename IN ('onboarding_commitments','lease_installments');
        IF w05_indexes <> ARRAY[
          'idx_lease_installments_property_due','idx_onboarding_commitments_property_status',
          'idx_onboarding_commitments_resident','lease_installments_period_unique',
          'lease_installments_pkey','lease_installments_sequence_unique',
          'onboarding_commitments_pkey','uq_onboarding_commitments_active_lead',
          'uq_onboarding_commitments_active_lease','uq_onboarding_commitments_active_room'
        ]::TEXT[] THEN RAISE EXCEPTION 'W05_INDEXES_INVALID'; END IF;

        IF (SELECT is_nullable FROM information_schema.columns
             WHERE table_name='leases' AND column_name='occupancy_id') <> 'YES'
           OR NOT EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conname='leases_onboarding_commitment_fk'
                AND conrelid='leases'::regclass
           )
           OR NOT EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conname='booking_leads_onboarding_commitment_fk'
                AND conrelid='booking_leads'::regclass
           )
        THEN RAISE EXCEPTION 'W05_LIFECYCLE_AUTHORITY_INVALID'; END IF;
      END
      $proof$;
    `;
    try {
      initialize(replayDirectory);
      start(replayDirectory, replayPort);
      const replay = run(
        replayPort,
        `${prelude}
         ${migration}
         ${exactProof}
         CREATE FUNCTION reject_w05_replay_dml() RETURNS trigger LANGUAGE plpgsql AS
           $block$ BEGIN RAISE EXCEPTION 'W05_REPLAY_DML_BLOCKED'; END $block$;
         CREATE TRIGGER w05_no_booking_lead_dml BEFORE INSERT OR UPDATE OR DELETE ON booking_leads
           FOR EACH STATEMENT EXECUTE FUNCTION reject_w05_replay_dml();
         CREATE TRIGGER w05_no_lease_dml BEFORE INSERT OR UPDATE OR DELETE ON leases
           FOR EACH STATEMENT EXECUTE FUNCTION reject_w05_replay_dml();
         CREATE TRIGGER w05_no_hold_dml BEFORE INSERT OR UPDATE OR DELETE ON booking_lead_holds
           FOR EACH STATEMENT EXECUTE FUNCTION reject_w05_replay_dml();
         CREATE TRIGGER w05_no_resident_dml BEFORE INSERT OR UPDATE OR DELETE ON residents
           FOR EACH STATEMENT EXECUTE FUNCTION reject_w05_replay_dml();
         CREATE TRIGGER w05_no_commitment_dml BEFORE INSERT OR UPDATE OR DELETE ON onboarding_commitments
           FOR EACH STATEMENT EXECUTE FUNCTION reject_w05_replay_dml();
         CREATE TRIGGER w05_no_installment_dml BEFORE INSERT OR UPDATE OR DELETE ON lease_installments
           FOR EACH STATEMENT EXECUTE FUNCTION reject_w05_replay_dml();
         ${migration}
         ${exactProof}
         DO $rows$
         BEGIN
           IF (SELECT count(*) FROM onboarding_commitments) <> 0
              OR (SELECT count(*) FROM lease_installments) <> 0
           THEN RAISE EXCEPTION 'W05_REPLAY_WROTE_ROWS'; END IF;
         END
         $rows$;`,
      );
      assert.equal(replay.status, 0, 'disposable first-apply/replay proof failed');

      initialize(rollbackDirectory);
      start(rollbackDirectory, rollbackPort);
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        `DO $$ BEGIN RAISE EXCEPTION 'W05_SYNTHETIC_ROLLBACK'; END $$; COMMIT;`,
      );
      assert.notEqual(failedMigration, migration);
      const failed = run(rollbackPort, `${prelude}${failedMigration}`);
      assert.notEqual(failed.status, 0, 'synthetic migration failure was not triggered');
      const rollbackProbe = run(
        rollbackPort,
        `DO $rollback$
         BEGIN
           IF to_regclass('public.onboarding_commitments') IS NOT NULL
              OR to_regclass('public.lease_installments') IS NOT NULL
              OR EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND (
                     (table_name='booking_leads' AND column_name IN (
                       'resident_id','lease_id','onboarding_commitment_id','leased_at'
                     ))
                     OR (table_name='leases' AND column_name IN (
                       'booking_lead_id','onboarding_commitment_id','term_months',
                       'payment_plan_type','contract_rent_amount','dp_required_amount',
                       'security_deposit_required_amount','signed_at','activated_at'
                     ))
                     OR (table_name='booking_lead_holds' AND column_name IN (
                       'onboarding_commitment_id','release_reason'
                     ))
                   )
              )
              OR (SELECT is_nullable FROM information_schema.columns
                   WHERE table_name='leases' AND column_name='occupancy_id') <> 'NO'
           THEN RAISE EXCEPTION 'W05_MIGRATION_ROLLBACK_INCOMPLETE'; END IF;
         END
         $rollback$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'disposable rollback proof failed');
    } finally {
      stop(replayDirectory);
      stop(rollbackDirectory);
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
