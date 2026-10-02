import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseServicePeriodService } from '../../src/modules/lease/lease-service-period.service';

const base = {
  id: 'lease',
  property_id: 'property',
  room_id: 'room',
  resident_id: 'resident',
  start_date: '2026-08-01',
  end_date: '2027-08-01',
  planned_start_date: '2026-08-01',
  service_period_state: 'pending_check_in',
  lease_status: 'active',
  occupancy_id: null,
  term_months: 12,
  payment_plan_type: 'annual_full',
  snapshot_monthly_price: '1800000',
  contract_rent_amount: '21600000',
  commercial_mode: 'rent',
};

function fixture(
  lease: Record<string, unknown> | null = base,
  overrides: Record<string, unknown> = {},
) {
  const writes: string[] = [];
  const client = {
    query: async (sql: string) => {
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes.push(sql);
      if (/FROM leases WHERE id=\$1/.test(sql)) return { rows: lease ? [lease] : [] };
      if (/WITH chosen/.test(sql))
        return {
          rows: [
            {
              checked_in_at: new Date('2026-10-01T00:00:00+07:00'),
              business_date: '2026-10-01',
              today: '2026-10-02',
              valid: true,
              ...overrides,
            },
          ],
        };
      if (/AS room_conflict/.test(sql))
        return {
          rows: [
            {
              room_conflict: false,
              financial_lock: false,
              checkout: false,
              deadline_override: false,
              ...overrides,
            },
          ],
        };
      if (/FROM lease_installments/.test(sql)) return { rows: [] };
      throw new Error('Unexpected test query');
    },
  };
  const service = new LeaseServicePeriodService({ client } as never, {} as never);
  const run = () =>
    service.finalizeLocked(client as never, {
      leaseId: 'lease',
      propertyId: 'property',
      checkedInAt: new Date('2026-10-01T00:00:00+07:00'),
      actorId: 'actor',
      commandFingerprint: 'command',
      reason: overrides.reason as string | undefined,
      source: overrides.source as 'physical_check_in' | 'lease_data_correction' | undefined,
    });
  return { run, writes };
}

const rejectsCode = async (run: () => Promise<unknown>, code: string) =>
  assert.rejects(run, (error: any) => error.getResponse?.().code === code);

void test('foreign-property or missing lease is rejected before any write', async () => {
  const f = fixture(null);
  await rejectsCode(f.run, 'LEASE_NOT_FOUND');
  assert.deepEqual(f.writes, []);
});
void test('future physical check-in is rejected with an operational message', async () => {
  const f = fixture(base, { valid: false });
  await rejectsCode(f.run, 'LEASE_CHECK_IN_TIME_INVALID');
  assert.deepEqual(f.writes, []);
});
void test('physical check-in can use a changed planned date without an additional reason', async () => {
  const f = fixture();
  await rejectsCode(f.run, 'LEASE_SERVICE_PERIOD_BILLING_RECONCILIATION_REQUIRED');
  assert.deepEqual(f.writes, []);
});
void test('lease correction still requires a reason when changing the effective date', async () => {
  const f = fixture(base, { source: 'lease_data_correction' });
  await rejectsCode(f.run, 'LEASE_SERVICE_PERIOD_REASON_REQUIRED');
  assert.deepEqual(f.writes, []);
});
for (const [flag, code] of [
  ['room_conflict', 'LEASE_SERVICE_PERIOD_ROOM_CONFLICT'],
  ['financial_lock', 'LEASE_SERVICE_PERIOD_REVIEW_REQUIRED'],
  ['checkout', 'LEASE_SERVICE_PERIOD_REVIEW_REQUIRED'],
  ['deadline_override', 'LEASE_SERVICE_PERIOD_DEADLINE_REVIEW_REQUIRED'],
] as const) {
  void test(`${flag} prevents partial period writes`, async () => {
    const f = fixture(base, { [flag]: true });
    await rejectsCode(f.run, code);
    assert.deepEqual(f.writes, []);
  });
}
void test('unreconciled installments block physical check-in without rewriting financial records', async () => {
  const f = fixture(base, { reason: 'Actual physical arrival' });
  await rejectsCode(f.run, 'LEASE_SERVICE_PERIOD_BILLING_RECONCILIATION_REQUIRED');
  assert.deepEqual(f.writes, []);
});
for (const values of [
  { payment_plan_type: null },
  { snapshot_monthly_price: '0' },
  { contract_rent_amount: null },
]) {
  void test(`incomplete legacy terms ${JSON.stringify(values)} produce a review error, not a generic 500`, async () => {
    const f = fixture({ ...base, ...values });
    await rejectsCode(f.run, 'LEASE_SERVICE_PERIOD_LEGACY_REVIEW_REQUIRED');
    assert.deepEqual(f.writes, []);
  });
}
