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
import { W06BillingService } from '../../src/modules/billing/services/w06-billing.service';

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
const KTP_FILE_ID = '99999999-9999-4999-8999-999999999999';
const PAYMENT_EVIDENCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIRST_RENT_INVOICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
  booking_fee_paid_amount: 1_000_000,
  security_deposit_funded_amount: 1_800_000,
  payment_method: 'cash' as const,
  ktp_file_id: KTP_FILE_ID,
};

type HarnessOptions = {
  activationAvailable?: boolean;
  auditFailure?: Error;
  occupancyRows?: string[];
  leaseRows?: string[];
  identityRows?: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    ktp_number: string | null;
  }>;
  roomOverrides?: Record<string, unknown>;
  replayFingerprint?: string;
  expectedBookingFeeAmount?: number;
  expectedInitialRentCredit?: number;
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
                  securityDepositRequiredAmount: 0,
                  initialPayment: {
                    method: 'cash',
                    status: 'verified',
                    dpRecordedAmount: 5_400_000,
                    securityDepositRecordedAmount: 1_800_000,
                    dpVerifiedAmount: 5_400_000,
                    securityDepositVerifiedAmount: 1_800_000,
                    receipts: [],
                  },
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
      if (/FROM residents/.test(normalized) && /lower\(email\)=lower\(\$2\)/.test(normalized))
        return {
          rows: options.identityRows ?? [],
          rowCount: options.identityRows?.length ?? 0,
        };
      if (/FROM files/.test(normalized) && /file_purpose='ktp'/.test(normalized))
        return { rows: [{ id: KTP_FILE_ID }], rowCount: 1 };
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
    {
      recordInitialOnboardingPaymentsInTransaction: async (
        transactionClient: unknown,
        input: {
          method: 'cash' | 'bank_transfer';
          dpAmount: number;
          securityDepositAmount: number;
          paymentNote?: string;
        },
      ) => {
        assert.equal(transactionClient, client);
        assert.equal(
          input.dpAmount,
          options.expectedInitialRentCredit ??
            onboardingDto.dp_verified_amount +
              (options.expectedBookingFeeAmount ?? onboardingDto.booking_fee_paid_amount ?? 0),
          'booking fee must become rent credit before the W06 DP allocation is recorded',
        );
        events.push('payment');
        return {
          method: input.method,
          status: input.method === 'cash' ? 'verified' : 'pending_confirmation',
          dpRecordedAmount: input.dpAmount,
          securityDepositRecordedAmount: input.securityDepositAmount,
          dpVerifiedAmount: input.method === 'cash' ? input.dpAmount : 0,
          securityDepositVerifiedAmount: input.method === 'cash' ? input.securityDepositAmount : 0,
          receipts: [],
        };
      },
    } as never,
    {
      issueScheduleInTransaction: async (transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        events.push('schedule');
        return { firstInvoiceId: FIRST_RENT_INVOICE_ID, installmentCount: 3 };
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
    room_status: 'reserved',
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
    dp_required_amount: '5400000',
    security_deposit_required_amount: '1800000',
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
      if (/AS activation_is_available/.test(normalized))
        return {
          rows: [{ activation_is_available: options.activationAvailable ?? true }],
          rowCount: 1,
        };
      if (/AS dp_verified_amount/.test(normalized))
        return {
          rows: [
            {
              dp_verified_amount: '5400000',
              deposit_balance: '1800000',
              first_due_date: '2026-08-01',
              first_invoice_status: 'partially_paid',
            },
          ],
          rowCount: 1,
        };
      if (/AS due_is_valid/.test(normalized))
        return { rows: [{ due_is_valid: true }], rowCount: 1 };
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
    term_months: 3,
    billing_cycle: 'monthly',
    payment_plan_type: 'monthly_installments',
    accepted_terms_version: 'W05-v1',
    dp_verified_amount: 100,
    security_deposit_funded_amount: 100,
    payment_method: 'cash',
    ktp_file_id: KTP_FILE_ID,
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
    { ...valid, term_months: 2 },
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

test('onboarding accepts zero or a minimum Rp1.000.000 booking fee and rejects an in-between value', async () => {
  const zero = createOnboardingHarness({ expectedBookingFeeAmount: 0 });
  await zero.service.commit(
    actor as never,
    { ...onboardingDto, booking_fee_paid_amount: 0 },
    IDEMPOTENCY_KEY,
    {},
  );
  assert.equal(zero.events[0], 'authorized');

  const belowMinimum = createOnboardingHarness();
  await assert.rejects(
    belowMinimum.service.commit(
      actor as never,
      { ...onboardingDto, booking_fee_paid_amount: 999_999 },
      IDEMPOTENCY_KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'BOOKING_FEE_MINIMUM_NOT_MET',
  );
  assert.deepEqual(belowMinimum.events, []);
});

test('three-month full payment accepts Rp1.000.000 booking credit plus Rp4.400.000 cash rent', async () => {
  const harness = createOnboardingHarness({ expectedInitialRentCredit: 5_400_000 });
  const response = await harness.service.commit(
    actor as never,
    {
      ...onboardingDto,
      term_months: 3,
      billing_cycle: 'monthly',
      payment_plan_type: 'annual_full',
      dp_verified_amount: 4_400_000,
      booking_fee_paid_amount: 1_000_000,
      security_deposit_funded_amount: 0,
      payment_method: 'cash',
    },
    IDEMPOTENCY_KEY,
    {},
  );

  assert.equal(response.contractRentAmount, 5_400_000);
  assert.equal(response.dpRequiredAmount, 1_350_000);
  assert.equal(response.securityDepositRequiredAmount, 0);
  assert.equal(response.initialPayment.dpRecordedAmount, 5_400_000);
  assert.equal(response.initialPayment.securityDepositRecordedAmount, 0);

  const leaseInsert = harness.queries.find(({ sql }) => /INSERT INTO leases/.test(sql));
  assert.ok(leaseInsert, 'onboarding must create an awaiting-activation lease');
  assert.match(
    leaseInsert.sql,
    /security_deposit_required_amount,signed_at,created_by_user_id,updated_by_user_id\) VALUES\([\s\S]*?\$20,now\(\),\$21,\$21\)/,
    'lease INSERT must bind exactly one expression for each final target column',
  );
  assert.doesNotMatch(
    leaseInsert.sql,
    /\$20,\$21,now\(\),\$21,\$21/,
    'actor id must not be inserted as an extra expression before signed_at',
  );
});

test('three-month DP plan records the 25% figure as a recommendation and accepts a lower agreed amount', async () => {
  const harness = createOnboardingHarness({ expectedInitialRentCredit: 100_000 });
  const response = await harness.service.commit(
    actor as never,
    {
      ...onboardingDto,
      term_months: 3,
      billing_cycle: 'monthly',
      payment_plan_type: 'monthly_installments',
      dp_verified_amount: 100_000,
      booking_fee_paid_amount: 0,
      security_deposit_funded_amount: 0,
      payment_method: 'cash',
    },
    IDEMPOTENCY_KEY,
    {},
  );

  assert.equal(response.contractRentAmount, 5_400_000);
  assert.equal(response.dpRequiredAmount, 1_350_000);
  assert.equal(response.initialPayment.dpRecordedAmount, 100_000);
});

test('commercial calculation keeps DP and free security deposit separate and public lead cannot inject room', async () => {
  assert.deepEqual(calculateOnboardingCommercial(1_800_000, 21_600_000, 'yearly', 12), {
    contractRent: 21_600_000,
    dpRequired: 5_400_000,
    depositRequired: 0,
  });
  assert.deepEqual(calculateOnboardingCommercial(1_800_000, 21_600_000, 'monthly', 3), {
    contractRent: 5_400_000,
    dpRequired: 1_350_000,
    depositRequired: 0,
  });
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

test('onboarding reads the canonical category commercial version without legacy kost type columns', async () => {
  const harness = createOnboardingHarness();
  await harness.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {});
  const roomAuthority = harness.queries.find(({ sql }) => /FROM rooms r/.test(sql));
  assert.ok(roomAuthority);
  assert.match(roomAuthority.sql, /kcv\.annual_contract_value/);
  assert.match(roomAuthority.sql, /kcv\.monthly_price \* kcv\.security_deposit_months/);
  assert.doesNotMatch(roomAuthority.sql, /kcv\.annual_price|kt\.annual_price/);
  assert.doesNotMatch(
    roomAuthority.sql,
    /kcv\.security_deposit_amount|kt\.security_deposit_amount/,
  );
  assert.deepEqual(
    roomAuthority.params,
    [ROOM_ID, PROPERTY_ID, onboardingDto.start_date],
    'commercial authority must be selected for the final contractual start date',
  );
});

test('resident insert binds date of birth as a date and keeps address as text', async () => {
  const harness = createOnboardingHarness();
  await harness.service.commit(
    actor as never,
    {
      ...onboardingDto,
      place_of_birth: 'Bandung',
      date_of_birth: '2004-08-02',
      address: 'Jalan Demo Nomor 1',
    },
    IDEMPOTENCY_KEY,
    {},
  );

  const residentInsert = harness.queries.find(({ sql }) => /INSERT INTO residents/.test(sql));
  assert.ok(residentInsert);
  assert.match(
    residentInsert.sql,
    /VALUES\( \$1,\$2,\$3,\$4,\$5,'pending_activation',\$6,\$7::date,\$8,\$9/,
  );
  assert.equal(residentInsert.params[5], 'Bandung');
  assert.equal(residentInsert.params[6], '2004-08-02');
  assert.equal(residentInsert.params[7], 'Jalan Demo Nomor 1');
});

test('onboarding rejects duplicate resident contact before any resident or lease write', async () => {
  const harness = createOnboardingHarness({
    identityRows: [
      {
        id: RESIDENT_ID,
        email: 'resident@example.test',
        phone: '628111111111',
        ktp_number: null,
      },
    ],
  });
  await assert.rejects(
    harness.service.commit(
      actor as never,
      { ...onboardingDto, visitor_email: 'resident@example.test' },
      IDEMPOTENCY_KEY,
      {},
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'getResponse' in error);
      assert.deepEqual((error as { getResponse: () => unknown }).getResponse(), {
        code: 'RESIDENT_IDENTITY_DUPLICATE',
        message: 'Resident identity is already used in this property',
        details: {
          visitor_email: ['already_used'],
        },
      });
      return true;
    },
  );
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'rollback', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'rollback', 'release'],
  );
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO residents|INSERT INTO leases/.test(sql)),
    false,
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

test('direct onboarding reserves its room without creating occupancy or occupying it', async () => {
  const harness = createOnboardingHarness();
  const response = await harness.service.commit(actor as never, onboardingDto, IDEMPOTENCY_KEY, {});
  assert.equal(response.leaseStatus, 'awaiting_activation');
  assert.equal(response.temporaryPassword, 'transient-only');
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'account', 'payment', 'audit', 'commit', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'account', 'payment', 'audit', 'commit', 'release'],
  );
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO occupancies/.test(sql)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql }) =>
      /UPDATE rooms SET room_status='reserved',updated_at=now\(\)/.test(sql),
    ),
    true,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /UPDATE rooms SET room_status='occupied'/.test(sql)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /UPDATE idempotency_commands/.test(sql)),
    true,
  );
});

test('W06 records onboarding transfer DP and free deposit on the supplied transaction client', async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const audits: Array<{ entry: unknown; client: unknown }> = [];
  let paymentSequence = 0;
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalizedSql(sql);
      queries.push({ sql: normalized, params });
      if (/FROM leases l JOIN residents/.test(normalized))
        return {
          rows: [
            {
              id: LEASE_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              room_id: ROOM_ID,
              occupancy_id: null,
              lease_status: 'awaiting_activation',
              start_date: '2026-08-01',
              end_date: '2027-07-31',
              contract_rent_amount: '21600000',
              dp_required_amount: '5400000',
              security_deposit_required_amount: '0',
              payment_plan_type: 'two_month_installments',
              snapshot_monthly_price: '1800000',
              snapshot_room_number: 'RK-01-01',
              snapshot_kost_type_name: 'Rumah Kost',
              building_code: 'RK-01',
              resident_name: 'Resident',
              remaining_days: 365,
            },
          ],
          rowCount: 1,
        };
      if (/FROM files/.test(normalized))
        return { rows: [{ id: PAYMENT_EVIDENCE_ID }], rowCount: 1 };
      if (/SELECT i\.id,i\.property_id/.test(normalized))
        return {
          rows: [
            {
              id: FIRST_RENT_INVOICE_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              lease_id: LEASE_ID,
              invoice_status: 'issued',
              invoice_purpose: 'rent',
              due_date: '2026-08-01',
              total_amount: '5400000',
              credit_amount: '0',
              allocated_amount: '0',
            },
          ],
          rowCount: 1,
        };
      if (/SELECT i\.id FROM invoices/.test(normalized))
        return { rows: [{ id: FIRST_RENT_INVOICE_ID }], rowCount: 1 };
      if (/INSERT INTO payments/.test(normalized)) {
        paymentSequence += 1;
        return {
          rows: [
            {
              id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${paymentSequence}`,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              lease_id: LEASE_ID,
              payment_code: params[3],
              payment_method: params[4],
              payment_status: params[5],
              payment_purpose: params[6],
              amount: String(params[7]),
              paid_at: new Date('2026-08-01T00:00:00.000Z'),
              verified_at: null,
              proof_id: null,
              reference_number: null,
              notes: params[9],
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new W06BillingService(
    {
      transaction: async () => {
        assert.fail('W06 must not open a nested transaction for the W05 command');
      },
    } as never,
    {} as never,
    {
      write: async (entry: unknown, transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        audits.push({ entry, client: transactionClient });
      },
    } as never,
  );
  const summary = await service.recordInitialOnboardingPaymentsInTransaction(client as never, {
    propertyId: PROPERTY_ID,
    residentId: RESIDENT_ID,
    leaseId: LEASE_ID,
    firstRentInvoiceId: FIRST_RENT_INVOICE_ID,
    method: 'bank_transfer',
    dpAmount: 5_400_000,
    securityDepositAmount: 300_000,
    evidenceFileIds: [PAYMENT_EVIDENCE_ID],
    paymentNote: 'Transfer dari rekening orang tua',
    commandFingerprint: 'a'.repeat(64),
    actor: actor as never,
    context: {},
  });
  assert.deepEqual(summary, {
    method: 'bank_transfer',
    status: 'pending_confirmation',
    dpRecordedAmount: 5_400_000,
    securityDepositRecordedAmount: 300_000,
    dpVerifiedAmount: 0,
    securityDepositVerifiedAmount: 0,
    receipts: [],
  });
  const paymentWrites = queries.filter(({ sql }) => /INSERT INTO payments/.test(sql));
  assert.equal(paymentWrites.length, 2);
  assert.equal(
    paymentWrites.every(({ sql }) =>
      /\$9::uuid,CASE WHEN \$6='verified' THEN \$9::uuid ELSE NULL END/.test(sql),
    ),
    true,
    'actor identity must be bound explicitly as UUID in both payment columns',
  );
  assert.deepEqual(
    paymentWrites.map(({ params }) => params[6]),
    ['dp', 'security_deposit'],
  );
  assert.equal(
    paymentWrites.every(({ params }) => params[5] === 'pending_confirmation'),
    true,
  );
  assert.equal(
    paymentWrites.every(({ params }) => params[9] === 'Transfer dari rekening orang tua'),
    true,
  );
  assert.equal(
    queries.filter(({ sql }) => /INSERT INTO payment_evidence_files/.test(sql)).length,
    2,
  );
  assert.equal(
    queries.filter(({ sql }) => /INSERT INTO payment_allocation_intents/.test(sql)).length,
    1,
  );
  assert.equal(
    queries.some(({ sql }) => /INSERT INTO payment_allocations/.test(sql)),
    false,
  );
  assert.equal(
    queries.some(({ sql }) => /INSERT INTO payment_receipts/.test(sql)),
    false,
  );
  assert.equal(audits.length, 2);
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

test('activation rejects a lease before its Jakarta start date without lifecycle mutation', async () => {
  const startDate = '2026-08-11';
  const harness = createActivationHarness({
    activationAvailable: false,
    roomOverrides: { start_date: startDate },
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
        'LEASE_ACTIVATION_NOT_YET_AVAILABLE',
  );
  assert.deepEqual(harness.events, ['authorized', 'begin', 'rollback', 'release']);
  assert.equal(
    harness.queries.some(({ sql }) =>
      /INSERT INTO occupancies|UPDATE rooms|INSERT INTO occupancy_history|INSERT INTO lease_history|INSERT INTO business_events|UPDATE idempotency_commands/.test(
        sql,
      ),
    ),
    false,
  );
  const activationWindow = harness.queries.find(({ sql }) =>
    /AS activation_is_available/.test(sql),
  );
  assert.ok(
    activationWindow,
    'activation availability must be checked by the database business date',
  );
  assert.deepEqual(activationWindow.params, [startDate]);
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
