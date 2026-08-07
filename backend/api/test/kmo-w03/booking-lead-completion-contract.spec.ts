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

test('completion quote is a property-authorized active-hold read model', () => {
  const controller = source('src/modules/booking-lead/booking-lead-completion.controller.ts');
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  assert.match(controller, /@Get\(':leadId\/completion-quote'\)/);
  assert.match(controller, /assertCanReadProperty\(user, propertyId\)/);
  assert.match(service, /async quote\(/);
  assert.match(service, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(service, /this\.assertEligible\(value, value\.lead_status === 'onboarding'\)/);
});

test('progress projection keeps a property-scoped active tenancy resident and lease start date', () => {
  const service = source('src/modules/booking-lead/booking-lead-completion.service.ts');
  assert.match(service, /lease\.resident_id/);
  assert.match(service, /resident_id: row\.resident_id/);
  assert.match(service, /lease\.property_id=lead\.property_id/);
});

test('completion quote remains available after a lead has been completed and before onboarding materializes it', async () => {
  const queries: string[] = [];
  const client = {
    query: async (statement: string) => {
      queries.push(statement);
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const service = new BookingLeadCompletionService({
    client: { connect: async () => client },
  } as never) as any;
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
  const service = new BookingLeadCompletionService({
    client: { connect: async () => client },
  } as never) as any;
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
  const service = new BookingLeadCompletionService({
    client: { connect: async () => client },
  } as never) as any;
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
