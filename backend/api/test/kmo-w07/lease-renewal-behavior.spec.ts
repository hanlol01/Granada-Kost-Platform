import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseRenewalService } from '../../src/modules/lease/lease-renewal.service';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const PREDECESSOR_ID = '22222222-2222-4222-8222-222222222222';
const SUCCESSOR_ID = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = '44444444-4444-4444-8444-444444444444';
const ROOM_ID = '55555555-5555-4555-8555-555555555555';
const OCCUPANCY_ID = '66666666-6666-4666-8666-666666666666';
const SUCCESSOR_OCCUPANCY_ID = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const COMMAND_ID = '77777777-7777-4777-8777-777777777777';
const INVOICE_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const SETTLEMENT_ID = 'abababab-abab-4bab-8bab-abababababab';
const POLICY_SNAPSHOT_ID = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

type Options = {
  verifiedCredit?: number;
  today?: string;
  failActivation?: boolean;
  legacySettlement?: boolean;
};

function normalize(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

function serviceHarness(options: Options = {}) {
  const today = options.today ?? '2026-10-01';
  const writes: string[] = [];
  let predecessorStatus = 'active';
  let successorStatus = 'awaiting_activation';
  let commandState = 'approved';
  let predecessorOccupancyStatus = 'active';
  let successorOccupancyCreated = false;
  let predecessorOccupancyEndDate: string | null = null;
  let predecessorCheckOutDate: string | null = null;
  let successorOccupancyStartDate: string | null = null;
  let successorCheckInDate: string | null = null;
  let settlementOriginalDueAt: unknown = null;
  const snapshot = {
    term_months: 12,
    billing_cycle: 'monthly',
    payment_plan_type: 'annual_full',
    contract_rent_amount: 18_000_000,
    dp_recommended_amount: 4_500_000,
    snapshot_monthly_price: 1_500_000,
    snapshot_yearly_price: 18_000_000,
    snapshot_deposit_amount: 0,
    room_number: 'A-01',
    kost_type_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kost_type_name: 'Standard',
    building_code: 'A',
    predecessor_end_date: '2026-09-30',
  };
  const command = () => ({
    id: COMMAND_ID,
    property_id: PROPERTY_ID,
    predecessor_lease_id: PREDECESSOR_ID,
    successor_lease_id: SUCCESSOR_ID,
    resident_id: RESIDENT_ID,
    room_id: ROOM_ID,
    effective_date: '2026-10-01',
    requested_terms: {},
    commercial_snapshot: snapshot,
    state: commandState,
    approved_by_user_id: USER_ID,
    approved_at: '2026-08-01T00:00:00Z',
    financial_prepared_by_user_id: USER_ID,
    financial_prepared_at: '2026-09-01T00:00:00Z',
    first_invoice_id: INVOICE_ID,
    activation_authorized_by_user_id: USER_ID,
    activation_authorized_at: '2026-09-20T00:00:00Z',
    activated_by_user_id: null,
    activated_at: null,
    cancelled_by_user_id: null,
    cancelled_at: null,
    cancel_reason: null,
    failure_code: null,
    created_by_user_id: USER_ID,
    created_at: '2026-08-01T00:00:00Z',
  });
  const lease = (id: string) => ({
    id,
    property_id: PROPERTY_ID,
    lease_code: `LS-${id.slice(0, 8)}`,
    resident_id: RESIDENT_ID,
    room_id: ROOM_ID,
    occupancy_id: id === PREDECESSOR_ID ? OCCUPANCY_ID : null,
    kost_type_id: snapshot.kost_type_id,
    lease_status: id === PREDECESSOR_ID ? predecessorStatus : successorStatus,
    start_date: id === PREDECESSOR_ID ? '2025-10-01' : '2026-10-01',
    end_date: id === PREDECESSOR_ID ? '2026-09-30' : '2027-09-30',
    billing_cycle: 'monthly',
    billing_anchor_day: 1,
    next_billing_date: '2026-10-01',
    snapshot_monthly_price: '1500000',
    snapshot_yearly_price: '18000000',
    snapshot_deposit_amount: '0',
    snapshot_room_number: 'A-01',
    snapshot_kost_type_name: 'Standard',
    term_months: 12,
    payment_plan_type: 'annual_full',
    contract_rent_amount: '18000000',
    dp_required_amount: '4500000',
    security_deposit_required_amount: '0',
    renewed_from_lease_id: id === SUCCESSOR_ID ? PREDECESSOR_ID : null,
  });
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (/FROM lease_renewal_commands WHERE id=\$1 FOR UPDATE/.test(q))
        return { rows: [command()], rowCount: 1 };
      if (/FROM property_feature_flags/.test(q))
        return {
          rows: [
            {
              property_id: PROPERTY_ID,
              admin_ux_read: true,
              lease_write: true,
              lease_transfer: false,
              lease_billing_scheduler: false,
              lease_renewal: true,
              lease_renewal_scheduler: true,
            },
          ],
          rowCount: 1,
        };
      if (/SELECT \(now\(\) AT TIME ZONE 'Asia\/Jakarta'\)/.test(q))
        return { rows: [{ today }], rowCount: 1 };
      if (/FROM leases WHERE id=\$1 FOR UPDATE/.test(q))
        return { rows: [lease(String(params[0]))], rowCount: 1 };
      if (/FROM occupancies WHERE id=\$1 FOR UPDATE/.test(q))
        return {
          rows: [
            {
              id: OCCUPANCY_ID,
              occupancy_status: 'active',
              room_id: ROOM_ID,
              resident_id: RESIDENT_ID,
            },
          ],
          rowCount: 1,
        };
      if (/SELECT id,property_id,room_status FROM rooms/.test(q))
        return {
          rows: [{ id: ROOM_ID, property_id: PROPERTY_ID, room_status: 'occupied' }],
          rowCount: 1,
        };
      if (/SELECT id FROM leases WHERE property_id=\$1 AND lease_status='active'/.test(q))
        return { rows: [], rowCount: 0 };
      if (/AS verified_credit/.test(q))
        return {
          rows: [
            {
              verified_credit: String(options.verifiedCredit ?? 1),
              invoice_status: 'issued',
              invoice_lease_id: SUCCESSOR_ID,
            },
          ],
          rowCount: 1,
        };
      if (/UPDATE occupancies SET occupancy_status='ended'/.test(q)) {
        if (options.failActivation) throw new Error('connection terminated unexpectedly');
        predecessorOccupancyStatus = 'ended';
        predecessorOccupancyEndDate = String(params[1]);
        writes.push('predecessor-occupancy-closed');
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO occupancy_history/.test(q)) {
        if (/'check_out'|check_out/.test(q)) {
          predecessorCheckOutDate = String(params[4]);
          writes.push('occupancy-checkout');
        } else {
          successorCheckInDate = String(params[4]);
          writes.push('occupancy-checkin');
        }
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE leases SET lease_status='ended'/.test(q)) {
        predecessorStatus = 'ended';
        writes.push('predecessor-ended');
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO occupancies\(/.test(q)) {
        successorOccupancyCreated = true;
        successorOccupancyStartDate = String(params[3]);
        writes.push('successor-occupancy-opened');
        return { rows: [{ id: SUCCESSOR_OCCUPANCY_ID }], rowCount: 1 };
      }
      if (/UPDATE leases SET lease_status='active',occupancy_id=\$2/.test(q)) {
        assert.equal(params[1], SUCCESSOR_OCCUPANCY_ID);
        assert.notEqual(params[1], OCCUPANCY_ID);
        successorStatus = 'active';
        writes.push('successor-active');
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT settlement\.id, settlement\.policy_snapshot_id/.test(q))
        return {
          rows: [
            {
              id: SETTLEMENT_ID,
              policy_snapshot_id: options.legacySettlement ? null : POLICY_SNAPSHOT_ID,
              final_checkpoint_due_at: options.legacySettlement
                ? null
                : new Date('2027-01-01T16:59:59.999Z'),
            },
          ],
          rowCount: 1,
        };
      if (/UPDATE lease_contract_settlements SET state='open'/.test(q)) {
        settlementOriginalDueAt = params[1];
        writes.push('settlement-open');
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE lease_contract_settlements settlement/.test(q)) {
        settlementOriginalDueAt = 'legacy-two-month-rule';
        writes.push('settlement-open');
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE lease_renewal_commands SET state='activated'/.test(q)) {
        commandState = 'activated';
        writes.push('command-activated');
        return { rows: [command()], rowCount: 1 };
      }
      if (/INSERT INTO (lease_history|audit_logs|business_events)/.test(q)) {
        writes.push('evidence');
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unhandled query: ${q}`);
    },
  };
  const repository = {
    transaction: async <T>(fn: (c: typeof client) => Promise<T>) => fn(client),
    query: client.query,
  };
  const features = {
    isRenewalSchedulerEnabled: async () => true,
    assertRenewalEnabled: async () => undefined,
  };
  return {
    service: new LeaseRenewalService(
      repository as never,
      features as never,
      {
        issueScheduleInTransaction: async () => ({
          firstInvoiceId: INVOICE_ID,
          installmentCount: 12,
        }),
      } as never,
    ),
    writes,
    statuses: () => ({
      predecessorStatus,
      successorStatus,
      commandState,
      predecessorOccupancyStatus,
      successorOccupancyCreated,
      predecessorOccupancyEndDate,
      predecessorCheckOutDate,
      successorOccupancyStartDate,
      successorCheckInDate,
    }),
    settlementOriginalDueAt: () => settlementOriginalDueAt,
  };
}

test('W07C authorized activation closes predecessor occupancy and opens a distinct successor occupancy', async () => {
  const harness = serviceHarness();
  const result = await harness.service.executeAuthorizedRenewal(COMMAND_ID, 'run-1');
  assert.deepEqual(result, { state: 'activated', late: false });
  assert.deepEqual(harness.statuses(), {
    predecessorStatus: 'ended',
    successorStatus: 'active',
    commandState: 'activated',
    predecessorOccupancyStatus: 'ended',
    successorOccupancyCreated: true,
    predecessorOccupancyEndDate: '2026-10-01',
    predecessorCheckOutDate: '2026-10-01',
    successorOccupancyStartDate: '2026-10-01',
    successorCheckInDate: '2026-10-01',
  });
  // Contiguous occupancy records: predecessor occupancy is closed (check_out)
  // before the distinct successor occupancy is opened (check_in) and linked.
  assert.ok(
    harness.writes.indexOf('predecessor-occupancy-closed') <
      harness.writes.indexOf('successor-occupancy-opened'),
  );
  assert.ok(
    harness.writes.indexOf('successor-occupancy-opened') <
      harness.writes.indexOf('successor-active'),
  );
  assert.ok(harness.writes.includes('occupancy-checkout'));
  assert.ok(harness.writes.includes('occupancy-checkin'));
  assert.equal(
    (harness.settlementOriginalDueAt() as Date).toISOString(),
    '2027-01-01T16:59:59.999Z',
  );
});

test('W07C legacy successor settlement retains the pre-policy two-month fallback', async () => {
  const harness = serviceHarness({ legacySettlement: true });
  const result = await harness.service.executeAuthorizedRenewal(COMMAND_ID, 'run-legacy');
  assert.deepEqual(result, { state: 'activated', late: false });
  assert.equal(harness.settlementOriginalDueAt(), 'legacy-two-month-rule');
});

test('W07C late execution retains the effective-date occupancy boundary without overlap', async () => {
  const harness = serviceHarness({ today: '2026-10-10' });
  const result = await harness.service.executeAuthorizedRenewal(COMMAND_ID, 'run-late');
  assert.deepEqual(result, { state: 'activated', late: true });
  const dates = harness.statuses();
  assert.equal(dates.predecessorOccupancyEndDate, '2026-10-01');
  assert.equal(dates.predecessorCheckOutDate, '2026-10-01');
  assert.equal(dates.successorOccupancyStartDate, '2026-10-01');
  assert.equal(dates.successorCheckInDate, '2026-10-01');
  // Occupancy periods are end-exclusive at the renewal cutover: an occupancy
  // ending on the successor's start date has no overlapping occupancy date.
  assert.ok(
    dates.predecessorOccupancyEndDate !== null &&
      dates.successorOccupancyStartDate !== null &&
      dates.predecessorOccupancyEndDate <= dates.successorOccupancyStartDate,
  );
});

test('W07C requires a real verified W06 allocation; advisory 25 percent is not a minimum', async () => {
  const missing = serviceHarness({ verifiedCredit: 0 });
  const outcome = await missing.service.executeAuthorizedRenewal(COMMAND_ID, 'run-credit');
  assert.equal(outcome.state, 'failed');
  assert.equal(outcome.failure_code, 'RENEWAL_INITIAL_RENT_CREDIT_UNVERIFIED');
  assert.equal(missing.statuses().predecessorStatus, 'active');
  assert.equal(missing.statuses().successorStatus, 'awaiting_activation');
  assert.equal(missing.statuses().commandState, 'approved');
  assert.equal(missing.statuses().successorOccupancyCreated, false);
  const partial = serviceHarness({ verifiedCredit: 1 });
  const activated = await partial.service.executeAuthorizedRenewal(COMMAND_ID, 'run-partial');
  assert.equal(activated.state, 'activated');
});

test('W07C transient scheduler failure is retryable and has no committed partial lifecycle state', async () => {
  const harness = serviceHarness({ failActivation: true });
  await assert.rejects(() => harness.service.executeAuthorizedRenewal(COMMAND_ID, 'run-transient'));
  assert.equal(harness.statuses().predecessorStatus, 'active');
  assert.equal(harness.statuses().successorStatus, 'awaiting_activation');
  assert.equal(harness.statuses().commandState, 'approved');
  assert.equal(harness.statuses().predecessorOccupancyStatus, 'active');
  assert.equal(harness.statuses().successorOccupancyCreated, false);
});

type EligibilityOptions = {
  today?: string;
  leaseEndDate?: string | null;
  leaseStatus?: string;
  commandState?: 'draft' | 'approved' | 'activated' | null;
  firstInvoiceId?: string | null;
  activationAuthorizedAt?: string | null;
  verifiedCredit?: number;
  reversedCredit?: number;
};

function eligibilityHarness(options: EligibilityOptions = {}) {
  const today = options.today ?? '2026-09-20';
  const leaseEndDate = options.leaseEndDate === undefined ? '2026-09-30' : options.leaseEndDate;
  const leaseStatus = options.leaseStatus ?? 'active';
  const commandState = options.commandState === undefined ? 'approved' : options.commandState;
  const firstInvoiceId = options.firstInvoiceId === undefined ? INVOICE_ID : options.firstInvoiceId;
  const activationAuthorizedAt =
    options.activationAuthorizedAt === undefined ? null : options.activationAuthorizedAt;
  let paymentFactParams: readonly unknown[] | null = null;
  let paymentFactSql: string | null = null;
  const repository = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (/AS today/.test(q)) return { rows: [{ today }], rowCount: 1 };
      if (/property_id FROM leases WHERE id=\$1$/.test(q))
        return { rows: [{ property_id: PROPERTY_ID }], rowCount: 1 };
      if (/SELECT id,property_id,lease_status,end_date::text FROM leases/.test(q))
        return {
          rows: [
            {
              id: PREDECESSOR_ID,
              property_id: PROPERTY_ID,
              lease_status: leaseStatus,
              end_date: leaseEndDate,
            },
          ],
          rowCount: leaseEndDate === undefined ? 0 : 1,
        };
      if (/FROM lease_renewal_commands/.test(q)) {
        if (commandState === null) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: COMMAND_ID,
              property_id: PROPERTY_ID,
              predecessor_lease_id: PREDECESSOR_ID,
              successor_lease_id: SUCCESSOR_ID,
              state: commandState,
              first_invoice_id: firstInvoiceId,
              activation_authorized_at: activationAuthorizedAt,
              commercial_snapshot: {},
              requested_terms: {},
            },
          ],
          rowCount: 1,
        };
      }
      if (/AS verified_credit/.test(q)) {
        paymentFactParams = params;
        paymentFactSql = q;
        return {
          rows: [
            {
              verified_credit: String(
                Math.max(0, (options.verifiedCredit ?? 0) - (options.reversedCredit ?? 0)),
              ),
            },
          ],
          rowCount: 1,
        };
      }
      throw new Error(`Unhandled query: ${q}`);
    },
  };
  const features = { assertRenewalEnabled: async () => undefined };
  const service = new LeaseRenewalService(
    repository as never,
    features as never,
    {
      issueScheduleInTransaction: async () => ({
        firstInvoiceId: INVOICE_ID,
        installmentCount: 12,
      }),
    } as never,
  );
  const user = {
    id: USER_ID,
    roles: ['admin'],
    permissions: ['lease.manage'],
    propertyIds: [PROPERTY_ID],
  };
  return {
    service,
    user,
    paymentFactParams: () => paymentFactParams,
    paymentFactSql: () => paymentFactSql,
  };
}

test('W07C H-60 eligibility clears once a renewal intent is recorded', async () => {
  const withoutIntent = eligibilityHarness({ today: '2026-08-05', commandState: null });
  const a = await withoutIntent.service.renewalEligibility(
    withoutIntent.user as never,
    PREDECESSOR_ID,
  );
  const rA = (a.data.eligibility as { reminders: any }).reminders;
  assert.equal(rA.h60.window_open, true);
  assert.equal(rA.h60.cleared, false);
  assert.equal(rA.h60.action_required, true);

  const withIntent = eligibilityHarness({ today: '2026-08-05', commandState: 'draft' });
  const b = await withIntent.service.renewalEligibility(withIntent.user as never, PREDECESSOR_ID);
  const rB = (b.data.eligibility as { reminders: any }).reminders;
  assert.equal(rB.h60.cleared, true);
  assert.equal(rB.h60.action_required, false);
});

test('W07C eligibility uses exact H-60/H-30/H-14 boundaries and keeps active no-command/draft H-30 actionable', async () => {
  const eligibilityFor = async (
    today: string,
    commandState: EligibilityOptions['commandState'],
  ) => {
    const harness = eligibilityHarness({ today, commandState });
    const response = await harness.service.renewalEligibility(
      harness.user as never,
      PREDECESSOR_ID,
    );
    return (response.data.eligibility as { reminders: Record<string, Record<string, unknown>> })
      .reminders;
  };

  const day61 = await eligibilityFor('2026-07-31', null);
  assert.equal(day61.h60.window_open, false);
  assert.equal(day61.h30.window_open, false);
  assert.equal(day61.h14.window_open, false);

  const day60 = await eligibilityFor('2026-08-01', null);
  assert.equal(day60.h60.window_open, true);
  assert.equal(day60.h60.action_required, true);
  assert.equal(day60.h30.window_open, false);

  const day31 = await eligibilityFor('2026-08-30', null);
  assert.equal(day31.h60.window_open, true);
  assert.equal(day31.h30.window_open, false);
  assert.equal(day31.h14.window_open, false);

  const day30NoCommand = await eligibilityFor('2026-08-31', null);
  assert.equal(day30NoCommand.h60.window_open, false);
  assert.equal(day30NoCommand.h30.window_open, true);
  assert.equal(day30NoCommand.h30.action_required, true);
  assert.equal(day30NoCommand.h14.window_open, false);

  const day30Draft = await eligibilityFor('2026-08-31', 'draft');
  assert.equal(day30Draft.h30.window_open, true);
  assert.equal(day30Draft.h30.action_required, true);
  assert.equal(day30Draft.h30.unresolved_work, null);

  const day14 = await eligibilityFor('2026-09-16', null);
  assert.equal(day14.h30.window_open, true);
  assert.equal(day14.h30.action_required, true);
  assert.equal(day14.h14.window_open, true);
  assert.equal(day14.h14.action_required, true);

  const day0 = await eligibilityFor('2026-09-30', null);
  assert.equal(day0.h30.window_open, true);
  assert.equal(day0.h30.action_required, true);
  assert.equal(day0.h14.window_open, true);
  assert.equal(day0.h14.action_required, true);

  const lateActiveLease = await eligibilityFor('2026-10-01', null);
  assert.equal(lateActiveLease.h60.window_open, false);
  assert.equal(lateActiveLease.h30.window_open, false);
  assert.equal(lateActiveLease.h14.window_open, false);
  assert.equal(lateActiveLease.h30.action_required, false);
  assert.equal(lateActiveLease.h14.action_required, false);
});

test('W07C H-30 exposes unresolved approved-renewal work; a payment alone does not clear it', async () => {
  // Approved, financials prepared, verified payment recorded, but not effective.
  const withPayment = eligibilityHarness({
    today: '2026-09-05',
    commandState: 'approved',
    firstInvoiceId: INVOICE_ID,
    activationAuthorizedAt: null,
    verifiedCredit: 5_000_000,
  });
  const res = await withPayment.service.renewalEligibility(
    withPayment.user as never,
    PREDECESSOR_ID,
  );
  const r = (res.data.eligibility as { reminders: any }).reminders;
  assert.equal(r.h30.window_open, true);
  assert.equal(r.h30.cleared, false);
  assert.equal(r.h30.payment_recorded, true);
  // Payment recorded yet H-30 stays unresolved: it still needs authorization.
  assert.equal(r.h30.unresolved_work, 'activation_authorization');
  assert.equal(r.h30.action_required, true);
});

test('W07C payment fact is successor/property/invoice scoped and becomes false after full reversal', async () => {
  const fullyReversed = eligibilityHarness({
    today: '2026-09-05',
    commandState: 'approved',
    firstInvoiceId: INVOICE_ID,
    verifiedCredit: 5_000_000,
    reversedCredit: 5_000_000,
  });
  const response = await fullyReversed.service.renewalEligibility(
    fullyReversed.user as never,
    PREDECESSOR_ID,
  );
  const reminders = (response.data.eligibility as { reminders: any }).reminders;
  assert.equal(reminders.h30.payment_recorded, false);
  assert.equal(reminders.h30.action_required, true);
  assert.deepEqual(fullyReversed.paymentFactParams(), [INVOICE_ID, SUCCESSOR_ID, PROPERTY_ID]);
  assert.match(fullyReversed.paymentFactSql() ?? '', /payment_reversal_allocations/);
  assert.match(fullyReversed.paymentFactSql() ?? '', /payment\.property_id=\$3/);
  assert.match(fullyReversed.paymentFactSql() ?? '', /payment\.lease_id=\$2/);
  assert.match(fullyReversed.paymentFactSql() ?? '', /invoice\.property_id=\$3/);
  assert.match(fullyReversed.paymentFactSql() ?? '', /invoice\.lease_id=\$2/);
});

test('W07C H-14 clears only when the renewal is effective', async () => {
  const notEffective = eligibilityHarness({
    today: '2026-09-20',
    commandState: 'approved',
    firstInvoiceId: INVOICE_ID,
    activationAuthorizedAt: '2026-09-19T00:00:00Z',
  });
  const a = await notEffective.service.renewalEligibility(
    notEffective.user as never,
    PREDECESSOR_ID,
  );
  const rA = (a.data.eligibility as { reminders: any }).reminders;
  assert.equal(rA.h14.window_open, true);
  assert.equal(rA.h14.cleared, false);
  assert.equal(rA.h14.action_required, true);
  assert.equal(rA.h30.unresolved_work, 'activation_execution');

  const effective = eligibilityHarness({ today: '2026-09-20', commandState: 'activated' });
  const b = await effective.service.renewalEligibility(effective.user as never, PREDECESSOR_ID);
  const rB = (b.data.eligibility as { reminders: any }).reminders;
  assert.equal(rB.h14.cleared, true);
  assert.equal(rB.h30.cleared, true);
  assert.equal(rB.h30.unresolved_work, null);
  assert.equal(rB.h14.action_required, false);
});

test('W07C renewal eligibility denies a non-admin actor', async () => {
  const harness = eligibilityHarness();
  const owner = {
    id: USER_ID,
    roles: ['owner'],
    permissions: [],
    propertyIds: [PROPERTY_ID],
  };
  await assert.rejects(
    () => harness.service.renewalEligibility(owner as never, PREDECESSOR_ID),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'RENEWAL_ACTOR_INVALID',
  );
});
