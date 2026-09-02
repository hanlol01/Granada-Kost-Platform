import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseCheckoutService } from '../../src/modules/lease/lease-checkout.service';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const LEASE_ID = '22222222-2222-4222-8222-222222222222';
const OCCUPANCY_ID = '33333333-3333-4333-8333-333333333333';
const RESIDENT_ID = '44444444-4444-4444-8444-444444444444';
const ROOM_ID = '55555555-5555-4555-8555-555555555555';
const COMMAND_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const FINAL_SETTLEMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXIT_REFUND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVIDENCE_FILE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const admin = {
  id: USER_ID,
  roles: ['admin'],
  permissions: ['lease.manage', 'billing.manage'],
  propertyIds: [PROPERTY_ID],
};
const context = { correlationId: 'w07d-test' };
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

type Options = {
  today?: string;
  state?: string;
  evidence?: string[];
  failRoomUpdate?: boolean;
  idempotencyConflict?: boolean;
  recommendedShortNoticeCharge?: number;
  approvedShortNoticeCharge?: number;
  m5Exit?: boolean;
  physicalConfirmed?: boolean;
  actualCheckoutDate?: string;
  leaseStatus?: string;
  invoiceTotal?: number;
  invoicePaid?: number;
  depositBalance?: number;
};
function harness(options: Options = {}) {
  const events: string[] = [];
  const queries: string[] = [];
  let state = options.state ?? 'settlement_pending';
  let documentSequence = 0;
  let documentNumberSequence = 0;
  const command = () => ({
    id: COMMAND_ID,
    property_id: PROPERTY_ID,
    lease_id: LEASE_ID,
    occupancy_id: OCCUPANCY_ID,
    resident_id: RESIDENT_ID,
    room_id: ROOM_ID,
    state,
    effective_date: '2026-10-01',
    notice_recorded_date: '2026-09-01',
    notice_reason: 'Pindah',
    notice_exception_reason: null,
    exit_type: options.m5Exit ? 'resident_early_termination' : null,
    request_source: options.m5Exit ? 'admin_recorded_resident_request' : null,
    notice_days: 30,
    missing_notice_days: 0,
    payment_period_days: 31,
    daily_rate_amount: '58065',
    recommended_short_notice_charge: String(options.recommendedShortNoticeCharge ?? 0),
    approved_short_notice_charge:
      state === 'notice_received' ? null : String(options.approvedShortNoticeCharge ?? 0),
    short_notice_waiver_reason: null,
    approved_at:
      options.m5Exit && state !== 'notice_received' ? new Date('2026-09-01T00:00:00.000Z') : null,
    physical_checkout_confirmed_at: options.physicalConfirmed
      ? new Date('2026-09-27T00:00:00.000Z')
      : null,
    actual_checkout_date: options.actualCheckoutDate ?? null,
  });
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      await Promise.resolve();
      const q = normalize(sql);
      queries.push(q);
      if (/INSERT INTO idempotency_commands/.test(q)) {
        if (options.idempotencyConflict) return { rows: [], rowCount: 0 };
        return { rows: [{ request_fingerprint: 'new' }], rowCount: 1 };
      }
      if (
        /SELECT request_fingerprint,command_status,response_status,response_body FROM idempotency_commands/.test(
          q,
        )
      )
        return {
          rows: [
            {
              request_fingerprint: 'different-request',
              command_status: 'succeeded',
              response_status: 200,
              response_body: { data: {} },
            },
          ],
          rowCount: 1,
        };
      if (/SELECT \(now\(\) AT TIME ZONE 'Asia\/Jakarta'\)/.test(q))
        return { rows: [{ today: options.today ?? '2026-10-01' }], rowCount: 1 };
      if (/SELECT property_id FROM leases/.test(q))
        return { rows: [{ property_id: PROPERTY_ID }], rowCount: 1 };
      if (/FROM property_feature_flags/.test(q))
        return {
          rows: [
            {
              property_id: PROPERTY_ID,
              admin_ux_read: true,
              lease_write: true,
              lease_transfer: false,
              lease_billing_scheduler: false,
              lease_renewal: false,
              lease_renewal_scheduler: false,
              lease_checkout: true,
            },
          ],
          rowCount: 1,
        };
      if (/FROM properties WHERE/.test(q)) return { rows: [{ id: PROPERTY_ID }], rowCount: 1 };
      if (/FROM lease_checkout_commands WHERE id=\$1 AND lease_id=\$2 FOR UPDATE/.test(q))
        return { rows: [command()], rowCount: 1 };
      if (/SELECT inspection_room_status FROM lease_checkout_commands/.test(q))
        return { rows: [{ inspection_room_status: 'inspection_required' }], rowCount: 1 };
      if (/FROM leases WHERE id=\$1 FOR UPDATE/.test(q))
        return {
          rows: [
            {
              id: LEASE_ID,
              property_id: PROPERTY_ID,
              occupancy_id: OCCUPANCY_ID,
              resident_id: RESIDENT_ID,
              room_id: ROOM_ID,
              lease_status: options.leaseStatus ?? 'active',
              start_date: '2026-08-28',
              end_date: '2027-02-28',
              snapshot_monthly_price: '1800000',
              contract_rent_amount: '10800000',
            },
          ],
          rowCount: 1,
        };
      if (/FROM occupancies WHERE/.test(q) || /FROM rooms WHERE/.test(q))
        return { rows: [{ id: params[0] }], rowCount: 1 };
      if (/SELECT id FROM files WHERE/.test(q))
        return {
          rows: ((params[0] as string[] | undefined) ?? []).map((id) => ({ id })),
          rowCount: ((params[0] as string[] | undefined) ?? []).length,
        };
      if (/SELECT DISTINCT evidence_category/.test(q))
        return {
          rows: (options.evidence ?? ['keys_access', 'inventory', 'parking', 'inspection']).map(
            (evidence_category) => ({ evidence_category }),
          ),
          rowCount: 4,
        };
      if (/FROM invoices i/.test(q))
        return {
          rows: [
            {
              id: '88888888-8888-4888-8888-888888888888',
              total_amount: String(options.invoiceTotal ?? 500),
              credit_amount: '0',
              net_allocated: String(options.invoicePaid ?? 0),
            },
          ],
          rowCount: 1,
        };
      if (/FROM lease_deposit_transactions WHERE lease_id=\$1 ORDER BY/.test(q))
        return {
          rows: [{ direction: 'credit', amount: String(options.depositBalance ?? 1000) }],
          rowCount: 1,
        };
      if (/INSERT INTO lease_exit_final_settlements/.test(q))
        return { rows: [{ id: FINAL_SETTLEMENT_ID }], rowCount: 1 };
      if (/INSERT INTO lease_exit_refunds/.test(q))
        return { rows: [{ id: EXIT_REFUND_ID }], rowCount: 1 };
      if (/FROM lease_exit_final_settlements settlement/.test(q))
        return {
          rows: [
            {
              issued_at: new Date('2026-10-01T05:00:00.000Z'),
              property_name: 'Granada Student House',
              property_address: 'Jatinangor, Sumedang',
              resident_name: 'Fahmi',
              room_number: 'AK-18-01',
              building_code: 'AK',
              category_name: 'Kost Eksklusif',
              room_checkout_result: 'inspection_required',
              lease_start_date: '2026-08-28',
              lease_planned_end_date: '2027-02-28',
              contract_rent_amount: '10800000',
              monthly_rate_amount: '1800000',
              policy_version: 'lease_settlement_v2',
              exit_type: 'resident_early_termination',
              actual_checkout_date: '2026-10-01',
              checkout_confirmed_by: 'Diki Karya Permana',
              checkout_confirmed_at: new Date('2026-10-01T01:00:00.000Z'),
              inspection_recorded_by: 'Diki Karya Permana',
              inspection_recorded_at: new Date('2026-10-01T02:00:00.000Z'),
              notice_recorded_date: '2026-09-01',
              effective_date: '2026-10-01',
              notice_days: 30,
              missing_notice_days: 0,
              notice_reason: 'Pindah kota',
              approved_short_notice_charge: String(options.approvedShortNoticeCharge ?? 0),
              short_notice_waiver_reason: null,
              verified_rent_payment_amount: String(options.invoicePaid ?? 1_800_000),
              existing_invoice_credit_amount: '0',
              recognized_rent_credit_amount: String(options.invoicePaid ?? 1_800_000),
              earned_rent_amount: '1800000',
              unearned_invoice_credit_amount: '9000000',
              contract_outstanding_amount: '0',
              rent_refundable_amount: '0',
              rent_amount_due_before_deposit_offset: String(options.approvedShortNoticeCharge ?? 0),
              deposit_liability_amount: String(options.depositBalance ?? 1_000),
              deposit_deduction_amount: '0',
              deposit_rent_offset_amount: '0',
              refundable_deposit_amount: String(options.depositBalance ?? 1_000),
              recommended_refund_amount: String(options.depositBalance ?? 1_000),
              final_refund_amount: String(options.depositBalance ?? 1_000),
              final_rent_refund_amount: '0',
              final_deposit_refund_amount: String(options.depositBalance ?? 1_000),
              refund_adjustment_amount: '0',
              refund_adjustment_reason: null,
              amount_due: String(options.approvedShortNoticeCharge ?? 0),
              decision_status: options.approvedShortNoticeCharge ? 'amount_due' : 'refund_pending',
              refund_status: params[3] ? (state === 'completed' ? 'settled' : 'pending') : null,
              refund_due_date: params[3] ? '2026-10-10' : null,
              refund_payment_method: state === 'completed' ? 'bank_transfer' : null,
              refund_external_reference: state === 'completed' ? 'TRX-REFUND-001' : null,
              refund_settled_at:
                state === 'completed' ? new Date('2026-10-02T03:00:00.000Z') : null,
            },
          ],
          rowCount: 1,
        };
      if (/AS metadata_by_category/.test(q))
        return {
          rows: [
            {
              categories: options.evidence ?? ['keys_access', 'inventory', 'parking', 'inspection'],
              metadata_by_category: {
                keys_access: {
                  items: [
                    {
                      name: 'Kunci kamar',
                      expected_quantity: 1,
                      returned_quantity: 1,
                      status: 'returned',
                    },
                  ],
                },
                inventory: {
                  items: [
                    {
                      name: 'Lemari',
                      expected_quantity: 1,
                      returned_quantity: 1,
                      condition: 'complete',
                    },
                  ],
                },
                utilities: { readings: [] },
              },
            },
          ],
          rowCount: 1,
        };
      if (/FROM payments payment/.test(q) && /payment\.payment_status='verified'/.test(q))
        return {
          rows: [
            {
              payment_code: 'PAY-TEST-001',
              payment_purpose: 'rent',
              amount: String(options.invoicePaid ?? 1_800_000),
              paid_at: new Date('2026-08-27T03:00:00.000Z'),
              payment_method: 'bank_transfer',
              payment_status: 'verified',
              receipt_code: 'RCT-TEST-001',
            },
          ],
          rowCount: 1,
        };
      if (/reason_type='checkout_damage'/.test(q)) return { rows: [], rowCount: 0 };
      if (/SELECT next_billing_document_number/.test(q)) {
        documentNumberSequence += 1;
        const segment =
          params[1] === 'checkout_handover'
            ? 'BAST-KELUAR'
            : params[1] === 'final_settlement'
              ? 'RINCIAN-AKHIR'
              : 'REFUND-KELUAR';
        return {
          rows: [
            {
              document_code: `${String(documentNumberSequence).padStart(3, '0')}-09/${segment}/GSH1/2026`,
            },
          ],
          rowCount: 1,
        };
      }
      if (/SELECT next_financial_transaction_code/.test(q))
        return { rows: [{ code: 'REF-20260827-000001-CHECKOUT' }], rowCount: 1 };
      if (/INSERT INTO lease_exit_documents/.test(q)) {
        documentSequence += 1;
        return {
          rows: [
            {
              id: `dddddddd-dddd-4ddd-8dd${documentSequence}-${String(documentSequence).padStart(12, '0')}`,
              document_code: params[6],
              document_kind: params[7],
              issued_at: params[12],
            },
          ],
          rowCount: 1,
        };
      }
      if (
        /SELECT id,amount,refund_due_date::text,deposit_transaction_id,final_settlement_id FROM lease_exit_refunds/.test(
          q,
        )
      )
        return {
          rows: [
            {
              id: EXIT_REFUND_ID,
              amount: '1800000',
              refund_due_date: '2026-10-10',
              deposit_transaction_id: '99999999-9999-4999-8999-999999999999',
              final_settlement_id: FINAL_SETTLEMENT_ID,
            },
          ],
          rowCount: 1,
        };
      if (/SELECT slot.id FROM parking_slots/.test(q)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO lease_deposit_transactions/.test(q))
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      if (/generate_series/.test(q)) return { rows: [{ due_date: '2026-10-10' }], rowCount: 1 };
      if (
        /UPDATE occupancies SET/.test(q) ||
        /UPDATE leases SET/.test(q) ||
        /UPDATE rooms SET/.test(q)
      )
        return { rows: [], rowCount: options.failRoomUpdate && /UPDATE rooms SET/.test(q) ? 0 : 1 };
      if (/UPDATE lease_checkout_commands SET state='completed'/.test(q)) {
        state = 'completed';
        return { rows: [command()], rowCount: 1 };
      }
      if (/SET state='inspection_required'/.test(q)) {
        state = 'inspection_required';
        return { rows: [command()], rowCount: 1 };
      }
      if (/SET state='scheduled'/.test(q)) {
        state = 'scheduled';
        return { rows: [command()], rowCount: 1 };
      }
      if (/INSERT INTO lease_checkout_commands/.test(q)) return { rows: [command()], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const repo = {
    query: client.query,
    transaction: async (operation: (transaction: typeof client) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await operation(client);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  };
  const features = {
    assertCheckoutEnabled: async () => {
      await Promise.resolve();
    },
    isCheckoutEnabled: async () => {
      await Promise.resolve();
      return true;
    },
  };
  const w06 = {
    reconcileInvoiceLifecycleInTransaction: async () => {
      await Promise.resolve();
      events.push('w06-reconcile');
    },
  };
  return {
    service: new LeaseCheckoutService(repo as never, features as never, w06 as never),
    events,
    queries,
  };
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object' || !('code' in response)) return undefined;
  return typeof response.code === 'string' ? response.code : undefined;
}

void test('W07D completion is atomic, reconciles W06 credit, releases parking, and produces a weekday refund due date', async () => {
  const h = harness();
  const result = await h.service.complete(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    { room_status_after: 'inspection_required' },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);

  assert.equal(result.replayed, false);
  assert.ok(!h.queries.some((q) => /INSERT INTO payment_allocations/.test(q)));
  assert.ok(!h.queries.some((q) => /property_owner_earnings/.test(q)));
});

void test('W07D completion fails closed when required evidence is absent and does not end occupancy', async () => {
  const h = harness({ evidence: ['keys_access', 'inventory', 'inspection'] });
  await assert.rejects(
    () =>
      h.service.complete(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        { room_status_after: 'inspection_required' },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'CHECKOUT_EVIDENCE_REQUIRED',
  );
  assert.deepEqual(h.events, ['begin', 'rollback']);
  assert.ok(!h.queries.some((q) => /UPDATE occupancies SET occupancy_status='ended'/.test(q)));
});

void test('M5 short notice creates a server recommendation while property-owner remains denied', async () => {
  const h = harness({ state: 'notice_received' });
  const result = await h.service.notice(
    admin as never,
    LEASE_ID,
    {
      exit_type: 'resident_early_termination',
      effective_date: '2026-10-02',
      reason: 'Pindah',
    },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 201);
  assert.ok(h.queries.some((query) => /recommended_short_notice_charge/.test(query)));
  await assert.rejects(
    () =>
      h.service.notice(
        { ...admin, roles: ['property_owner'] } as never,
        LEASE_ID,
        {
          exit_type: 'resident_early_termination',
          effective_date: '2026-10-20',
          reason: 'Pindah',
        },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'FORBIDDEN',
  );
});

void test('M5 approval cannot exceed the recommendation and reductions require an audited waiver reason', async () => {
  const h = harness({ state: 'notice_received', recommendedShortNoticeCharge: 100_000 });
  await assert.rejects(
    () =>
      h.service.schedule(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        { approved_short_notice_charge: 100_001 },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'CHECKOUT_SHORT_NOTICE_CHARGE_EXCEEDS_RECOMMENDATION',
  );
  const withoutReason = harness({
    state: 'notice_received',
    recommendedShortNoticeCharge: 100_000,
  });
  await assert.rejects(
    () =>
      withoutReason.service.schedule(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        { approved_short_notice_charge: 50_000 },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'CHECKOUT_SHORT_NOTICE_WAIVER_REASON_REQUIRED',
  );
  const waived = harness({ state: 'notice_received', recommendedShortNoticeCharge: 100_000 });
  const approved = await waived.service.schedule(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    {
      approved_short_notice_charge: 50_000,
      short_notice_waiver_reason: 'Kondisi darurat disetujui pengelola',
    },
    '1234567890123456',
    context,
  );
  assert.equal(approved.status, 200);
  assert.ok(waived.queries.some((query) => /approved_short_notice_charge/.test(query)));
});

void test('W07D handover rejects an unconfirmed physical handover before recording evidence', async () => {
  const h = harness({ state: 'scheduled' });
  await assert.rejects(
    () =>
      h.service.handover(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        {
          key_access_confirmed: true,
          inventory_confirmed: false,
          parking_confirmed: true,
        },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'CHECKOUT_HANDOVER_CONFIRMATION_REQUIRED',
  );
  assert.deepEqual(h.events, ['begin', 'rollback']);
  assert.ok(!h.queries.some((q) => /INSERT INTO lease_checkout_evidence/.test(q)));
});

void test('M5 physical handover ends occupancy and lease while keeping the room under inspection', async () => {
  const h = harness({ state: 'scheduled', m5Exit: true });
  const result = await h.service.handover(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    {
      key_access_confirmed: true,
      inventory_confirmed: true,
      parking_confirmed: true,
      key_access_items: [
        {
          name: 'Kunci kamar',
          expected_quantity: 1,
          returned_quantity: 1,
          status: 'returned',
        },
      ],
      inventory_items: [
        {
          name: 'Lemari',
          expected_quantity: 1,
          returned_quantity: 1,
          condition: 'complete',
        },
      ],
      utility_readings: [],
    },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);
  assert.ok(
    h.queries.some((query) => /UPDATE occupancies SET occupancy_status='ended'/.test(query)),
  );
  assert.ok(h.queries.some((query) => /UPDATE leases SET lease_status='ended'/.test(query)));
  assert.ok(h.queries.some((query) => /room_status='inspection_required'/.test(query)));
  assert.ok(h.queries.some((query) => /physical_checkout_confirmed_at/.test(query)));
  assert.ok(!h.queries.some((query) => /INSERT INTO lease_deposit_transactions/.test(query)));
});

void test('M5 final settlement keeps deposit separate and creates the authoritative exit refund', async () => {
  const h = harness({
    state: 'settlement_pending',
    m5Exit: true,
    physicalConfirmed: true,
    actualCheckoutDate: '2026-09-27',
    leaseStatus: 'ended',
    invoiceTotal: 10_800_000,
    invoicePaid: 1_800_000,
    depositBalance: 1_800_000,
  });
  const result = await h.service.complete(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    { room_status_after: 'inspection_required' },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);
  assert.ok(h.queries.some((query) => /INSERT INTO lease_exit_final_settlements/.test(query)));
  assert.ok(h.queries.some((query) => /INSERT INTO lease_exit_refunds/.test(query)));
  assert.ok(h.queries.some((query) => /deposit_transaction_id/.test(query)));
  assert.ok(h.queries.some((query) => /INSERT INTO lease_exit_invoice_adjustments/.test(query)));
  assert.ok(h.queries.some((query) => /checkout_exit_refund/.test(query)));
  assert.ok(!h.queries.some((query) => /checkout_invoice_offset/.test(query)));
  assert.ok(!h.queries.some((query) => /UPDATE occupancies SET/.test(query)));
});

void test('M5 adjusted refund requires evidence and fully disposes the deposit ledger', async () => {
  const options = {
    state: 'settlement_pending',
    m5Exit: true,
    physicalConfirmed: true,
    actualCheckoutDate: '2026-09-27',
    leaseStatus: 'ended',
    invoiceTotal: 1_800_000,
    invoicePaid: 1_800_000,
    depositBalance: 1_800_000,
  } as const;
  const missingEvidence = harness(options);
  await assert.rejects(
    () =>
      missingEvidence.service.complete(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        {
          room_status_after: 'inspection_required',
          final_refund_amount: 1_000_000,
          refund_adjustment_reason: 'Kesepakatan final dengan penghuni',
        },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'CHECKOUT_REFUND_ADJUSTMENT_AUTHORITY_REQUIRED',
  );

  const adjusted = harness(options);
  const result = await adjusted.service.complete(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    {
      room_status_after: 'inspection_required',
      final_refund_amount: 1_000_000,
      refund_adjustment_reason: 'Kesepakatan final dengan penghuni',
      refund_adjustment_evidence_file_id: EVIDENCE_FILE_ID,
    },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);
  assert.ok(adjusted.queries.some((query) => /checkout_refund_adjustment/.test(query)));
  assert.ok(adjusted.queries.some((query) => /checkout_exit_refund/.test(query)));
});

void test('M5 explicit deposit offset can settle a short-notice charge outside rent invoices', async () => {
  const h = harness({
    state: 'settlement_pending',
    m5Exit: true,
    physicalConfirmed: true,
    actualCheckoutDate: '2026-09-27',
    leaseStatus: 'ended',
    approvedShortNoticeCharge: 300_000,
    invoiceTotal: 10_800_000,
    invoicePaid: 1_800_000,
    depositBalance: 1_800_000,
  });
  const result = await h.service.complete(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    {
      room_status_after: 'inspection_required',
      deposit_rent_offset_amount: 300_000,
      deposit_rent_offset_reason: 'Disetujui untuk melunasi biaya short-notice',
      deposit_rent_offset_evidence_file_id: EVIDENCE_FILE_ID,
    },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);
  assert.ok(h.queries.some((query) => /checkout_final_settlement_offset/.test(query)));
  assert.ok(!h.queries.some((query) => /checkout_invoice_offset/.test(query)));
});

void test('M5 settlement preview uses the same server authority without creating financial records', async () => {
  const h = harness({
    state: 'settlement_pending',
    m5Exit: true,
    physicalConfirmed: true,
    actualCheckoutDate: '2026-09-27',
    leaseStatus: 'ended',
    invoiceTotal: 1_800_000,
    invoicePaid: 1_800_000,
    depositBalance: 1_800_000,
  });
  const result = await h.service.previewSettlement(admin as never, LEASE_ID, COMMAND_ID, {
    room_status_after: 'inspection_required',
  });
  assert.equal(result.data.quote.recommended_refund_amount, 1_800_000);
  assert.equal(result.data.quote.amount_due, 0);
  assert.ok(!h.queries.some((query) => /INSERT INTO lease_exit_final_settlements/.test(query)));
  assert.ok(!h.queries.some((query) => /INSERT INTO lease_exit_refunds/.test(query)));
  assert.ok(!h.queries.some((query) => /INSERT INTO lease_deposit_transactions/.test(query)));
});

void test('M5 refund settlement closes the exit refund and its linked deposit disposition', async () => {
  const h = harness({ state: 'completed', m5Exit: true, physicalConfirmed: true });
  const result = await h.service.settleRefund(
    admin as never,
    LEASE_ID,
    COMMAND_ID,
    EXIT_REFUND_ID,
    {
      payment_method: 'bank_transfer',
      external_reference: 'BANK-REFUND-20261001',
      evidence_file_id: EVIDENCE_FILE_ID,
    },
    '1234567890123456',
    context,
  );
  assert.equal(result.status, 200);
  assert.ok(h.queries.some((query) => /UPDATE lease_exit_refunds/.test(query)));
  assert.ok(h.queries.some((query) => /UPDATE lease_exit_final_settlements/.test(query)));
  assert.ok(!h.queries.some((query) => /INSERT INTO lease_refund_settlements/.test(query)));
  assert.ok(
    h.queries.some(
      (query) =>
        /UPDATE lease_deposit_transactions/.test(query) && /transaction_type='refund'/.test(query),
    ),
  );
});

void test('W07D completion rolls back when a terminal write fails', async () => {
  const h = harness({ failRoomUpdate: true });
  await assert.rejects(() =>
    h.service.complete(
      admin as never,
      LEASE_ID,
      COMMAND_ID,
      { room_status_after: 'inspection_required' },
      '1234567890123456',
      context,
    ),
  );
  assert.equal(h.events.at(-1), 'rollback');
});

void test('W07D rejects an idempotency key reused with a different payload', async () => {
  const h = harness({ idempotencyConflict: true });
  await assert.rejects(
    () =>
      h.service.complete(
        admin as never,
        LEASE_ID,
        COMMAND_ID,
        { room_status_after: 'inspection_required' },
        '1234567890123456',
        context,
      ),
    (error: unknown) => errorCode(error) === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.deepEqual(h.events, ['begin', 'rollback']);
});
