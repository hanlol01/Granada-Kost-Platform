import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { BookingLeadCompletionService } from '../../src/modules/booking-lead/booking-lead-completion.service';

const root = join(import.meta.dirname, '..', '..');
const source = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

test('completion is a property-authorized, idempotent lead command and not direct onboarding', () => {
  const controller = source('src/modules/booking-lead/booking-lead-completion.controller.ts');
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  assert.match(controller, /assertCanReadProperty\(user, dto\.property_id\)/);
  assert.match(controller, /@Headers\('idempotency-key'\)/);
  assert.match(service, /BOOKING_LEAD_HOLD_REQUIRED/);
  assert.match(service, /BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS/);
  assert.match(service, /booking_lead_payment_commitments/);
  assert.match(service, /materialized_onboarding_commitment_id/);
  assert.doesNotMatch(service, /INSERT INTO occupancies/);
});

test('completion preserves the exact payment boundary', () => {
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  assert.match(service, /BOOKING_FEE_AMOUNT_INVALID/);
  assert.match(service, /dto\.rent_credit_amount !== 1000000/);
  assert.match(service, /PAYMENT_AMOUNT_EXCEEDS_CONTRACT_RENT/);
  assert.match(service, /dto\.rent_credit_amount > rentTotal/);
  assert.match(service, /FULL_SETTLEMENT_AMOUNT_INVALID/);
  assert.match(service, /pending_confirmation/);
  assert.match(service, /verificationStatus/);
});

test('a paid booking lead promotes its hold so the 24-hour expiry cannot undo a recorded payment', () => {
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  const holds = source('src/modules/booking-lead/repositories/booking-lead-hold.repository.ts');
  assert.match(service, /SET hold_status='committed'/);
  assert.match(service, /hold\.hold_status IN \('active','committed'\)/);
  assert.match(holds, /WHERE id = \$1 AND hold_status = 'active'/);
  assert.doesNotMatch(holds, /WHERE id = \$1 AND hold_status IN \('active','committed'\)/);
});

test('Booking Fee or DP can be cancelled before activation with immutable refund and lease cancellation records', () => {
  const controller = source('src/modules/booking-lead/booking-lead-completion.controller.ts');
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  const migration = source(
    'src/infrastructure/database/migrations/032_booking_lead_paid_hold_lifecycle.sql',
  );
  assert.match(controller, /cancel-payment-commitment/);
  assert.match(service, /BOOKING_LEAD_REFUND_UNAVAILABLE/);
  assert.match(service, /booking_lead_payment_commitment_refunds/);
  assert.match(service, /commitment\.materialized_onboarding_commitment_id/);
  assert.match(service, /payment_type === 'full_settlement'/);
  assert.match(service, /lease_status !== 'awaiting_activation'/);
  assert.match(service, /cancelInitialOnboardingFinancialsInTransaction/);
  assert.match(service, /hold_status='released'/);
  assert.match(service, /status='cancelled'/);
  assert.match(migration, /booking_lead_payment_commitment_refunds/);
  assert.match(migration, /hold_status IN \('active', 'committed'\)/);
});

test('verified Booking Fee or DP can be refunded before rental data creates a lease', async () => {
  const queries: string[] = [];
  const client = {
    query: async (statement: string) => {
      queries.push(statement);
      if (statement.includes('FROM booking_lead_payment_commitments')) {
        return {
          rows: [
            {
              id: 'commitment-1',
              property_id: 'property-1',
              booking_lead_id: 'lead-1',
              hold_id: 'hold-1',
              room_id: 'room-1',
              payment_type: 'down_payment',
              rent_credit_amount: 1_000_000,
              security_deposit_amount: 500_000,
              payment_method: 'cash',
              verification_status: 'verified',
              payment_note: null,
              payment_evidence_file_ids: [],
              start_date: '2026-09-01',
              term_months: 3,
              end_date: '2026-12-01',
              billing_cycle: 'monthly',
              payment_plan_type: 'monthly_installments',
              materialized_onboarding_commitment_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (statement.includes('INSERT INTO booking_lead_payment_commitment_refunds')) {
        return { rows: [{ id: 'refund-1', refunded_at: '2026-08-27T01:00:00.000Z' }], rowCount: 1 };
      }
      if (statement.includes("UPDATE booking_lead_holds SET hold_status='released'")) {
        return { rows: [{ room_id: 'room-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  };
  let billingCancellationCalled = false;
  const service = new BookingLeadCompletionService(
    { client: { connect: async () => client } } as never,
    {
      cancelInitialOnboardingFinancialsInTransaction: async () => {
        billingCancellationCalled = true;
        return {
          refundedAmount: 0,
          reversalIds: [],
          rejectedPaymentIds: [],
          voidedInvoiceIds: [],
        };
      },
    } as never,
  ) as any;
  service.idempotencyKey = () => 'refund-key';
  service.claim = async () => null;
  service.completeClaim = async () => undefined;
  service.assertPaymentEvidence = async () => undefined;
  service.lockContext = async () => ({
    lead_status: 'onboarding',
    hold_status: 'committed',
    hold_id: 'hold-1',
    room_id: 'room-1',
  });

  const result = await service.cancelPaymentCommitment(
    'lead-1',
    { property_id: 'property-1', refund_method: 'cash', refund_note: 'Batal sebelum sewa' },
    'admin-1',
    'refund-key',
  );

  assert.equal(result.data.refund_amount, 1_500_000);
  assert.equal(result.data.lease_id, null);
  assert.equal(billingCancellationCalled, false);
  assert.ok(queries.includes('COMMIT'));
  assert.ok(queries.some((statement) => statement.includes("status='cancelled'")));
});

test('completion quote is a property-authorized active-hold read model', () => {
  const controller = source('src/modules/booking-lead/booking-lead-completion.controller.ts');
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  assert.match(controller, /@Get\(':leadId\/completion-quote'\)/);
  assert.match(controller, /assertCanReadProperty\(user, propertyId\)/);
  assert.match(service, /async quote\(/);
  assert.match(service, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(service, /this\.assertEligible\(value, value\.lead_status === 'onboarding'\)/);
});

test('commercial authority uses the lease start date and preserves completed pre-cutover leads', () => {
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');

  assert.match(
    service,
    /this\.lockContext\(\s*client,\s*leadId,\s*dto\.property_id,\s*true,\s*dto\.start_date,?\s*\)/,
    'a new payment commitment must be priced against its requested lease start date',
  );
  assert.match(
    service,
    /OR lead\.status = 'onboarding'/,
    'only an already-completed lead may fall back to the initial commercial version',
  );
  assert.match(
    service,
    /CASE\s+WHEN commercial_version\.effective_date <= commercial_effective\.target_date\s+THEN 0\s+ELSE 1\s+END/,
    'an effective historical version must win before the onboarding compatibility fallback',
  );
});

test('progress projection keeps a property-scoped active tenancy resident and lease start date', () => {
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  assert.match(service, /lease\.resident_id/);
  assert.match(service, /resident_id: row\.resident_id/);
  assert.match(service, /lease\.property_id=lead\.property_id/);
});

test('completion quote remains available after a paid hold is committed, even after its provisional 24-hour expiry', async () => {
  const queries: string[] = [];
  const client = {
    query: async (statement: string) => {
      queries.push(statement);
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const service = new BookingLeadCompletionService(
    {
      client: { connect: async () => client },
    } as never,
    {} as never,
  ) as any;
  service.lockContext = async () => ({
    lead_id: 'lead-1',
    property_id: 'property-1',
    visitor_name: 'Calon Penghuni',
    visitor_phone: '628123456789',
    visitor_email: null,
    visitor_university: null,
    category: 'rumah_kost',
    gender: 'male',
    lead_status: 'onboarding',
    hold_id: 'hold-1',
    hold_status: 'committed',
    expires_at: new Date(Date.now() - 60_000),
    room_id: 'room-1',
    room_number: 'RK-01-01',
    room_kost_type_id: 'kost-type-1',
    room_gender_policy: 'male',
    building_property_id: 'property-1',
    building_category: 'rumah_kost',
    kost_type_property_id: 'property-1',
    kost_type_category: 'rumah_kost',
    room_status: 'reserved',
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
  });
  service.contractRent = () => 5_400_000;
  service.endDate = async () => '2026-11-30';

  const result = await service.quote('lead-1', 'property-1', '2026-08-31', 3);

  assert.equal(result.data.contract_rent_amount, 5_400_000);
  assert.equal(result.data.end_date, '2026-11-30');
  assert.ok(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  assert.ok(queries.includes('COMMIT'));
});

test('completion quote remains available for a new lead with an active compatible hold', async () => {
  const queries: string[] = [];
  const client = {
    query: async (statement: string) => {
      queries.push(statement);
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const service = new BookingLeadCompletionService(
    {
      client: { connect: async () => client },
    } as never,
    {} as never,
  ) as any;
  service.lockContext = async () => ({
    lead_id: 'lead-1',
    property_id: 'property-1',
    visitor_name: 'Calon Penghuni',
    visitor_phone: '628123456789',
    visitor_email: null,
    visitor_university: null,
    category: 'rumah_kost',
    gender: 'male',
    lead_status: 'new',
    hold_id: 'hold-1',
    hold_status: 'active',
    expires_at: new Date(Date.now() + 60_000),
    room_id: 'room-1',
    room_number: 'RK-01-01',
    room_kost_type_id: 'kost-type-1',
    room_gender_policy: 'male',
    building_property_id: 'property-1',
    building_category: 'rumah_kost',
    kost_type_property_id: 'property-1',
    kost_type_category: 'rumah_kost',
    room_status: 'reserved',
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
  });
  service.contractRent = () => 5_400_000;
  service.endDate = async () => '2026-11-06';

  const result = await service.quote('lead-1', 'property-1', '2026-08-06', 3);

  assert.equal(result.data.contract_rent_amount, 5_400_000);
  assert.equal(result.data.end_date, '2026-11-06');
  assert.ok(queries.includes('COMMIT'));
});

test('materialized completion context returns an actionable, property-scoped resident target', async () => {
  const queries: Array<{ statement: string; values?: unknown[] }> = [];
  const client = {
    query: async (statement: string, values?: unknown[]) => {
      queries.push({ statement, values });
      if (statement.includes('FROM booking_lead_payment_commitments')) {
        return { rows: [{ materialized_onboarding_commitment_id: 'onboarding-1' }], rowCount: 1 };
      }
      if (statement.includes('FROM onboarding_commitments')) {
        return { rows: [{ resident_id: 'resident-1', lease_id: 'lease-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const service = new BookingLeadCompletionService(
    {
      client: { connect: async () => client },
    } as never,
    {} as never,
  ) as any;
  service.lockContext = async () => ({ lead_id: 'lead-1', property_id: 'property-1' });
  service.assertEligible = () => undefined;

  await assert.rejects(
    () => service.context('lead-1', 'property-1'),
    (error: { response?: { code?: string; details?: Record<string, unknown> } }) =>
      error.response?.code === 'BOOKING_LEAD_ALREADY_ONBOARDED' &&
      error.response.details?.resident_id === 'resident-1' &&
      error.response.details?.lease_id === 'lease-1',
  );
  assert.ok(
    queries.some(
      ({ statement, values }) =>
        statement.includes('FROM onboarding_commitments') &&
        values?.join('|') === 'onboarding-1|lead-1|property-1',
    ),
  );
  assert.ok(queries.some(({ statement }) => statement === 'ROLLBACK'));
});

test('payment amount cannot exceed the server-calculated contract rent', () => {
  const service = Object.create(BookingLeadCompletionService.prototype) as {
    assertPayment: (
      dto: { payment_type: string; rent_credit_amount: number; payment_plan_type: string },
      rentTotal: number,
    ) => void;
  };
  const downPayment = {
    payment_type: 'down_payment',
    rent_credit_amount: 1_000_000,
    payment_plan_type: 'monthly_installments',
  };

  assert.doesNotThrow(() => service.assertPayment(downPayment, 5_400_000));
  assert.throws(
    () => service.assertPayment({ ...downPayment, rent_credit_amount: 0 }, 5_400_000),
    (error: { response?: { code?: string } }) =>
      error.response?.code === 'DOWN_PAYMENT_AMOUNT_INVALID',
  );
  assert.throws(
    () => service.assertPayment({ ...downPayment, rent_credit_amount: 5_400_001 }, 5_400_000),
    (error: { response?: { code?: string } }) =>
      error.response?.code === 'PAYMENT_AMOUNT_EXCEEDS_CONTRACT_RENT',
  );
  assert.throws(
    () =>
      service.assertPayment(
        { ...downPayment, payment_type: 'booking_fee', rent_credit_amount: 999_999 },
        5_400_000,
      ),
    (error: { response?: { code?: string } }) =>
      error.response?.code === 'BOOKING_FEE_AMOUNT_INVALID',
  );
  assert.doesNotThrow(() =>
    service.assertPayment(
      { ...downPayment, payment_type: 'booking_fee', rent_credit_amount: 1_000_000 },
      5_400_000,
    ),
  );
});

test('migration 029 models one unmaterialized payment commitment for a held booking lead', () => {
  const migration = source(
    'src/infrastructure/database/migrations/029_booking_lead_payment_commitments.sql',
  );
  assert.match(migration, /booking_lead_id UUID NOT NULL UNIQUE/);
  assert.match(migration, /hold_id UUID NOT NULL UNIQUE/);
  assert.match(migration, /materialized_onboarding_commitment_id/);
  assert.match(migration, /booking_fee/);
  assert.match(migration, /pending_confirmation/);
});
