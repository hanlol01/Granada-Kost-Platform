import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  buildContractSchedule,
  minimumDpAmount,
} from '../../src/modules/billing/helpers/contract-schedule.helper';
import {
  createBillingInvoicePdf,
  createBillingReceiptPdf,
} from '../../src/modules/billing/helpers/billing-document.helper';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import {
  summarizeContractSettlementRentPayments,
  W06BillingService,
} from '../../src/modules/billing/services/w06-billing.service';

const root = resolve(__dirname, '../..');
const migration = readFileSync(
  resolve(root, 'src/infrastructure/database/migrations/027_billing_manual_payments.sql'),
  'utf8',
);
const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const RESIDENT_ID = '33333333-3333-4333-8333-333333333333';
const LEASE_ID = '44444444-4444-4444-8444-444444444444';
const INVOICE_1 = '55555555-5555-4555-8555-555555555555';
const INVOICE_2 = '66666666-6666-4666-8666-666666666666';
const FILE_ID = '77777777-7777-4777-8777-777777777777';
const PAYMENT_ID = '88888888-8888-4888-8888-888888888888';
const RECEIPT_ID = '99999999-9999-4999-8999-999999999999';
const REVERSAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const KEY = 'w06-contract-idempotency-0001';

test('contract settlement separates verified onboarding payment from later rent payment', () => {
  assert.deepEqual(
    summarizeContractSettlementRentPayments({
      invoiceCreditAmount: 0,
      allocatedAmount: 1_350_000,
      onboardingAllocatedAmount: 1_350_000,
    }),
    {
      initialRentCredit: 1_350_000,
      additionalRentPayments: 0,
    },
  );
  assert.deepEqual(
    summarizeContractSettlementRentPayments({
      invoiceCreditAmount: 1_000_000,
      allocatedAmount: 2_350_000,
      onboardingAllocatedAmount: 1_350_000,
    }),
    {
      initialRentCredit: 2_350_000,
      additionalRentPayments: 1_000_000,
    },
  );
});

void test('resident self billing derives scope from resident identity without a phantom membership table', async () => {
  const lease = {
    id: LEASE_ID,
    property_id: PROPERTY_ID,
    resident_id: RESIDENT_ID,
    room_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    occupancy_id: null,
    lease_status: 'active',
    start_date: '2026-08-01',
    end_date: '2027-02-01',
    contract_rent_amount: '10800000',
    dp_required_amount: '2700000',
    security_deposit_required_amount: '0',
    payment_plan_type: 'monthly_installments',
    snapshot_monthly_price: '1800000',
    snapshot_room_number: 'AK-05-01',
    snapshot_kost_type_name: 'Apart Kost',
    building_code: 'AK-05',
    resident_name: 'Resident QA',
    remaining_days: 165,
  };
  const statements: string[] = [];
  const service = new W06BillingService(
    {
      client: {
        query: (statement: string) => {
          const normalized = sql(statement);
          statements.push(normalized);
          if (normalized.includes('property_memberships')) {
            const error = new Error('relation "property_memberships" does not exist') as Error & {
              code: string;
            };
            error.code = '42P01';
            return Promise.reject(error);
          }
          if (normalized.includes('FROM leases l JOIN residents resident')) {
            return Promise.resolve({ rows: [lease] });
          }
          if (normalized.includes('FROM lease_installments')) {
            return Promise.resolve({ rows: [{ total: '0', paid: '0', next_due: null }] });
          }
          if (normalized.includes('SELECT timeline.*')) {
            return Promise.resolve({ rows: [] });
          }
          if (normalized.includes('FROM lease_deposit_transactions')) {
            return Promise.resolve({
              rows: [{ collected: '0', deducted: '0', refunded: '0', balance: '0' }],
            });
          }
          return Promise.resolve({ rows: [] });
        },
      },
    } as never,
    { assertCanReadProperty: () => Promise.resolve() } as never,
    {} as never,
  );

  const result = await service.myBilling({ id: ACTOR_ID } as never);

  assert.equal(result.data.lease.id, LEASE_ID);
  assert.equal(result.data.lease.property_id, PROPERTY_ID);
  assert.equal(
    statements.some((statement) => statement.includes('property_memberships')),
    false,
  );
  assert.equal(
    statements.some((statement) => statement.includes('resident.user_id=$1')),
    true,
  );
});

test('first-payment checkpoint requires one monthly rate after activation and accepts rent paid early', () => {
  const harness = paymentHarness();
  const project = (
    harness.service as unknown as {
      projectContractSettlement: (row: Record<string, unknown>) => {
        first_payment_checkpoint: {
          required_additional_amount: number;
          additional_payment_received: number;
          remaining_amount: number;
          status: string;
        };
      };
    }
  ).projectContractSettlement.bind(harness.service);

  const base = {
    total_amount: '10800000',
    credit_amount: '2700000',
    allocated_amount: '0',
    initial_payment_allocated: '0',
    monthly_rate: '1800000',
    activated_at: new Date('2026-08-09T00:00:00.000Z'),
    original_due_at: new Date('2026-10-09T16:59:59.999Z'),
    extension_due_at: null,
    termination_status: null,
    deposit_offset_amount: '0',
    first_payment_checkpoint_at: new Date('2026-09-09T16:59:59.999Z'),
  };

  assert.deepEqual(project(base).first_payment_checkpoint, {
    due_at: '2026-09-09T16:59:59.999Z',
    required_additional_amount: 1_800_000,
    additional_payment_received: 0,
    remaining_amount: 1_800_000,
    status: 'pending',
  });
  assert.deepEqual(project({ ...base, allocated_amount: '3000000' }).first_payment_checkpoint, {
    due_at: '2026-09-09T16:59:59.999Z',
    required_additional_amount: 1_800_000,
    additional_payment_received: 3_000_000,
    remaining_amount: 0,
    status: 'met_early',
  });
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

const actor = {
  id: ACTOR_ID,
  roles: ['manager'],
  permissions: ['billing.manage', 'payment.verify'],
  propertyIds: [PROPERTY_ID],
};

function sql(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function receiptAuthorityRow() {
  return {
    payment_code: 'PAY-W06-AUTHORITY',
    payment_method: 'cash',
    payment_purpose: 'rent',
    paid_at: new Date('2026-08-01T01:00:00.000Z'),
    resident_name: 'Resident Aman',
    room_number: 'RK-01',
    lease_start: '2026-08-01',
    lease_end: '2027-07-31',
    property_name: 'Granada Student House',
    property_address: 'Jatinangor, Sumedang',
    issued_by_name: 'Admin Test',
    settles_rent_contract: false,
    allocations: [{ invoice_code: 'INV-W06-001', amount: '1800000' }],
  };
}

test('worklist and payment workspace constrain the due-day window with Jakarta business dates', async () => {
  const queries: Array<{ statement: string; values: readonly unknown[] }> = [];
  const service = new W06BillingService(
    {
      client: {
        query: async (statement: string, values: readonly unknown[] = []) => {
          queries.push({ statement: sql(statement), values });
          if (statement.includes('count(*) AS total')) return { rows: [{ total: '0' }] };
          return { rows: [] };
        },
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );

  await service.currentWorklist(actor as never, {
    property_id: PROPERTY_ID,
    month: '2026-08',
    due_within_days: 30,
    search: 'RK0301',
  });
  await service.paymentWorkspace(actor as never, {
    property_id: PROPERTY_ID,
    status: 'verified',
    due_within_days: 30,
    search: 'RK0301',
  });

  assert.equal(
    queries.every((query) => query.values.includes(30)),
    true,
  );
  assert.equal(
    queries.every((query) => query.statement.includes("now() AT TIME ZONE 'Asia/Jakarta'")),
    true,
  );
  assert.equal(
    queries.some((query) => query.statement.includes('payment_allocations deadline_allocation')),
    true,
  );
  const compactRoomSearchQueries = queries.filter((query) => query.values.includes('RK0301'));
  assert.equal(compactRoomSearchQueries.length, 4);
  assert.equal(
    compactRoomSearchQueries.every((query) => query.statement.includes('regexp_replace')),
    true,
  );
  assert.equal(
    queries.some((query) =>
      query.statement.includes(
        'ORDER BY COALESCE(p.paid_at,p.created_at) DESC,p.created_at DESC,p.id DESC',
      ),
    ),
    true,
  );
});

type HarnessOptions = {
  auditFailure?: Error;
  authorizeFailure?: Error;
  invoiceOutstanding?: number;
  replayFingerprint?: string;
  paymentStatus?: 'pending_confirmation' | 'verified' | 'rejected';
  paymentPurpose?: 'rent' | 'dp';
  paymentCode?: string;
  commandFingerprint?: string | null;
  initialIntents?: Array<{ invoice_id: string; intended_amount: string }>;
  contractSettlement?: {
    state?: 'awaiting_activation' | 'open';
    activatedAt?: Date | null;
    originalDueAt: Date;
    extensionDueAt?: Date | null;
    deadlinePassed: boolean;
    initialPaymentAllocated?: number;
    outstanding?: number;
    terminationPending?: boolean;
    policyFinalDueAt?: Date | null;
  };
};

function paymentHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const intents: Array<{ invoice_id: string; intended_amount: string }> = [
    ...(options.initialIntents ?? []),
  ];
  let receiptNumberSequence = 0;
  let transactionNumberSequence = 0;
  const client = {
    query: async (statement: string, params: readonly unknown[] = []) => {
      const normalized = sql(statement);
      queries.push({ sql: normalized, params });
      if (/SELECT id FROM properties/.test(normalized))
        return { rows: [{ id: PROPERTY_ID }], rowCount: 1 };
      if (/SELECT next_financial_transaction_code/.test(normalized)) {
        transactionNumberSequence += 1;
        return {
          rows: [
            {
              code: `TRX-20260801-${String(transactionNumberSequence).padStart(6, '0')}-SEWA`,
            },
          ],
          rowCount: 1,
        };
      }
      if (/INSERT INTO idempotency_commands/.test(normalized))
        return options.replayFingerprint === undefined
          ? { rows: [{ id: 'command' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      if (/FROM idempotency_commands/.test(normalized))
        return {
          rows: [
            {
              request_fingerprint: options.replayFingerprint,
              command_status: 'succeeded',
              response_body: {
                data: {
                  payment_id: PAYMENT_ID,
                  payment_code: 'PAY-REPLAY',
                  payment_status: 'pending_confirmation',
                  payment_purpose: 'rent',
                  amount: 3_600_000,
                  receipt_id: null,
                },
              },
            },
          ],
          rowCount: 1,
        };
      if (/FROM leases l/.test(normalized))
        return {
          rows: [
            {
              id: LEASE_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              occupancy_id: null,
              lease_status: 'awaiting_activation',
              start_date: '2026-08-01',
              end_date: '2027-07-31',
              contract_rent_amount: '21600000',
              dp_required_amount: '5400000',
              security_deposit_required_amount: '1800000',
              payment_plan_type: 'two_month_installments',
              snapshot_monthly_price: '1800000',
              snapshot_room_number: 'RK-01',
              snapshot_kost_type_name: 'Rumah Kost',
              building_code: 'RUKOST-A',
              resident_name: 'Resident Aman',
            },
          ],
          rowCount: 1,
        };
      if (/SELECT lease_id,resident_id FROM payments/.test(normalized))
        return { rows: [{ lease_id: LEASE_ID, resident_id: RESIDENT_ID }], rowCount: 1 };
      if (/SELECT id,property_id,resident_id,lease_id,payment_code/.test(normalized))
        return {
          rows: [
            {
              id: PAYMENT_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              lease_id: LEASE_ID,
              payment_code: options.paymentCode ?? 'PAY-W06-PENDING',
              payment_method: 'bank_transfer',
              payment_status: options.paymentStatus ?? 'pending_confirmation',
              payment_purpose: options.paymentPurpose ?? 'rent',
              amount: '3600000',
              paid_at: new Date('2026-08-01T01:00:00.000Z'),
              verified_at: null,
              proof_id: null,
              reference_number: 'MANUAL-001',
              notes: null,
              command_fingerprint: options.commandFingerprint ?? null,
            },
          ],
          rowCount: 1,
        };
      if (/FROM payment_evidence_files/.test(normalized))
        return { rows: [{ id: FILE_ID }], rowCount: 1 };
      if (/FROM files WHERE/.test(normalized)) return { rows: [{ id: FILE_ID }], rowCount: 1 };
      if (/SELECT i.id,GREATEST/.test(normalized))
        return {
          rows: [{ id: INVOICE_1, outstanding: String(options.invoiceOutstanding ?? 1_800_000) }],
          rowCount: 1,
        };
      if (/SELECT i.id FROM invoices i LEFT JOIN LATERAL/.test(normalized))
        return { rows: [{ id: INVOICE_1 }], rowCount: 1 };
      if (/FROM invoices i/.test(normalized) && /ANY\(\$1::uuid\[\]\)/.test(normalized)) {
        const ids = params[0] as string[];
        return {
          rows: ids.map((id) => ({
            id,
            property_id: PROPERTY_ID,
            resident_id: RESIDENT_ID,
            lease_id: LEASE_ID,
            invoice_status: 'issued',
            invoice_purpose: 'rent',
            authority_source: 'contract_schedule',
            due_date: id === INVOICE_1 ? '2026-08-01' : '2026-10-01',
            total_amount: '1800000',
            credit_amount: '0',
            allocated_amount: String(1_800_000 - (options.invoiceOutstanding ?? 1_800_000)),
          })),
          rowCount: ids.length,
        };
      }
      if (/FROM lease_contract_settlements settlement/.test(normalized)) {
        const settlement = options.contractSettlement;
        if (!settlement) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              state: settlement.state ?? 'open',
              invoice_id: INVOICE_1,
              activated_at:
                settlement.activatedAt === undefined
                  ? new Date('2026-01-01T00:00:00.000Z')
                  : settlement.activatedAt,
              original_due_at: settlement.originalDueAt,
              extension_due_at: settlement.extensionDueAt ?? null,
              extension_reason: null,
              policy_snapshot_id: settlement.policyFinalDueAt
                ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
                : null,
              final_checkpoint_due_at: settlement.policyFinalDueAt ?? null,
              total_amount: '10800000',
              monthly_rate: '1800000',
              first_payment_checkpoint_at: new Date('2026-02-01T23:59:59.999Z'),
              credit_amount: '2700000',
              allocated_amount: String(8_100_000 - (settlement.outstanding ?? 8_100_000)),
              initial_payment_allocated: String(settlement.initialPaymentAllocated ?? 0),
              deposit_offset_amount: '0',
              termination_case_id: settlement.terminationPending
                ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                : null,
              termination_status: settlement.terminationPending ? 'pending' : null,
              planned_checkout_date: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        /SELECT now\(\) > CASE WHEN \$2::timestamptz IS NULL THEN \$1::timestamptz \+ INTERVAL '7 days' ELSE \$2::timestamptz END AS passed/.test(
          normalized,
        )
      )
        return {
          rows: [{ passed: options.contractSettlement?.deadlinePassed ?? false }],
          rowCount: 1,
        };
      if (/SELECT now\(\) > \$1::timestamptz AS passed/.test(normalized))
        return {
          rows: [{ passed: options.contractSettlement?.deadlinePassed ?? false }],
          rowCount: 1,
        };
      if (/INSERT INTO payments/.test(normalized))
        return {
          rows: [
            {
              id: PAYMENT_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              lease_id: LEASE_ID,
              payment_code: String(params[3]),
              payment_method: params[4],
              payment_status: params[5],
              payment_purpose: params[6],
              amount: String(params[7]),
              paid_at: new Date('2026-08-01T01:00:00.000Z'),
              verified_at: params[5] === 'verified' ? new Date('2026-08-01T01:00:00.000Z') : null,
              proof_id: null,
              reference_number: params[10] ?? null,
              notes: params[11] ?? null,
            },
          ],
          rowCount: 1,
        };
      if (/INSERT INTO payment_allocation_intents/.test(normalized)) {
        intents.push({ invoice_id: String(params[3]), intended_amount: String(params[4]) });
        return { rows: [], rowCount: 1 };
      }
      if (/FROM payment_allocation_intents/.test(normalized))
        return { rows: intents, rowCount: intents.length };
      if (/SELECT next_billing_document_number/.test(normalized)) {
        receiptNumberSequence += 1;
        return {
          rows: [
            {
              document_code: `${String(receiptNumberSequence).padStart(3, '0')}-08/SEWA-KOST/GSH1/2026`,
            },
          ],
          rowCount: 1,
        };
      }
      if (/issuer\.display_name AS issued_by_name/.test(normalized))
        return { rows: [receiptAuthorityRow()], rowCount: 1 };
      if (/INSERT INTO payment_receipts/.test(normalized))
        return { rows: [{ id: RECEIPT_ID }], rowCount: 1 };
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
  const service = new W06BillingService(
    database as never,
    {
      assertCanReadProperty: async () => {
        events.push('authorized');
        if (options.authorizeFailure) throw options.authorizeFailure;
      },
    } as never,
    {
      write: async (_input: unknown, transactionClient: unknown) => {
        assert.equal(transactionClient, client);
        events.push('audit');
        if (options.auditFailure) throw options.auditFailure;
      },
    } as never,
  );
  return { events, queries, service, client };
}

function paymentDto(method: 'cash' | 'bank_transfer' = 'cash') {
  return {
    property_id: PROPERTY_ID,
    resident_id: RESIDENT_ID,
    lease_id: LEASE_ID,
    method,
    payment_purpose: 'rent' as const,
    amount: 3_600_000,
    paid_at: '2026-08-01T01:00:00.000Z',
    reference_number: 'MANUAL-001',
    note: 'Pembayaran dua invoice',
    evidence_file_ids: [FILE_ID],
    allocations: [
      { invoice_id: INVOICE_1, amount: 1_800_000 },
      { invoice_id: INVOICE_2, amount: 1_800_000 },
    ],
  };
}

function contractSettlementPaymentDto(amount: number) {
  return {
    ...paymentDto('cash'),
    amount,
    allocations: [{ invoice_id: INVOICE_1, amount }],
  };
}

test('W06 annual and two-month schedules reconcile exact coverage and money', () => {
  const annual = buildContractSchedule({
    startDate: '2026-08-31',
    termMonths: 12,
    paymentPlanType: 'annual_full',
    contractRentAmount: 21_600_000,
  });
  assert.deepEqual(annual, [
    {
      sequenceNumber: 1,
      coverageStartDate: '2026-08-31',
      coverageEndDate: '2027-08-30',
      dueDate: '2026-08-31',
      scheduledAmount: 21_600_000,
    },
  ]);

  const installments = buildContractSchedule({
    startDate: '2026-01-31',
    termMonths: 12,
    paymentPlanType: 'two_month_installments',
    contractRentAmount: 21_600_001,
  });
  assert.equal(installments.length, 6);
  assert.equal(
    installments.reduce((sum, item) => sum + item.scheduledAmount, 0),
    21_600_001,
  );
  assert.deepEqual(
    installments.map((item) => [item.coverageStartDate, item.coverageEndDate, item.dueDate]),
    [
      ['2026-01-31', '2026-03-30', '2026-01-31'],
      ['2026-03-31', '2026-05-30', '2026-03-24'],
      ['2026-05-31', '2026-07-30', '2026-05-24'],
      ['2026-07-31', '2026-09-29', '2026-07-24'],
      ['2026-09-30', '2026-11-29', '2026-09-23'],
      ['2026-11-30', '2027-01-30', '2026-11-23'],
    ],
  );
  assert.throws(
    () =>
      buildContractSchedule({
        startDate: '2026-01-01',
        termMonths: 2,
        paymentPlanType: 'annual_full',
        contractRentAmount: 1,
      }),
    /at least 3 months/,
  );
  assert.equal(minimumDpAmount(21_600_001), 5_400_001);
});

test('server-mediated invoice PDF is valid and contains no internal identifiers', async () => {
  const document = await createBillingInvoicePdf({
    invoiceCode: 'INV-KMO-W06-001',
    invoiceStatus: 'partially_paid',
    invoicePurpose: 'rent',
    residentName: 'Siti (Utami)',
    roomNumber: 'A-12',
    buildingCode: 'KST',
    coverageStart: '2026-08-01',
    coverageEnd: '2026-09-30',
    dueDate: '2026-07-25',
    totalAmount: 4_000_000,
    outstandingAmount: 1_000_000,
    issuedAt: new Date('2026-07-20T08:00:00.000Z'),
  });
  const source = document.content.toString('latin1');
  const parsed = await PDFDocument.load(document.content);
  assert.equal(document.filename, 'INV-KMO-W06-001.pdf');
  assert.match(source, /^%PDF-1\.\d/);
  assert.ok(document.content.length > 10_000);
  assert.equal(parsed.getPageCount(), 1);
  assert.doesNotMatch(source, new RegExp(PROPERTY_ID, 'i'));
  assert.doesNotMatch(source, /storage|content_path|file_id/i);
});

test('server-mediated payment receipt PDF creates a valid receipt document', async () => {
  const document = await createBillingReceiptPdf({
    receiptCode: 'KWT-KMO-W06-001',
    paymentCode: 'PAY-KMO-W06-001',
    residentName: 'Siti Utami',
    roomNumber: 'A-12',
    paymentMethod: 'cash',
    paymentPurpose: 'rent',
    amount: 2_050_000,
    paidAt: new Date('2026-08-07T01:30:00.000Z'),
    issuedAt: new Date('2026-08-07T01:30:01.000Z'),
    allocations: [{ invoiceCode: 'INV-KMO-W06-001', amount: 2_050_000 }],
  });
  const source = document.content.toString('latin1');
  const parsed = await PDFDocument.load(document.content);
  assert.equal(document.filename, 'KWT-KMO-W06-001.pdf');
  assert.match(source, /^%PDF-1\.\d/);
  assert.equal(parsed.getPageCount(), 1);
  assert.doesNotMatch(source, new RegExp(PROPERTY_ID, 'i'));
  assert.doesNotMatch(source, /storage|content_path|file_id/i);
});

test('migration 027 is manifest-bound and structurally enforces immutable ledgers', () => {
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '027_billing_manual_payments.sql',
  );
  assert.ok(entry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), entry.checksumSha256);
  for (const authority of [
    'payment_allocation_intents',
    'payment_receipts',
    'payment_reversals',
    'payment_reversal_allocations',
    'payment_evidence_files',
    'invoice_evidence_files',
    'uq_invoices_w06_installment',
    'W06_VERIFIED_PAYMENT_IMMUTABLE',
    'W06_UNPAID_IS_NOT_PERSISTENT',
  ])
    assert.match(migration, new RegExp(authority));
  assert.match(migration, /pending_confirmation/);
  assert.match(migration, /WHEN 'pending' THEN 'pending_confirmation'/);
  assert.match(
    migration,
    /payment_status IN \('pending_confirmation','verified','rejected','reversed'\)/,
  );
  assert.doesNotMatch(migration, /midtrans|webhook|provider settlement/i);
});

test('audited cash allocates multiple invoices and creates receipt, audit, outbox, and idempotency in one client', async () => {
  const harness = paymentHarness();
  const result = await harness.service.recordManualPayment(
    actor as never,
    paymentDto('cash'),
    KEY,
    {},
  );
  assert.equal(result.data.payment_status, 'verified');
  assert.equal(result.data.receipt_id, RECEIPT_ID);
  const paymentInsert = harness.queries.find(({ sql: statement }) =>
    /INSERT INTO payments\(/.test(statement),
  );
  assert.match(
    paymentInsert?.sql ?? '',
    /\$10::uuid,CASE WHEN \$6='verified' THEN \$10::uuid ELSE NULL END/,
  );
  assert.equal(
    harness.queries.filter(({ sql: statement }) =>
      /INSERT INTO payment_allocations/.test(statement),
    ).length,
    2,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO business_events/.test(statement)),
    true,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /UPDATE idempotency_commands/.test(statement)),
    true,
  );
  const receiptInsert = harness.queries.find(({ sql: statement }) =>
    /INSERT INTO payment_receipts/.test(statement),
  );
  assert.ok(Buffer.isBuffer(receiptInsert?.params[8]));
  assert.ok((receiptInsert?.params[8] as Buffer).length > 1000);
  assert.match(String(receiptInsert?.params[9]), /^[0-9a-f]{64}$/);
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'audit', 'commit', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'audit', 'commit', 'release'],
  );
});

test('bank transfer remains pending confirmation and creates no allocation or receipt before verification', async () => {
  const harness = paymentHarness();
  const result = await harness.service.recordManualPayment(
    actor as never,
    paymentDto('bank_transfer'),
    KEY,
    {},
  );
  assert.equal(result.data.payment_status, 'pending_confirmation');
  assert.equal(result.data.receipt_id, null);
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payment_allocations/.test(statement)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payment_receipts/.test(statement)),
    false,
  );
});

test('bank transfer without proof is rejected before payment writes', async () => {
  const harness = paymentHarness();
  const dto = { ...paymentDto('bank_transfer'), evidence_file_ids: [] };
  await assert.rejects(
    harness.service.recordManualPayment(actor as never, dto, KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'TRANSFER_PROOF_REQUIRED',
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payments/.test(statement)),
    false,
  );
});

test('manual transfer verification consumes pending confirmation in one transaction', async () => {
  const harness = paymentHarness({
    initialIntents: [
      { invoice_id: INVOICE_1, intended_amount: '1800000' },
      { invoice_id: INVOICE_2, intended_amount: '1800000' },
    ],
  });
  const result = await harness.service.verifyManualPayment(
    actor as never,
    PAYMENT_ID,
    { property_id: PROPERTY_ID },
    KEY,
    {},
  );
  assert.equal(result.data.payment_status, 'verified');
  assert.equal(result.data.receipt_id, RECEIPT_ID);
  assert.equal(
    harness.queries.some(
      ({ sql: statement }) =>
        /UPDATE payments SET payment_status='verified'/.test(statement) &&
        /payment_status='pending_confirmation'/.test(statement),
    ),
    true,
  );
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'audit', 'commit', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'audit', 'commit', 'release'],
  );
});

test('pre-activation DP transfer can be verified before automatic lease activation', async () => {
  const harness = paymentHarness({
    paymentPurpose: 'dp',
    invoiceOutstanding: 3_600_000,
    initialIntents: [{ invoice_id: INVOICE_1, intended_amount: '3600000' }],
    contractSettlement: {
      state: 'awaiting_activation',
      activatedAt: null,
      originalDueAt: new Date('2026-11-01T16:59:59.999Z'),
      deadlinePassed: false,
      policyFinalDueAt: new Date('2026-11-01T16:59:59.999Z'),
    },
  });

  const result = await harness.service.verifyManualPayment(
    actor as never,
    PAYMENT_ID,
    { property_id: PROPERTY_ID },
    KEY,
    {},
  );

  assert.equal(result.data.payment_status, 'verified');
  assert.equal(result.data.payment_purpose, 'dp');
  assert.equal(result.data.receipt_id, RECEIPT_ID);
});

test('pre-activation full settlement created by onboarding can be verified', async () => {
  const harness = paymentHarness({
    paymentPurpose: 'rent',
    paymentCode: 'TRX-20260902-000001-LUNAS',
    commandFingerprint: `onboarding:${'a'.repeat(64)}:full_settlement:0`,
    invoiceOutstanding: 3_600_000,
    initialIntents: [{ invoice_id: INVOICE_1, intended_amount: '3600000' }],
    contractSettlement: {
      state: 'awaiting_activation',
      activatedAt: null,
      originalDueAt: new Date('2026-11-01T16:59:59.999Z'),
      deadlinePassed: false,
      policyFinalDueAt: new Date('2026-11-01T16:59:59.999Z'),
    },
  });

  const result = await harness.service.verifyManualPayment(
    actor as never,
    PAYMENT_ID,
    { property_id: PROPERTY_ID },
    KEY,
    {},
  );

  assert.equal(result.data.payment_status, 'verified');
  assert.equal(result.data.payment_purpose, 'rent');
  assert.equal(result.data.receipt_id, RECEIPT_ID);
});

test('ordinary rent transfer remains blocked before lease activation', async () => {
  const harness = paymentHarness({
    paymentPurpose: 'rent',
    commandFingerprint: null,
    invoiceOutstanding: 1_800_000,
    initialIntents: [{ invoice_id: INVOICE_1, intended_amount: '1800000' }],
    contractSettlement: {
      state: 'awaiting_activation',
      activatedAt: null,
      originalDueAt: new Date('2026-11-01T16:59:59.999Z'),
      deadlinePassed: false,
      policyFinalDueAt: new Date('2026-11-01T16:59:59.999Z'),
    },
  });

  await assert.rejects(
    harness.service.verifyManualPayment(
      actor as never,
      PAYMENT_ID,
      { property_id: PROPERTY_ID },
      KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'CONTRACT_SETTLEMENT_NOT_ACTIVE',
  );
});

test('manual transfer rejection is terminal without allocation, receipt, or verification effects', async () => {
  const harness = paymentHarness();
  const result = await harness.service.rejectManualPayment(
    actor as never,
    PAYMENT_ID,
    { property_id: PROPERTY_ID, reason: 'Bukti transfer tidak sesuai' },
    KEY,
    {},
  );
  assert.equal(result.data.payment_status, 'rejected');
  assert.equal(result.data.receipt_id, null);
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payment_allocations/.test(statement)),
    false,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payment_receipts/.test(statement)),
    false,
  );
  assert.equal(
    harness.queries.some(
      ({ sql: statement }) =>
        /UPDATE payments SET payment_status='rejected'/.test(statement) &&
        /payment_status='pending_confirmation'/.test(statement),
    ),
    true,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO business_events/.test(statement)),
    true,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /UPDATE idempotency_commands/.test(statement)),
    true,
  );
  assert.deepEqual(
    harness.events.filter((event) =>
      ['authorized', 'begin', 'audit', 'commit', 'release'].includes(event),
    ),
    ['authorized', 'begin', 'audit', 'commit', 'release'],
  );
});

test('audited cash funds the separate deposit ledger without creating an invoice allocation', async () => {
  const harness = paymentHarness();
  const result = await harness.service.recordManualPayment(
    actor as never,
    {
      property_id: PROPERTY_ID,
      resident_id: RESIDENT_ID,
      lease_id: LEASE_ID,
      method: 'cash',
      payment_purpose: 'security_deposit',
      amount: 1_800_000,
      note: 'Deposit keamanan diterima kas',
      allocations: [],
    },
    KEY,
    {},
  );
  assert.equal(result.data.payment_status, 'verified');
  assert.equal(result.data.payment_purpose, 'security_deposit');
  assert.equal(result.data.receipt_id, RECEIPT_ID);
  assert.equal(
    harness.queries.some(({ sql: statement }) =>
      /INSERT INTO lease_deposit_transactions/.test(statement),
    ),
    true,
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payment_allocations/.test(statement)),
    false,
  );
});

test('DP distribution is deterministic oldest-first and rejects a claim above rent outstanding', async () => {
  const harness = paymentHarness();
  const internal = harness.service as unknown as {
    oldestRentAllocations(
      client: { query: (statement: string, params?: readonly unknown[]) => Promise<unknown> },
      lease: { property_id: string; id: string; resident_id: string },
      amount: number,
    ): Promise<Array<{ invoice_id: string; amount: number }>>;
  };
  const client = {
    query: async () => ({
      rows: [
        { id: INVOICE_1, outstanding: '3600000' },
        { id: INVOICE_2, outstanding: '1800000' },
      ],
      rowCount: 2,
    }),
  };
  const lease = { property_id: PROPERTY_ID, id: LEASE_ID, resident_id: RESIDENT_ID };
  assert.deepEqual(await internal.oldestRentAllocations(client, lease, 4_500_000), [
    { invoice_id: INVOICE_1, amount: 3_600_000 },
    { invoice_id: INVOICE_2, amount: 900_000 },
  ]);
  await assert.rejects(
    internal.oldestRentAllocations(client, lease, 5_400_001),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'PAYMENT_OVERPAYMENT',
  );
});

test('onboarding refuses an empty initial rent payment collection', async () => {
  const harness = paymentHarness();
  await assert.rejects(
    harness.service.recordInitialOnboardingPaymentsInTransaction(harness.client as never, {
      propertyId: PROPERTY_ID,
      residentId: RESIDENT_ID,
      leaseId: LEASE_ID,
      firstRentInvoiceId: INVOICE_1,
      rentPayments: [],
      commandFingerprint: 'a'.repeat(64),
      actor: actor as never,
      context: {},
    }),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'ONBOARDING_RENT_PAYMENT_REQUIRED',
  );
  assert.equal(
    harness.queries.some(({ sql: statement }) => /INSERT INTO payments/.test(statement)),
    false,
  );
});

test('verified onboarding cash returns the receipt reference needed by the success screen', async () => {
  const harness = paymentHarness();
  const result = await harness.service.recordInitialOnboardingPaymentsInTransaction(
    harness.client as never,
    {
      propertyId: PROPERTY_ID,
      residentId: RESIDENT_ID,
      leaseId: LEASE_ID,
      firstRentInvoiceId: INVOICE_1,
      rentPayments: [
        {
          classification: 'down_payment',
          amount: 1_000_000,
          method: 'cash',
          status: 'verified',
          evidenceFileIds: [],
        },
      ],
      commandFingerprint: 'b'.repeat(64),
      actor: actor as never,
      context: {},
    },
  );
  assert.deepEqual(result.receipts, [
    { id: RECEIPT_ID, purpose: 'down_payment', amount: 1_000_000 },
  ]);
});

test('reversal appends compensating allocation and receipt records without mutating original authority', async () => {
  const queries: string[] = [];
  const client = {
    query: async (statement: string) => {
      const normalized = sql(statement);
      queries.push(normalized);
      if (/SELECT id FROM properties/.test(normalized))
        return { rows: [{ id: PROPERTY_ID }], rowCount: 1 };
      if (/INSERT INTO idempotency_commands/.test(normalized))
        return { rows: [{ id: 'command' }], rowCount: 1 };
      if (/SELECT lease_id,resident_id FROM payments/.test(normalized))
        return { rows: [{ lease_id: LEASE_ID, resident_id: RESIDENT_ID }], rowCount: 1 };
      if (/FROM leases l/.test(normalized))
        return {
          rows: [
            {
              id: LEASE_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              occupancy_id: null,
              lease_status: 'active',
              start_date: '2026-08-01',
              end_date: '2027-07-31',
              contract_rent_amount: '21600000',
              dp_required_amount: '5400000',
              security_deposit_required_amount: '1800000',
              payment_plan_type: 'two_month_installments',
              snapshot_monthly_price: '1800000',
              snapshot_room_number: 'RK-01',
              snapshot_kost_type_name: 'Rumah Kost',
              building_code: 'RUKOST-A',
              resident_name: 'Resident Aman',
            },
          ],
          rowCount: 1,
        };
      if (/SELECT id,property_id,resident_id,lease_id,payment_code/.test(normalized))
        return {
          rows: [
            {
              id: PAYMENT_ID,
              property_id: PROPERTY_ID,
              resident_id: RESIDENT_ID,
              lease_id: LEASE_ID,
              payment_code: 'PAY-ORIGINAL',
              payment_method: 'cash',
              payment_status: 'verified',
              payment_purpose: 'rent',
              amount: '1800000',
              paid_at: new Date('2026-08-01T01:00:00.000Z'),
              verified_at: new Date('2026-08-01T01:00:00.000Z'),
              proof_id: null,
              reference_number: null,
              notes: null,
            },
          ],
          rowCount: 1,
        };
      if (/FROM payment_reversals WHERE payment_id/.test(normalized))
        return { rows: [], rowCount: 0 };
      if (/FROM payment_allocations WHERE payment_id/.test(normalized))
        return {
          rows: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              invoice_id: INVOICE_1,
              allocated_amount: '1800000',
            },
          ],
          rowCount: 1,
        };
      if (/SELECT id FROM invoices WHERE/.test(normalized))
        return { rows: [{ id: INVOICE_1 }], rowCount: 1 };
      if (/SELECT next_billing_document_number/.test(normalized))
        return {
          rows: [{ document_code: '001-08/PEMBATALAN-REFUND/GSH1/2026' }],
          rowCount: 1,
        };
      if (/SELECT next_financial_transaction_code/.test(normalized))
        return {
          rows: [{ code: 'BTL-20260802-000001-CANCEL' }],
          rowCount: 1,
        };
      if (/issuer\.display_name AS issued_by_name/.test(normalized))
        return { rows: [receiptAuthorityRow()], rowCount: 1 };
      if (/INSERT INTO payment_receipts/.test(normalized))
        return { rows: [{ id: RECEIPT_ID }], rowCount: 1 };
      if (/INSERT INTO payment_reversals/.test(normalized))
        return {
          rows: [{ id: REVERSAL_ID, reversed_at: new Date('2026-08-02T01:00:00.000Z') }],
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new W06BillingService(
    {
      transaction: async (operation: (value: typeof client) => Promise<unknown>) =>
        operation(client),
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {
      write: async (_input: unknown, transactionClient: unknown) =>
        assert.equal(transactionClient, client),
    } as never,
  );
  const result = await service.reversePayment(
    actor as never,
    PAYMENT_ID,
    { property_id: PROPERTY_ID, reason: 'Kesalahan pencatatan pembayaran kas' },
    KEY,
    {},
  );
  assert.equal(result.data.reversal_id, REVERSAL_ID);
  assert.equal(
    queries.some((statement) => /INSERT INTO payment_reversal_allocations/.test(statement)),
    true,
  );
  assert.equal(
    queries.some((statement) => /INSERT INTO payment_receipts/.test(statement)),
    true,
  );
  assert.equal(
    queries.some((statement) => /UPDATE payments|DELETE FROM payments/.test(statement)),
    false,
  );
  assert.equal(
    queries.some((statement) =>
      /UPDATE payment_allocations|DELETE FROM payment_allocations/.test(statement),
    ),
    false,
  );
});

test('over-allocation fails before payment creation and audit failure rolls back every effect', async () => {
  const over = paymentHarness({ invoiceOutstanding: 1_000_000 });
  await assert.rejects(
    over.service.recordManualPayment(actor as never, paymentDto(), KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'PAYMENT_OVER_ALLOCATION',
  );
  assert.equal(
    over.queries.some(({ sql: statement }) => /INSERT INTO payments/.test(statement)),
    false,
  );

  const sentinel = new Error('audit unavailable');
  const rollback = paymentHarness({ auditFailure: sentinel });
  await assert.rejects(
    rollback.service.recordManualPayment(actor as never, paymentDto(), KEY, {}),
    sentinel,
  );
  assert.deepEqual(rollback.events.slice(-2), ['rollback', 'release']);
});

test('contract settlement allows partial payment through D+7 and requires full settlement after the partial-payment window closes', async () => {
  const beforeDeadline = paymentHarness({
    contractSettlement: {
      originalDueAt: new Date('2027-03-01T00:00:00.000Z'),
      deadlinePassed: false,
    },
  });
  const partial = await beforeDeadline.service.recordManualPayment(
    actor as never,
    contractSettlementPaymentDto(1_000_000),
    KEY,
    {},
  );
  assert.equal(partial.data.amount, 1_000_000);
  assert.equal(
    beforeDeadline.queries.some(({ sql: statement }) =>
      /SELECT now\(\) > CASE WHEN \$2::timestamptz IS NULL THEN \$1::timestamptz \+ INTERVAL '7 days' ELSE \$2::timestamptz END AS passed/.test(
        statement,
      ),
    ),
    true,
  );

  const afterDeadline = paymentHarness({
    contractSettlement: {
      originalDueAt: new Date('2026-03-01T00:00:00.000Z'),
      deadlinePassed: true,
    },
  });
  await assert.rejects(
    afterDeadline.service.recordManualPayment(
      actor as never,
      contractSettlementPaymentDto(1_000_000),
      KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'CONTRACT_SETTLEMENT_FULL_PAYMENT_REQUIRED',
  );
  assert.equal(
    afterDeadline.queries.some(({ sql: statement }) => /INSERT INTO payments/.test(statement)),
    false,
  );
});

test('v2 settlement allows instalments before final checkpoint and locks the exact live balance after it', async () => {
  const beforeFinal = paymentHarness({
    contractSettlement: {
      originalDueAt: new Date('2026-11-28T16:59:59.999Z'),
      policyFinalDueAt: new Date('2026-11-28T16:59:59.999Z'),
      deadlinePassed: false,
    },
  });
  const partial = await beforeFinal.service.recordManualPayment(
    actor as never,
    contractSettlementPaymentDto(1_000_000),
    KEY,
    {},
  );
  assert.equal(partial.data.amount, 1_000_000);

  const afterFinal = paymentHarness({
    contractSettlement: {
      originalDueAt: new Date('2026-11-28T16:59:59.999Z'),
      policyFinalDueAt: new Date('2026-11-28T16:59:59.999Z'),
      deadlinePassed: true,
    },
  });
  await assert.rejects(
    afterFinal.service.recordManualPayment(
      actor as never,
      contractSettlementPaymentDto(1_000_000),
      KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'CONTRACT_SETTLEMENT_FULL_PAYMENT_REQUIRED',
  );

  const exactBalance = paymentHarness({
    invoiceOutstanding: 1_000_000,
    contractSettlement: {
      originalDueAt: new Date('2026-11-28T16:59:59.999Z'),
      policyFinalDueAt: new Date('2026-11-28T16:59:59.999Z'),
      deadlinePassed: true,
      outstanding: 1_000_000,
    },
  });
  const settled = await exactBalance.service.recordManualPayment(
    actor as never,
    contractSettlementPaymentDto(1_000_000),
    KEY,
    {},
  );
  assert.equal(settled.data.amount, 1_000_000);
});

test('a granted extension keeps partial payment available only until its own deadline', async () => {
  const duringExtension = paymentHarness({
    contractSettlement: {
      originalDueAt: new Date('2026-03-01T00:00:00.000Z'),
      extensionDueAt: new Date('2027-03-15T23:59:59.999Z'),
      deadlinePassed: false,
    },
  });
  const partial = await duringExtension.service.recordManualPayment(
    actor as never,
    contractSettlementPaymentDto(1),
    KEY,
    {},
  );
  assert.equal(partial.data.amount, 1);

  const afterExtension = paymentHarness({
    contractSettlement: {
      originalDueAt: new Date('2026-03-01T00:00:00.000Z'),
      extensionDueAt: new Date('2026-03-15T23:59:59.999Z'),
      deadlinePassed: true,
    },
  });
  await assert.rejects(
    afterExtension.service.recordManualPayment(
      actor as never,
      contractSettlementPaymentDto(1),
      KEY,
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'CONTRACT_SETTLEMENT_FULL_PAYMENT_REQUIRED',
  );
  assert.equal(
    afterExtension.queries.some(({ sql: statement }) => /INSERT INTO payments/.test(statement)),
    false,
  );
});

test('property authorization happens before transaction and exact idempotency replay skips domain writes', async () => {
  const sentinel = new Error('denied');
  const denied = paymentHarness({ authorizeFailure: sentinel });
  await assert.rejects(
    denied.service.recordManualPayment(actor as never, paymentDto(), KEY, {}),
    sentinel,
  );
  assert.equal(denied.events.includes('begin'), false);

  const dto = paymentDto('bank_transfer');
  const fingerprint = createHash('sha256').update(JSON.stringify({ dto })).digest('hex');
  const replay = paymentHarness({ replayFingerprint: fingerprint });
  const result = await replay.service.recordManualPayment(actor as never, dto, KEY, {});
  assert.equal(result.data.payment_code, 'PAY-REPLAY');
  assert.equal(
    replay.queries.some(({ sql: statement }) => /INSERT INTO payments/.test(statement)),
    false,
  );

  const mismatch = paymentHarness({ replayFingerprint: 'different' });
  await assert.rejects(
    mismatch.service.recordManualPayment(actor as never, dto, KEY, {}),
    (error: unknown) =>
      error instanceof Error &&
      'getResponse' in error &&
      (error as { getResponse: () => { code: string } }).getResponse().code ===
        'IDEMPOTENCY_KEY_REUSED',
  );
  assert.equal(
    mismatch.queries.some(({ sql: statement }) => /FROM leases l/.test(statement)),
    false,
  );
});

void test(
  'migration 027 executes after the pre-W06 schema with convergent replay and atomic rollback',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w06-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w06-rollback-'));
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
    const run = (port: number, statement: string) =>
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
          input: statement,
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 32 * 1024 * 1024,
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
    const migrationDirectory = resolve(root, 'src/infrastructure/database/migrations');
    const files = readdirSync(migrationDirectory)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort();
    const w06MigrationIndex = files.indexOf('027_billing_manual_payments.sql');
    assert.notEqual(w06MigrationIndex, -1, 'migration 027 must remain in the manifest sequence');
    const prior = files
      .slice(0, w06MigrationIndex)
      .map((name) => {
        const source = readFileSync(resolve(migrationDirectory, name), 'utf8');
        // Baseline 023 reads this soft-delete column but no prior canonical migration creates it.
        // Keep historical migrations immutable and supply only the missing pre-W06 test precondition.
        return name === '022_kost_type_commercial_authority.sql'
          ? `${source}\nALTER TABLE kost_type_rules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`
          : source;
      })
      .join('\n');
    const exactProof = `
      DO $proof$
      BEGIN
        IF to_regclass('public.payment_allocation_intents') IS NULL
           OR to_regclass('public.payment_receipts') IS NULL
           OR to_regclass('public.payment_reversals') IS NULL
           OR to_regclass('public.payment_reversal_allocations') IS NULL
           OR to_regclass('public.payment_evidence_files') IS NULL
           OR to_regclass('public.invoice_evidence_files') IS NULL
        THEN RAISE EXCEPTION 'W06_TABLE_AUTHORITY_MISSING'; END IF;
        IF (SELECT is_nullable FROM information_schema.columns
             WHERE table_schema='public' AND table_name='invoices' AND column_name='occupancy_id') <> 'YES'
           OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_schedule_snapshot_check')
           OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_invoices_w06_installment')
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_w06_verified_payment_immutable' AND NOT tgisinternal)
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_w06_invoice_authority' AND NOT tgisinternal)
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_w06_deposit_non_negative' AND NOT tgisinternal)
           OR (SELECT column_default FROM information_schema.columns
               WHERE table_schema='public' AND table_name='payments' AND column_name='payment_status')
              NOT LIKE '%pending_confirmation%'
           OR NOT EXISTS (
               SELECT 1 FROM pg_constraint
                WHERE conname='payments_status_check'
                  AND pg_get_constraintdef(oid) LIKE '%pending_confirmation%'
                  AND pg_get_constraintdef(oid) LIKE '%rejected%'
                  AND pg_get_constraintdef(oid) LIKE '%reversed%'
           )
        THEN RAISE EXCEPTION 'W06_CONSTRAINT_AUTHORITY_MISSING'; END IF;
      END
      $proof$;
    `;
    try {
      initialize(replayDirectory);
      start(replayDirectory, replayPort);
      const replay = run(
        replayPort,
        `${prior}\n${migration}\n${exactProof}\n${migration}\n${exactProof}`,
      );
      assert.equal(
        replay.status,
        0,
        `disposable first-apply/replay proof failed: ${replay.stderr || replay.stdout}`,
      );

      initialize(rollbackDirectory);
      start(rollbackDirectory, rollbackPort);
      const priorResult = run(rollbackPort, prior);
      assert.equal(priorResult.status, 0, 'pre-W06 migration sequence failed');
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        `DO $$ BEGIN RAISE EXCEPTION 'W06_SYNTHETIC_ROLLBACK'; END $$; COMMIT;`,
      );
      assert.notEqual(failedMigration, migration);
      const failed = run(rollbackPort, failedMigration);
      assert.notEqual(failed.status, 0, 'synthetic W06 migration failure was not triggered');
      const rollbackProbe = run(
        rollbackPort,
        `DO $rollback$
         BEGIN
           IF to_regclass('public.payment_allocation_intents') IS NOT NULL
              OR to_regclass('public.payment_receipts') IS NOT NULL
              OR to_regclass('public.payment_reversals') IS NOT NULL
              OR to_regclass('public.payment_reversal_allocations') IS NOT NULL
              OR to_regclass('public.payment_evidence_files') IS NOT NULL
              OR to_regclass('public.invoice_evidence_files') IS NOT NULL
              OR EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='invoices'
                   AND column_name IN ('installment_id','invoice_purpose','authority_source','credit_amount')
              )
              OR (SELECT is_nullable FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='invoices' AND column_name='occupancy_id') <> 'NO'
           THEN RAISE EXCEPTION 'W06_MIGRATION_ROLLBACK_INCOMPLETE'; END IF;
         END
         $rollback$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'W06 rollback probe failed');
    } finally {
      stop(replayDirectory);
      stop(rollbackDirectory);
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
